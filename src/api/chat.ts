/**
 * 对话 API 模块
 * 与后端 server.go 中的 /api/chat、/api/chat/completions、/api/ip 端点对应。
 *
 * 关键设计：sendChatMessageStream 采用 SSE（Server-Sent Events）流式读取，
 * 由 fetch + ReadableStream 解析 text/event-stream 帧，逐 chunk 回调到上层。
 *   协议帧（与 README 一致）：
 *     data: {"choices":[{"delta":{"content":"..."}}]}\n\n
 *     data: [DONE]\n\n
 *
 * 兼容性：部分后端会把 delta 直接写成字符串（"H"），这里也兼容解析；
 * 残缺帧（跨 chunk 边界）会被 buffer 住直到换行补齐，避免把半个 JSON 抛给 JSON.parse。
 */

import request from './index'
import type { ChatRequest, ChatResponse } from '@/types/chat'

/** SSE 帧（解析后的最小单元） */
interface SseFrame {
  /** event 名（默认 message，可省略），例如 start / delta / finish */
  event: string
  /** 原始 data 行（去前缀，多行用 \n 拼接） */
  data: string
}

/** 简易 SSE 行缓冲：把跨 chunk 的 `data: ...` 攒齐再交给 parseSseFrame */
function makeSseBuffer() {
  let buffer = ''
  return {
    /**
     * 把一段原始字节喂进来，返回解析出的一批完整 SSE 帧
     * （只有含完整 \n\n 终止符的 data 行才会被吐出；否则保留在 buffer）
     */
    push(chunk: string): SseFrame[] {
      // 关键：把 \r\n 和裸 \r 归一化成 \n，否则后端按 HTTP 规范写出
      // "data: ...\r\n\r\n" 时，indexOf('\n\n') 永远 -1，buffer 越积越大，
      // 表现就是"前端拿到流却一次性才显示"。归一化后用 \n\n 切分就对得上
      // SSE 规范（事件以空行结束）。
      buffer += chunk.replace(/\r\n/g, '\n').replace(/(?<!\n)\r/g, '\n')
      const out: SseFrame[] = []
      // 按 \n\n 切分（SSE 事件以空行结束）
      let sepIndex = buffer.indexOf('\n\n')
      while (sepIndex !== -1) {
        const event = buffer.slice(0, sepIndex)
        buffer = buffer.slice(sepIndex + 2)
        const frame = parseSseEvent(event)
        if (frame) out.push(frame)
        sepIndex = buffer.indexOf('\n\n')
      }
      return out
    },
    /** 强制 flush（流结束 / 出错时调用） */
    flush(): SseFrame[] {
      if (!buffer.trim()) {
        buffer = ''
        return []
      }
      const event = buffer
      buffer = ''
      const frame = parseSseEvent(event)
      return frame ? [frame] : []
    },
  }
}

/** 把一段 SSE event 文本解析成一个 {event,data} 帧。
 * 忽略注释行（`:` 开头），其余按 SSE 规范 `field: value` 解析；
 * 这里只关心 `event` 和 `data`，其它字段（id/retry）丢弃。 */
function parseSseEvent(eventText: string): SseFrame | null {
  let eventName = 'message' // SSE 默认事件名
  const dataLines: string[] = []
  for (const rawLine of eventText.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (!line || line.startsWith(':')) continue
    // SSE 规范：field 名后接冒号，空格可省略
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const field = line.slice(0, idx)
    let value = line.slice(idx + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') eventName = value || 'message'
    else if (field === 'data') dataLines.push(value)
  }
  if (dataLines.length === 0 && eventName === 'message') return null
  return { event: eventName, data: dataLines.join('\n') }
}

/** 从 SSE 帧里提取增量内容。兼容 OpenAI 风格与裸字符串两种格式 */
function extractDeltaContent(data: string): string {
  const trimmed = data.trim()
  if (!trimmed) return ''
  // OpenAI 兼容格式：{"choices":[{"delta":{"content":"..."}}]}
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        choices?: Array<{ delta?: { content?: string } }>
      }
      const content = parsed.choices?.[0]?.delta?.content
      if (typeof content === 'string') return content
    } catch {
      // 不是合法 JSON，落到下方兜底
    }
  }
  // 兜底：直接把整段 data 当作内容（兼容老式 demo 后端）
  return trimmed
}

export function getClientIP(): Promise<string> {
  return request.get('/ip')
}

export function sendChatMessage(payload: ChatRequest): Promise<ChatResponse> {
  return request.post('/chat/completions', payload)
}

/**
 * SSE 流式对话：返回 AbortController，调用方可在需要时中止。
 * - onChunk: 每个增量片段回调一次（已按字符/词为单位切好）
 * - onDone: 收到 [DONE] 或流自然结束
 * - onError: 解析 / 网络错误（已忽略 AbortError，避免把主动取消当成异常）
 * - onImageUrl: 兼容老式 JSON 包络里的图片字段
 */
