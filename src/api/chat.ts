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
  /** 原始 data 行（去前缀） */
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
      buffer += chunk
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

/** 把一段 SSE event 文本解析成一个 data 帧（忽略注释行 / event: / id: 等） */
function parseSseEvent(eventText: string): SseFrame | null {
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
    if (field === 'data') dataLines.push(value)
  }
  if (dataLines.length === 0) return null
  return { data: dataLines.join('\n') }
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

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            // 收尾：把 buffer 残余帧吐出来（兼容服务器未以 \n\n 收尾的情况）
            const tail = sse.flush()
            for (const f of tail) handleFrame(f, onChunk, onImageUrl, () => (receivedAny = true))
            break
          }
          const text = decoder.decode(value, { stream: true })
          if (text) {
            const frames = sse.push(text)
            for (const f of frames) handleFrame(f, onChunk, onImageUrl, () => (receivedAny = true))
          }
        }
        console.info('[sse] ← stream closed, receivedAny=%s', receivedAny)
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

/** 单帧处理：完成判定 + 内容提取 + 上报 */
function handleFrame(
  frame: SseFrame,
  onChunk: (chunk: string) => void,
  onImageUrl: ((imageUrl: string) => void) | undefined,
  markReceived: () => void,
) {
  const data = frame.data.trim()
  if (!data) return
  if (data === '[DONE]') {
    // 不在这里 onDone：reader.read 返回 done 时统一处理，避免漏帧
    return
  }
  markReceived()
  // 兼容老式 JSON 包络：{code, data:{reply, imageUrl}}
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
      if (parsed.data?.reply) {
        onChunk(parsed.data.reply)
      }
      if (parsed.data?.imageUrl && onImageUrl) {
        onImageUrl(parsed.data.imageUrl)
      }
      return
    } catch {
      // 非法 JSON 当作纯文本处理
    }
  }
  onChunk(extractDeltaContent(data))
}
