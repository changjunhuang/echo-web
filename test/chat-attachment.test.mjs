// 单元测试：新协议下 resource 事件归一化为 ChatAttachment
// 跑：`node --test test/chat-attachment.test.mjs`
//
// 覆盖目标：
//   1. resource 帧 → onResource 收到规范化的 ChatAttachment
//   2. modality 派发：image / audio / video / file
//   3. file_id + chunk_index 兜底为 id
//   4. 缺 url 的非法资源被静默丢弃
//   5. resolveUrl 把裸域名补成 https://

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// --- 与 chat.ts 严格对齐的复刻实现 ---

function makeSseBuffer() {
  let buffer = ''
  return {
    push(chunk) {
      buffer += chunk
      const out = []
      let sepIndex = findEventSeparator(buffer)
      while (sepIndex !== -1) {
        const sepLen = separatorLength(buffer, sepIndex)
        const event = buffer.slice(0, sepIndex)
        buffer = buffer.slice(sepIndex + sepLen)
        const frame = parseSseEvent(event)
        if (frame) out.push(frame)
        sepIndex = findEventSeparator(buffer)
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

function findEventSeparator(buf) {
  const i1 = buf.indexOf('\n\n')
  if (i1 !== -1) return i1
  const i2 = buf.indexOf('\r\n\r\n')
  if (i2 !== -1) return i2
  const i3 = buf.indexOf('\n\r\n')
  if (i3 !== -1) return i3
  return buf.indexOf('\r\n\n')
}

function separatorLength(buf, idx) {
  if (buf.startsWith('\n\n', idx)) return 2
  if (buf.startsWith('\r\n\r\n', idx)) return 4
  if (buf.startsWith('\n\r\n', idx)) return 3
  if (buf.startsWith('\r\n\n', idx)) return 3
  return 2
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
  if (dataLines.length === 0) return null
  return { event: eventName, data: dataLines.join('\n') }
}

function safeJson(s) {
  const t = s.trim()
  if (!t || !t.startsWith('{')) return null
  try {
    const p = JSON.parse(t)
    return p && typeof p === 'object' ? p : null
  } catch {
    return null
  }
}

function parseResource(data) {
  const obj = safeJson(data)
  if (!obj) return null
  const url = typeof obj.url === 'string' ? obj.url.trim() : ''
  if (!url) return null
  const name =
    (typeof obj.display_name === 'string' && obj.display_name.trim()) ||
    (typeof obj.name === 'string' && obj.name.trim()) ||
    url.split('/').pop() ||
    '附件'
  const modality =
    obj.modality === 'image' || obj.modality === 'audio' || obj.modality === 'video' || obj.modality === 'file'
      ? obj.modality
      : 'file'
  return {
    id: typeof obj.event_id === 'string' && obj.event_id
      ? obj.event_id
      : `${typeof obj.file_id === 'string' ? obj.file_id : url}#${obj.chunk_index ?? 0}`,
    name,
    displayName: typeof obj.display_name === 'string' ? obj.display_name : name,
    url,
    fileId: typeof obj.file_id === 'string' ? obj.file_id : undefined,
    modality,
    mimeType: typeof obj.mime_type === 'string' ? obj.mime_type : undefined,
    chunkIndex: typeof obj.chunk_index === 'number' ? obj.chunk_index : 0,
    totalChunks: typeof obj.total_chunks === 'number' ? obj.total_chunks : 1,
    sizeBytes: typeof obj.size_bytes === 'number' ? obj.size_bytes : undefined,
    similarity: typeof obj.similarity === 'number' ? obj.similarity : undefined,
    source: typeof obj.source === 'string' ? obj.source : undefined,
    iter: typeof obj.iter === 'number' ? obj.iter : undefined,
  }
}

function handleFrame(frame, opts) {
  const data = frame.data.trim()
  if (!data) return
  if (data === '[DONE]') return
  const obj = safeJson(data)
  if (!obj) return
  const type = typeof obj.type === 'string' ? obj.type : ''
  if (type === 'resource') {
    const r = parseResource(data)
    if (r) opts.onResource?.(r)
  }
  // 其他事件类型与本测试无关
}

function runFrames(sseText) {
  const buf = makeSseBuffer()
  const chunks = []
  let pos = 0
  while (pos < sseText.length) {
    const step = Math.min(sseText.length - pos, 4)
    chunks.push(...buf.push(sseText.slice(pos, pos + step)))
    pos += step
  }
  chunks.push(...buf.flush())
  return chunks
}

// ---------------------------------------------------------------------------
// 1. resource 帧解析：完整字段
// ---------------------------------------------------------------------------

test('resource 帧：图片 → 完整 ChatAttachment', () => {
  const sse =
    'data: {"type":"resource","event_id":"a1b2c3d4e5f67890a1b2c3d4e5f67890","url":"cdn.example.com/lab.jpg","name":"拉布拉多.jpg","display_name":"拉布拉多.jpg","file_id":"F-1024","modality":"image","mime_type":"image/jpeg","chunk_index":0,"total_chunks":1,"size_bytes":248532,"similarity":0.4218,"source":"search_memory","iter":0}\n\n'
  const frames = runFrames(sse)
  const calls = []
  for (const f of frames) handleFrame(f, { onResource: (r) => calls.push(r) })
  assert.equal(calls.length, 1)
  const r = calls[0]
  assert.equal(r.id, 'a1b2c3d4e5f67890a1b2c3d4e5f67890')
  assert.equal(r.fileId, 'F-1024')
  assert.equal(r.modality, 'image')
  assert.equal(r.mimeType, 'image/jpeg')
  assert.equal(r.name, '拉布拉多.jpg')
  assert.equal(r.displayName, '拉布拉多.jpg')
  assert.equal(r.chunkIndex, 0)
  assert.equal(r.totalChunks, 1)
  assert.equal(r.sizeBytes, 248532)
  assert.equal(r.similarity, 0.4218)
  assert.equal(r.source, 'search_memory')
  assert.equal(r.iter, 0)
})

// ---------------------------------------------------------------------------
// 2. modality 派发
// ---------------------------------------------------------------------------

test('resource 帧：音频 modality', () => {
  const sse = 'data: {"type":"resource","url":"cdn.example.com/v.m4a","modality":"audio","mime_type":"audio/mp4"}\n\n'
  const calls = []
  for (const f of runFrames(sse)) handleFrame(f, { onResource: (r) => calls.push(r) })
  assert.equal(calls[0].modality, 'audio')
})

test('resource 帧：视频 modality', () => {
  const sse = 'data: {"type":"resource","url":"cdn.example.com/v.mp4","modality":"video","mime_type":"video/mp4"}\n\n'
  const calls = []
  for (const f of runFrames(sse)) handleFrame(f, { onResource: (r) => calls.push(r) })
  assert.equal(calls[0].modality, 'video')
})

test('resource 帧：缺 modality → 兜底为 file', () => {
  const sse = 'data: {"type":"resource","url":"cdn.example.com/x.pdf"}\n\n'
  const calls = []
  for (const f of runFrames(sse)) handleFrame(f, { onResource: (r) => calls.push(r) })
  assert.equal(calls[0].modality, 'file')
})

// ---------------------------------------------------------------------------
// 3. 缺 url 的非法 resource 应被过滤
// ---------------------------------------------------------------------------

test('缺 url 的非法 resource 应被过滤掉', () => {
  const sse =
    'data: {"type":"resource","name":"valid.jpg","url":"cdn.example.com/v.jpg"}\n\n' +
    'data: {"type":"resource","name":"no-url"}\n\n' +
    'data: {"type":"resource","url":""}\n\n'
  const calls = []
  for (const f of runFrames(sse)) handleFrame(f, { onResource: (r) => calls.push(r) })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'valid.jpg')
})

// ---------------------------------------------------------------------------
// 4. id 兜底：缺 event_id 时用 fileId+chunkIndex
// ---------------------------------------------------------------------------

test('缺 event_id：用 file_id + chunk_index 兜底为 id', () => {
  const sse = 'data: {"type":"resource","url":"cdn.example.com/x.jpg","file_id":"F-7","chunk_index":2,"total_chunks":5}\n\n'
  const calls = []
  for (const f of runFrames(sse)) handleFrame(f, { onResource: (r) => calls.push(r) })
  assert.equal(calls[0].id, 'F-7#2')
  assert.equal(calls[0].chunkIndex, 2)
  assert.equal(calls[0].totalChunks, 5)
})

// ---------------------------------------------------------------------------
// 5. display_name 缺省时退到 name
// ---------------------------------------------------------------------------

test('缺 display_name：用 name 兜底为 displayName', () => {
  const sse = 'data: {"type":"resource","url":"cdn.example.com/x.jpg","name":"only-name.jpg"}\n\n'
  const calls = []
  for (const f of runFrames(sse)) handleFrame(f, { onResource: (r) => calls.push(r) })
  assert.equal(calls[0].name, 'only-name.jpg')
  assert.equal(calls[0].displayName, 'only-name.jpg')
})

// ---------------------------------------------------------------------------
// 6. resolveUrl：URL 处理
// ---------------------------------------------------------------------------

test('resolveUrl：已带 https 不动', () => {
  function resolveUrl(url, proto = 'https:') {
    if (!url) return url
    if (/^https?:\/\//i.test(url)) return url
    if (url.startsWith('//')) return `${proto}${url}`
    return `${proto}//${url}`
  }
  assert.equal(resolveUrl('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg')
  assert.equal(resolveUrl('http://cdn.example.com/a.jpg'), 'http://cdn.example.com/a.jpg')
})

test('resolveUrl：协议相对 //', () => {
  function resolveUrl(url, proto = 'https:') {
    if (!url) return url
    if (/^https?:\/\//i.test(url)) return url
    if (url.startsWith('//')) return `${proto}${url}`
    return `${proto}//${url}`
  }
  assert.equal(resolveUrl('//cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg')
})

test('resolveUrl：裸域名', () => {
  function resolveUrl(url, proto = 'https:') {
    if (!url) return url
    if (/^https?:\/\//i.test(url)) return url
    if (url.startsWith('//')) return `${proto}${url}`
    return `${proto}//${url}`
  }
  // 这是 spec 里的关键回归：绝不能让 <img src="cdn.example.com/foo.jpg"> 落到相对路径
  assert.equal(resolveUrl('cdn.example.com/foo.jpg'), 'https://cdn.example.com/foo.jpg')
  assert.equal(
    resolveUrl('the04ztre.hn-bkt.clouddn.com/default/20260629/lab.jpg'),
    'https://the04ztre.hn-bkt.clouddn.com/default/20260629/lab.jpg',
  )
})

// ---------------------------------------------------------------------------
// 7. 源文件契约
// ---------------------------------------------------------------------------

test('chat.ts：暴露 onResource 回调', async () => {
  const src = await readFile(new URL('../src/api/chat.ts', import.meta.url), 'utf-8')
  assert.ok(src.includes('onResource?'), 'SendChatStreamOptions 应暴露 onResource')
  assert.ok(
    src.includes('onResource?: (resource: ChatAttachment) => void'),
    'SendChatStreamOptions.onResource 签名应正确',
  )
})

test('chat.ts：导出 resolveUrl', async () => {
  const src = await readFile(new URL('../src/api/chat.ts', import.meta.url), 'utf-8')
  assert.ok(src.includes('export function resolveUrl'), '应导出 resolveUrl')
})

test('ChatAttachment.vue 存在并暴露 attachments prop + resolveUrl', async () => {
  const src = await readFile(
    new URL('../src/components/ChatAttachment.vue', import.meta.url),
    'utf-8',
  )
  assert.ok(src.includes('<script setup lang="ts">'))
  assert.ok(src.includes('attachments: ChatAttachment[]'), '应接 attachments: ChatAttachment[]')
  assert.ok(src.includes('Download'), '应使用 Download 图标')
  assert.ok(src.includes('handleDownload'), '应有 handleDownload 实现')
  // modality 派发
  for (const m of ['image', 'audio', 'video', 'file']) {
    assert.ok(src.includes(`modality === '${m}'`), `应派发 modality === ${m}`)
  }
  // resolveUrl 调用
  assert.ok(src.includes('resolve('), '应调用 resolve (resolveUrl 别名)')
})

test('types/chat.ts 暴露 ChatAttachment 新字段 + Message.attachments', async () => {
  const src = await readFile(new URL('../src/types/chat.ts', import.meta.url), 'utf-8')
  assert.ok(src.includes('export interface ChatAttachment'), '应导出 ChatAttachment 接口')
  // 新字段
  for (const f of ['displayName', 'fileId', 'modality', 'chunkIndex', 'totalChunks', 'sizeBytes']) {
    assert.ok(src.includes(f), `ChatAttachment 应包含 ${f}`)
  }
  assert.ok(src.includes("'image' | 'audio' | 'video' | 'file'"), 'modality 应限制四种值')
  assert.ok(src.includes('attachments?: ChatAttachment[]'), 'Message 应带 attachments 字段')
})

test('ChatPage.vue 已经引入 ChatAttachment 并 onResource 接入 store', async () => {
  const src = await readFile(new URL('../src/views/chat/ChatPage.vue', import.meta.url), 'utf-8')
  assert.ok(
    src.includes("import ChatAttachment from '@/components/ChatAttachment.vue'"),
    '应 import ChatAttachment 组件',
  )
  assert.ok(src.includes('<ChatAttachment'), '应在模板里使用 <ChatAttachment>')
  assert.ok(
    src.includes('chatStore.appendMessageResource(localSessionId, resource)'),
    '应把 onResource 接到 store',
  )
})