export function sendChatMessageStream(
  payload: ChatRequest,
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: Error) => void,
  onImageUrl?: (imageUrl: string) => void,
): AbortController {
  const controller = new AbortController()
  const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'
  const url = `${baseURL}/chat`
  const body = JSON.stringify({ ...payload, stream: true })

  console.info('[sse] → POST %s, sessionId=%s', url, payload.sessionId)

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body,
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const message =
          (errorData as { message?: string }).message || `请求失败 (${response.status})`
        throw new Error(message)
      }

      const contentType = response.headers.get('content-type') || ''
      // 部分后端即便声明 SSE 也会一次性返回 JSON；优先按 SSE 处理，但保留 JSON 兜底
      if (contentType.includes('application/json') && !contentType.includes('event-stream')) {
        const data = await response.json()
        const reply =
          (data as { data?: { reply?: string; imageUrl?: string } }).data?.reply ?? ''
        const imageUrl = (data as { data?: { imageUrl?: string } }).data?.imageUrl
        if (reply) onChunk(reply)
        if (imageUrl) onImageUrl?.(imageUrl)
        onDone()
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        console.warn('[sse] response.body is null, treat as done')
        onDone()
        return
      }
      const decoder = new TextDecoder('utf-8')
      const sse = makeSseBuffer()
      let receivedAny = false
      let frameCount = 0

      try {
        let finished = false
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            // 收尾：把 buffer 残余帧吐出来（兼容服务器未以 \n\n 收尾的情况）
            const tail = sse.flush()
            for (const f of tail) {
              handleFrame(
                f,
                onChunk,
                onImageUrl,
                () => {
                  finished = true
                },
                () => (receivedAny = true),
              )
            }
            frameCount += tail.length
            break
          }
          const text = decoder.decode(value, { stream: true })
          if (text) {
            const frames = sse.push(text)
            frameCount += frames.length
            for (const f of frames) {
              handleFrame(
                f,
                onChunk,
                onImageUrl,
                () => {
                  finished = true
                },
                () => (receivedAny = true),
              )
            }
            // 后端发 finish 帧就算结束，不再等流关闭
            if (finished) break
          }
        }
        console.info(
          '[sse] ← stream closed, receivedAny=%s, frames=%d, finished=%s',
          receivedAny,
          frameCount,
          finished,
        )
      } finally {
        try {
          reader.releaseLock()
        } catch {
          /* ignore */
        }
      }
      onDone()
    })
    .catch((error) => {
      if (error?.name === 'AbortError') {
        console.info('[sse] aborted by caller')
        return
      }
      console.warn('[sse] error: %s', error?.message ?? String(error))
      onError(error instanceof Error ? error : new Error(String(error)))
    })

  return controller
}

/** 单帧处理：完成判定 + 内容提取 + 上报。
 * 兼容三种后端协议：
 *   1. OpenAI 风格（默认事件 / 无 event:）：
 *      data: {"choices":[{"delta":{"content":"..."}}]}
 *   2. 实际后端 event 风格：
 *      event: start   data: {"sessionId":"..."}
 *      event: delta   data: {"delta":"增量片段","reply":"累积文本"}
 *      event: finish  data: {"reply":"完整文本","sessionId":"..."}
 *   3. 老式 JSON 包络：{data:{reply, imageUrl}}
 *
 * 关键：finish 帧**不**调用 onChunk，避免与已累积的 delta 文本重复。 */
function handleFrame(
  frame: SseFrame,
  onChunk: (chunk: string) => void,
  onImageUrl: ((imageUrl: string) => void) | undefined,
  onFinish: ((payload: { reply?: string; sessionId?: string }) => void) | undefined,
  markReceived: () => void,
) {
  const data = frame.data.trim()
  const event = frame.event

  // OpenAI 风格的结束哨兵
  if (data === '[DONE]') return

  // 没有任何 payload 时，仅当是 start 这种"握手帧"打日志即可
  if (!data) {
    if (event === 'start') console.info('[sse] ← event=start')
    return
  }
  markReceived()

  // ----- 实际后端的 event 风格 -----
  if (event === 'delta' || event === 'message') {
    if (data.startsWith('{')) {
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>
          delta?: string
          reply?: string
          imageUrl?: string
          sessionId?: string
          data?: { reply?: string; imageUrl?: string }
        }
        const oaContent = parsed.choices?.[0]?.delta?.content
        if (typeof oaContent === 'string' && oaContent) {
          onChunk(oaContent)
          return
        }
        // 实际后端：取 delta 增量；若只有 reply 字段也作为增量（兼容老格式）
        const inc = parsed.delta ?? parsed.reply
        if (typeof inc === 'string' && inc) {
          onChunk(inc)
        }
        if (parsed.imageUrl && onImageUrl) onImageUrl(parsed.imageUrl)
        return
      } catch {
        // 非法 JSON：落到下方纯文本兜底
      }
    }
    onChunk(extractDeltaContent(data))
    return
  }

  if (event === 'start') {
    console.info('[sse] ← event=start, data=%s', data.slice(0, 80))
    return
  }

  if (event === 'finish' || event === 'done' || event === 'complete') {
    // 关键：finish 帧只用作结束信号，**不再追加 reply**，
    // 否则 delta 已拼好全文，再追加一次就会出现重复文本。
    let payload: { reply?: string; sessionId?: string } | undefined
    if (data.startsWith('{')) {
      try {
        const parsed = JSON.parse(data) as { reply?: string; sessionId?: string }
        payload = { reply: parsed.reply, sessionId: parsed.sessionId }
      } catch {
        /* ignore */
      }
    }
    console.info('[sse] ← event=finish, hasReply=%s', Boolean(payload?.reply))
    onFinish?.(payload ?? {})
    return
  }

  // 未知 / 默认事件类型：尝试 OpenAI 包络 → 老式 JSON 包络 → 纯文本
  if (data.startsWith('{')) {
    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string } }>
        data?: { reply?: string; imageUrl?: string }
      }
      if (parsed.choices?.[0]?.delta?.content) {
        onChunk(parsed.choices[0].delta.content)
        return
      }
      if (parsed.data?.reply) onChunk(parsed.data.reply)
      if (parsed.data?.imageUrl && onImageUrl) onImageUrl(parsed.data.imageUrl)
      return
    } catch {
      /* fallthrough */
    }
  }
  onChunk(extractDeltaContent(data))
}
