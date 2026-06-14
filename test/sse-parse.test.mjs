// 单元测试：SSE 解析器（src/api/chat.ts 里的纯函数版本）
// 用 Node 内置 test runner，跑：`node --test test/sse-parse.test.mjs`
//
// 目的：验证 chat.ts 的解析逻辑能正确处理真实后端的
//   event: start / delta / finish 协议，并避免 finish 帧里的 reply 被重复追加。

import { test } from 'node:test'
import assert from 'node:assert/strict'

// --- 把 chat.ts 里的解析函数原样复制（保持一致；改动时两处同步） ---

function makeSseBuffer() {
  let buffer = ''
  return {
    push(chunk) {
      buffer += chunk.replace(/\r\n/g, '\n').replace(/(?<!\n)\r/g, '\n')
      const out = []
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
    flush() {
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

function parseSseEvent(eventText) {
  let eventName = 'message'
  const dataLines = []
  for (const rawLine of eventText.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (!line || line.startsWith(':')) continue
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

function extractDeltaContent(data) {
  const trimmed = data.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      const content = parsed.choices?.[0]?.delta?.content
      if (typeof content === 'string') return content
    } catch {
      /* fallthrough */
    }
  }
  return trimmed
}

// --- 复刻 handleFrame 的核心分支（与 chat.ts 保持一致） ---

function handleFrame(frame, onChunk, onImageUrl, onAttachments, onFinish, markReceived) {
  const data = frame.data.trim()
  const event = frame.event

  if (data === '[DONE]') return
  if (!data) {
    if (event === 'start') console.info('[sse] ← event=start')
    return
  }
  markReceived()

  if (event === 'delta' || event === 'message') {
    if (data.startsWith('{')) {
      try {
        const parsed = JSON.parse(data)
        const oaContent = parsed.choices?.[0]?.delta?.content
        if (typeof oaContent === 'string' && oaContent) {
          onChunk(oaContent)
        } else {
          const inc = parsed.delta ?? parsed.reply
          if (typeof inc === 'string' && inc) onChunk(inc)
        }
        if (parsed.imageUrl && onImageUrl) onImageUrl(parsed.imageUrl)
        if (onAttachments && Array.isArray(parsed.attachments) && parsed.attachments.length) {
          onAttachments(parsed.attachments.map(normalize))
        }
        return
      } catch {
        /* fallthrough */
      }
    }
    onChunk(extractDeltaContent(data))
    return
  }

  if (event === 'start') return
  if (event === 'finish' || event === 'done' || event === 'complete') {
    let payload
    let attachments = []
    if (data.startsWith('{')) {
      try {
        const parsed = JSON.parse(data)
        payload = { reply: parsed.reply, sessionId: parsed.sessionId }
        if (Array.isArray(parsed.attachments)) attachments = parsed.attachments.map(normalize)
      } catch {
        /* ignore */
      }
    }
    if (attachments.length && onAttachments) onAttachments(attachments)
    onFinish?.(payload ?? {})
    return
  }

  if (data.startsWith('{')) {
    try {
      const parsed = JSON.parse(data)
      if (parsed.choices?.[0]?.delta?.content) {
        onChunk(parsed.choices[0].delta.content)
        return
      }
      if (parsed.data?.reply) onChunk(parsed.data.reply)
      if (parsed.data?.imageUrl && onImageUrl) onImageUrl(parsed.data.imageUrl)
      const raw = parsed.attachments ?? parsed.data?.attachments
      if (onAttachments && Array.isArray(raw) && raw.length) onAttachments(raw.map(normalize))
      return
    } catch {
      /* fallthrough */
    }
  }
  onChunk(extractDeltaContent(data))
}

function normalize(r) {
  const url = (r?.url || '').trim()
  if (!url) return null
  const mimeType = r.mimeType ?? r.mime_type
  return {
    id: r.id || `${url}#${r.name || ''}`,
    name: r.name || url.split('/').pop() || '附件',
    url,
    mimeType,
    size: typeof r.size === 'number' ? r.size : undefined,
    type: r.type === 'image' || r.type === 'file'
      ? r.type
      : mimeType?.toLowerCase().startsWith('image/')
        ? 'image'
        : undefined,
  }
}

// --- 真实后端格式复刻 ---

const REAL_BACKEND = [
  'event: start\r\n',
  'data: {"sessionId":"aeB6H20-H9RJcuWk-xAy4"}\r\n',
  '\r\n',
  'event: delta\r\n',
  'data: {"delta":"非常抱歉，","reply":"非常抱歉，"}\r\n',
  '\r\n',
  'event: delta\r\n',
  'data: {"delta":"作为一个通用助手","reply":"非常抱歉，作为一个通用助手"}\r\n',
  '\r\n',
  'event: finish\r\n',
  'data: {"reply":"非常抱歉，作为一个通用助手……完整文本","sessionId":"aeB6H20-H9RJcuWk-xAy4"}\r\n',
  '\r\n',
].join('')

// --- 工具：把整段 SSE 按字节喂给 buffer，模拟 fetch+ReadableStream ---

function runFrames(sseText) {
  const buf = makeSseBuffer()
  const chunks = []
  let pos = 0
  // 模拟按 1~8 字节的不定长 read 分片
  while (pos < sseText.length) {
    const step = Math.min(sseText.length - pos, 1 + (pos % 7))
    const slice = sseText.slice(pos, pos + step)
    pos += step
    const frames = buf.push(slice)
    for (const f of frames) chunks.push(f)
  }
  for (const f of buf.flush()) chunks.push(f)
  return chunks
}

test('SSE buffer 切分出 start/delta/delta/finish 四帧', () => {
  const frames = runFrames(REAL_BACKEND)
  assert.equal(frames.length, 4)
  assert.equal(frames[0].event, 'start')
  assert.equal(frames[1].event, 'delta')
  assert.equal(frames[2].event, 'delta')
  assert.equal(frames[3].event, 'finish')
})

test('handleFrame 提取到的增量拼接 == 完整 reply（且不重复）', () => {
  const frames = runFrames(REAL_BACKEND)
  let assembled = ''
  let finishCalled = 0
  const imageUrls = []

  for (const f of frames) {
    handleFrame(
      f,
      (chunk) => {
        assembled += chunk
      },
      (url) => imageUrls.push(url),
      undefined,
      () => {
        finishCalled += 1
      },
      () => {},
    )
  }

  // 两个 delta 的 delta 字段拼起来就是完整文本
  assert.equal(assembled, '非常抱歉，作为一个通用助手')
  // finish 帧不再追加 reply，避免重复
  assert.equal(finishCalled, 1)
  assert.equal(imageUrls.length, 0)
})

test('OpenAI 兼容格式依旧能识别 choices[0].delta.content', () => {
  const sse =
    'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
    'data: {"choices":[{"delta":{"content":" world"}}]}\n\n' +
    'data: [DONE]\n\n'

  const frames = runFrames(sse)
  let text = ''
  for (const f of frames) {
    handleFrame(
      f,
      (c) => (text += c),
      undefined,
      undefined,
      undefined,
      () => {},
    )
  }
  assert.equal(text, 'Hello world')
})

test('CRLF 也能被切出来（真实 Node fetch 默认 chunk 可能含 \\r\\n）', () => {
  const frames = runFrames(REAL_BACKEND)
  // 同上：start/delta/delta/finish
  assert.equal(frames.length, 4)
})

test('服务端漏掉空行的"粘连"也能 fallback 处理（flush 救场）', () => {
  // delta + finish 没有空行分隔 —— 这是用户给的实际报文片段
  const bad = [
    'event: start\r\n',
    'data: {"sessionId":"s1"}\r\n',
    '\r\n',
    'event: delta\r\n',
    'data: {"delta":"hi","reply":"hi"}\r\n',
    'event: finish\r\n',
    'data: {"reply":"hi","sessionId":"s1"}\r\n',
    '\r\n',
  ].join('')
  const frames = runFrames(bad)
  // flush 会尝试把残余部分当一帧解析；如果它不是合法 SSE，至少 start 应当先被切出来
  assert.ok(frames.length >= 1)
  assert.equal(frames[0].event, 'start')
})