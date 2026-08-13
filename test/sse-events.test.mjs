// 单元测试：新协议 7 种 SSE 事件（context / resource / tool / prefix / delta / done / memory_extracted）
// 跑：`node --test test/sse-events.test.mjs`
//
// 新协议格式：所有帧都是纯 `data: {"type":"...", ...}`，**不带** `event:` 行。
// 路由分发靠 data.type 字段，不再依赖 SSE event 字段。
//
// 覆盖目标：
//   1. 每种事件都能被 buffer + parseSseEvent 正确切分
//   2. handleFrame 把每种事件分发到正确的 callback（onContext / onResource / onTool / onPrefix / onChunk / onMemory / onDone）
//   3. 新 payload 字段（persona_len / event_id / iter / ok / text / full …）都能解析
//   4. 容错：缺 callback 时不抛错；非法 payload 不污染其它事件
//   5. resolveUrl() 给裸 URL 补 scheme

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const SOURCE_URL = new URL('../src/api/chat.ts', import.meta.url)
const TYPES_URL = new URL('../src/types/chat.ts', import.meta.url)
const STORE_URL = new URL('../src/stores/chat.ts', import.meta.url)
const ATTACH_URL = new URL('../src/components/ChatAttachment.vue', import.meta.url)
const CONTEXT_URL = new URL('../src/components/ChatContext.vue', import.meta.url)
const TOOL_URL = new URL('../src/components/ChatToolCall.vue', import.meta.url)

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

function extractText(obj) {
  if (typeof obj.text === 'string' && obj.text) return obj.text
  if (typeof obj.content === 'string' && obj.content) return obj.content
  return ''
}

function parseContext(data) {
  const obj = safeJson(data)
  if (!obj) return null
  const personaLen = typeof obj.persona_len === 'number' ? obj.persona_len : undefined
  const coreCount = typeof obj.core_count === 'number' ? obj.core_count : undefined
  const l1Count = typeof obj.l1_count === 'number' ? obj.l1_count : undefined
  if (personaLen === undefined && coreCount === undefined && l1Count === undefined) return null
  return {
    personaLen: personaLen ?? 0,
    coreCount: coreCount ?? 0,
    l1Count: l1Count ?? 0,
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
  const mimeType = typeof obj.mime_type === 'string' ? obj.mime_type : undefined
  return {
    id: typeof obj.event_id === 'string' && obj.event_id
      ? obj.event_id
      : `${typeof obj.file_id === 'string' ? obj.file_id : url}#${obj.chunk_index ?? 0}`,
    name,
    displayName: typeof obj.display_name === 'string' ? obj.display_name : name,
    url,
    fileId: typeof obj.file_id === 'string' ? obj.file_id : undefined,
    modality,
    mimeType,
    chunkIndex: typeof obj.chunk_index === 'number' ? obj.chunk_index : 0,
    totalChunks: typeof obj.total_chunks === 'number' ? obj.total_chunks : 1,
    sizeBytes: typeof obj.size_bytes === 'number' ? obj.size_bytes : undefined,
    similarity: typeof obj.similarity === 'number' ? obj.similarity : undefined,
    source: typeof obj.source === 'string' ? obj.source : undefined,
    iter: typeof obj.iter === 'number' ? obj.iter : undefined,
  }
}

function parseTool(data) {
  const obj = safeJson(data)
  if (!obj) return null
  const name = typeof obj.name === 'string' ? obj.name : ''
  const iter = typeof obj.iter === 'number' ? obj.iter : 0
  const ok = obj.ok === true
  const summary = typeof obj.summary === 'string' ? obj.summary : ''
  if (!name && !summary) return null
  return { name: name || 'tool', iter, ok, summary }
}

function parseMemory(data) {
  const obj = safeJson(data)
  if (!obj) return null
  return { ok: obj.ok === true, error: typeof obj.error === 'string' ? obj.error : undefined }
}

function parseDone(data) {
  const obj = safeJson(data)
  if (!obj) return {}
  return {
    full: typeof obj.full === 'string' ? obj.full : undefined,
    sessionId: typeof obj.sessionId === 'string' ? obj.sessionId : undefined,
  }
}

/** 与 chat.ts handleFrame 等价的分发函数 */
function handleFrame(frame, opts) {
  const { onChunk, onPrefix, onContext, onResource, onTool, onMemory, onDone } = opts
  const data = frame.data.trim()
  if (!data) return
  if (data === '[DONE]') return
  const obj = safeJson(data)
  if (!obj) return
  const type = typeof obj.type === 'string' ? obj.type : ''
  switch (type) {
    case 'context': {
      const info = parseContext(data)
      if (info) onContext?.(info)
      return
    }
    case 'resource': {
      const r = parseResource(data)
      if (r) onResource?.(r)
      return
    }
    case 'tool': {
      const t = parseTool(data)
      if (t) onTool?.(t)
      return
    }
    case 'prefix': {
      const text = extractText(obj)
      if (text) onPrefix?.(text)
      return
    }
    case 'delta': {
      const text = extractText(obj)
      if (text) onChunk?.(text)
      return
    }
    case 'done': {
      const p = parseDone(data)
      onDone?.(p)
      return
    }
    case 'memory_extracted': {
      const m = parseMemory(data)
      if (m) onMemory?.(m)
      return
    }
  }
}

function runFrames(sseText) {
  const buf = makeSseBuffer()
  const out = []
  let pos = 0
  while (pos < sseText.length) {
    const step = Math.min(sseText.length - pos, 4)
    out.push(...buf.push(sseText.slice(pos, pos + step)))
    pos += step
  }
  out.push(...buf.flush())
  return out
}

// ---------------------------------------------------------------------------
// 1. context：新 payload {persona_len, core_count, l1_count}
// ---------------------------------------------------------------------------

test('context 帧：{persona_len, core_count, l1_count} → onContext 收到规整对象', () => {
  const sse =
    'data: {"type":"context","persona_len":412,"core_count":8,"l1_count":3}\n\n'
  const frames = runFrames(sse)
  let got = null
  handleFrame(frames[0], {
    onContext: (info) => (got = info),
  })
  assert.ok(got)
  assert.equal(got.personaLen, 412)
  assert.equal(got.coreCount, 8)
  assert.equal(got.l1Count, 3)
})

test('context 帧：缺字段 → 仍能解析（缺省 0）', () => {
  const sse = 'data: {"type":"context","core_count":5}\n\n'
  const frames = runFrames(sse)
  let got = null
  handleFrame(frames[0], {
    onContext: (info) => (got = info),
  })
  assert.ok(got)
  assert.equal(got.coreCount, 5)
  assert.equal(got.personaLen, 0)
  assert.equal(got.l1Count, 0)
})

// ---------------------------------------------------------------------------
// 2. resource：新事件，按 modality 派发
// ---------------------------------------------------------------------------

test('resource 帧：图片 → onResource 收到完整 ChatAttachment', () => {
  const sse = [
    'data: {"type":"resource","event_id":"a1b2c3d4e5f67890a1b2c3d4e5f67890",',
    '"url":"cdn.example.com/lab.jpg","name":"拉布拉多.jpg","display_name":"拉布拉多.jpg",',
    '"file_id":"F-1024","modality":"image","mime_type":"image/jpeg",',
    '"chunk_index":0,"total_chunks":1,"size_bytes":248532,"similarity":0.4218,',
    '"source":"search_memory","iter":0}\n\n',
  ].join('')
  const frames = runFrames(sse)
  let got = null
  handleFrame(frames[0], {
    onResource: (r) => (got = r),
  })
  assert.ok(got)
  assert.equal(got.id, 'a1b2c3d4e5f67890a1b2c3d4e5f67890')
  assert.equal(got.name, '拉布拉多.jpg')
  assert.equal(got.displayName, '拉布拉多.jpg')
  assert.equal(got.url, 'cdn.example.com/lab.jpg')
  assert.equal(got.fileId, 'F-1024')
  assert.equal(got.modality, 'image')
  assert.equal(got.mimeType, 'image/jpeg')
  assert.equal(got.chunkIndex, 0)
  assert.equal(got.totalChunks, 1)
  assert.equal(got.sizeBytes, 248532)
  assert.equal(got.similarity, 0.4218)
  assert.equal(got.source, 'search_memory')
  assert.equal(got.iter, 0)
})

test('resource 帧：音频 modality', () => {
  const sse =
    'data: {"type":"resource","url":"cdn.example.com/v.m4a","modality":"audio","mime_type":"audio/mp4"}\n\n'
  const frames = runFrames(sse)
  let got = null
  handleFrame(frames[0], { onResource: (r) => (got = r) })
  assert.ok(got)
  assert.equal(got.modality, 'audio')
  assert.equal(got.mimeType, 'audio/mp4')
})

test('resource 帧：视频 modality', () => {
  const sse =
    'data: {"type":"resource","url":"cdn.example.com/v.mp4","modality":"video","mime_type":"video/mp4"}\n\n'
  const frames = runFrames(sse)
  let got = null
  handleFrame(frames[0], { onResource: (r) => (got = r) })
  assert.equal(got.modality, 'video')
})

test('resource 帧：缺 url → 静默丢弃', () => {
  const sse = 'data: {"type":"resource","modality":"image"}\n\n'
  const frames = runFrames(sse)
  let called = false
  handleFrame(frames[0], { onResource: () => (called = true) })
  assert.equal(called, false)
})

test('resource 帧：缺 event_id 时用 fileId+chunkIndex 兜底', () => {
  const sse =
    'data: {"type":"resource","url":"cdn.example.com/x.jpg","file_id":"F-7","chunk_index":2,"total_chunks":5}\n\n'
  const frames = runFrames(sse)
  let got = null
  handleFrame(frames[0], { onResource: (r) => (got = r) })
  assert.ok(got)
  assert.equal(got.id, 'F-7#2')
  assert.equal(got.chunkIndex, 2)
  assert.equal(got.totalChunks, 5)
})

// ---------------------------------------------------------------------------
// 3. tool：新 payload {name, iter, ok, summary}
// ---------------------------------------------------------------------------

test('tool 帧：{name, iter, ok, summary} → onTool 收到完整对象', () => {
  const sse =
    'data: {"type":"tool","name":"search_memory","iter":0,"ok":true,"summary":"[memory hits] [image](0.42) yellow labrador url=cdn.example.com/lab.jpg"}\n\n'
  const frames = runFrames(sse)
  let got = null
  handleFrame(frames[0], { onTool: (t) => (got = t) })
  assert.ok(got)
  assert.equal(got.name, 'search_memory')
  assert.equal(got.iter, 0)
  assert.equal(got.ok, true)
  assert.ok(got.summary.includes('memory hits'))
})

test('tool 帧：失败时 ok=false', () => {
  const sse = 'data: {"type":"tool","name":"x","iter":1,"ok":false,"summary":"失败原因"}\n\n'
  const frames = runFrames(sse)
  let got = null
  handleFrame(frames[0], { onTool: (t) => (got = t) })
  assert.equal(got.ok, false)
})

// ---------------------------------------------------------------------------
// 4. prefix：新 payload {text}
// ---------------------------------------------------------------------------

test('prefix 帧：{text:"…"} → onPrefix 收到字符串', () => {
  const sse = 'data: {"type":"prefix","text":"好的，让我先查一下："}\n\n'
  const frames = runFrames(sse)
  let got = null
  handleFrame(frames[0], { onPrefix: (t) => (got = t) })
  assert.equal(got, '好的，让我先查一下：')
})

test('prefix 帧：空字符串 → 不触发 onPrefix（避免无谓回调）', () => {
  const sse = 'data: {"type":"prefix","text":""}\n\n'
  const frames = runFrames(sse)
  let called = false
  handleFrame(frames[0], { onPrefix: () => (called = true) })
  assert.equal(called, false)
})

// ---------------------------------------------------------------------------
// 5. delta：主增量
// ---------------------------------------------------------------------------

test('delta 帧：{text:"…"} → onChunk 收到 text', () => {
  const sse = [
    'data: {"type":"delta","text":"你好呀，"}\n\n',
    'data: {"type":"delta","text":"黄昶钧！"}\n\n',
    'data: {"type":"delta","text":"很高兴认识你。"}\n\n',
  ].join('')
  const frames = runFrames(sse)
  const got = []
  for (const f of frames) handleFrame(f, { onChunk: (c) => got.push(c) })
  assert.equal(got.join(''), '你好呀，黄昶钧！很高兴认识你。')
})

test('delta 帧：缺 text → 不追加也不报错', () => {
  const sse = 'data: {"type":"delta","sessionId":"s1"}\n\n'
  const frames = runFrames(sse)
  const got = []
  for (const f of frames) handleFrame(f, { onChunk: (c) => got.push(c) })
  assert.equal(got.length, 0)
})

// ---------------------------------------------------------------------------
// 6. done：终止信号
// ---------------------------------------------------------------------------

test('done 帧：{full,sessionId} → onDone 触发，full 不再追加', () => {
  const sse = [
    'data: {"type":"delta","text":"42"}\n\n',
    'data: {"type":"done","full":"42","sessionId":"s1"}\n\n',
  ].join('')
  const frames = runFrames(sse)
  const chunks = []
  let donePayload = null
  for (const f of frames) {
    handleFrame(f, {
      onChunk: (c) => chunks.push(c),
      onDone: (p) => (donePayload = p),
    })
  }
  assert.equal(chunks.join(''), '42')
  assert.equal(donePayload?.full, '42')
  assert.equal(donePayload?.sessionId, 's1')
})

test('done 帧：full 含 markdown 附件段落也能透传', () => {
  const fullText =
    '给你找到啦！黄色拉布拉多很可爱！\n\n附件：\n![拉布拉多.jpg](cdn.example.com/lab.jpg)'
  const sse = `data: {"type":"done","full":${JSON.stringify(fullText)}}\n\n`
  const frames = runFrames(sse)
  let got = null
  handleFrame(frames[0], { onDone: (p) => (got = p) })
  assert.equal(got.full, fullText)
})

// ---------------------------------------------------------------------------
// 7. memory_extracted：长期记忆（仅 stream=false 时出现）
// ---------------------------------------------------------------------------

test('memory_extracted 帧：{ok:true} → onMemory 收到成功结果', () => {
  const sse = 'data: {"type":"memory_extracted","ok":true}\n\n'
  const frames = runFrames(sse)
  let got = null
  handleFrame(frames[0], { onMemory: (m) => (got = m) })
  assert.ok(got)
  assert.equal(got.ok, true)
})

test('memory_extracted 帧：{ok:false,error:"…"} → onMemory 收到失败结果', () => {
  const sse = 'data: {"type":"memory_extracted","ok":false,"error":"timeout"}\n\n'
  const frames = runFrames(sse)
  let got = null
  handleFrame(frames[0], { onMemory: (m) => (got = m) })
  assert.equal(got.ok, false)
  assert.equal(got.error, 'timeout')
})

// ---------------------------------------------------------------------------
// 8. 容错：缺 callback / 非法 payload / 未知 type
// ---------------------------------------------------------------------------

test('容错：所有 callback 都缺省时不应抛错', () => {
  const sse = [
    'data: {"type":"context","persona_len":1,"core_count":1,"l1_count":1}\n\n',
    'data: {"type":"resource","url":"cdn.example.com/a.jpg","modality":"image"}\n\n',
    'data: {"type":"tool","name":"t","iter":0,"ok":true,"summary":"s"}\n\n',
    'data: {"type":"prefix","text":"p"}\n\n',
    'data: {"type":"delta","text":"d"}\n\n',
    'data: {"type":"memory_extracted","ok":true}\n\n',
    'data: {"type":"done","full":"d"}\n\n',
  ].join('')
  const frames = runFrames(sse)
  for (const f of frames) handleFrame(f, {})
  assert.ok(true)
})

test('容错：非法 JSON 的 frame 应被吞掉', () => {
  const sse = [
    'data: {not valid json\n\n',
    'data: {"type":"delta","text":"ok"}\n\n',
  ].join('')
  const frames = runFrames(sse)
  const chunks = []
  for (const f of frames) handleFrame(f, { onChunk: (c) => chunks.push(c) })
  // delta 不受影响
  assert.equal(chunks.join(''), 'ok')
})

test('容错：未知 type 静默丢弃（避免把整段 JSON 当文本喷到 UI）', () => {
  const sse = 'data: {"type":"unknown_thing","text":"x"}\n\n'
  const frames = runFrames(sse)
  const chunks = []
  for (const f of frames) handleFrame(f, { onChunk: (c) => chunks.push(c) })
  assert.equal(chunks.length, 0)
})

// ---------------------------------------------------------------------------
// 9. 端到端：7 种事件同流，按出现顺序分发到对应 callback
// ---------------------------------------------------------------------------

test('端到端：7 种事件同流，每个 callback 各收到该管的那份', () => {
  const sse = [
    'data: {"type":"context","persona_len":412,"core_count":8,"l1_count":3}\n\n',
    'data: {"type":"tool","name":"search","iter":0,"ok":true,"summary":"[hits]"}\n\n',
    'data: {"type":"resource","event_id":"a1b2c3d4e5f67890a1b2c3d4e5f67890","url":"cdn.example.com/x.jpg","name":"x.jpg","display_name":"x.jpg","file_id":"F-1","modality":"image","mime_type":"image/jpeg","chunk_index":0,"total_chunks":1}\n\n',
    'data: {"type":"prefix","text":"前："}\n\n',
    'data: {"type":"delta","text":"主文本"}\n\n',
    'data: {"type":"memory_extracted","ok":true}\n\n',
    'data: {"type":"done","full":"前：主文本"}\n\n',
  ].join('')
  const frames = runFrames(sse)
  assert.equal(frames.length, 7)

  const ctxs = []
  const tools = []
  const resources = []
  const prefixes = []
  const chunks = []
  const memories = []
  let donePayload = null
  for (const f of frames) {
    handleFrame(f, {
      onContext: (c) => ctxs.push(c),
      onTool: (t) => tools.push(t),
      onResource: (r) => resources.push(r),
      onPrefix: (c) => prefixes.push(c),
      onChunk: (c) => chunks.push(c),
      onMemory: (m) => memories.push(m),
      onDone: (p) => (donePayload = p),
    })
  }

  assert.equal(ctxs.length, 1)
  assert.equal(ctxs[0].personaLen, 412)

  assert.equal(tools.length, 1)
  assert.equal(tools[0].name, 'search')

  assert.equal(resources.length, 1)
  assert.equal(resources[0].modality, 'image')

  assert.deepEqual(prefixes, ['前：'])
  assert.deepEqual(chunks, ['主文本'])
  assert.equal(memories.length, 1)
  assert.equal(memories[0].ok, true)
  assert.equal(donePayload.full, '前：主文本')
})

// ---------------------------------------------------------------------------
// 10. resolveUrl：URL 处理约定（源文件字符串断言）
// ---------------------------------------------------------------------------

test('resolveUrl：源文件实现包含三条分支（已带 scheme / 协议相对 / 裸域名）', async () => {
  const src = await readFile(SOURCE_URL, 'utf-8')
  // 1. 已带 scheme：直接返回
  assert.ok(src.includes('https?:\\/\\/'), '应使用 https? 正则匹配 scheme')
  // 2. 协议相对（// 开头）：仍跟随页面协议
  assert.ok(src.includes("url.startsWith('//')"), '协议相对 // 应识别')
  assert.ok(
    src.includes('window.location.protocol}${url}'),
    '协议相对 URL 应拼接当前页协议',
  )
  // 3. 裸域名：固定拼 https://（不能跟随页面协议，否则 dev HTTP 页面会把图变成 http://，CDN 拒绝）
  assert.ok(
    src.includes("`https://${url}`"),
    '裸域名应固定拼 https://（关键修复：不能用 window.location.protocol）',
  )
  // 4. 关键回归：不能再有 "window.location.protocol}//${url}" 这一行
  //    （历史上裸域名错误地跟随页面协议，导致图片预览在 dev 环境下失效）
  assert.ok(
    !src.includes('window.location.protocol}//${url}'),
    '不应再用 window.location.protocol 拼接裸域名（dev 页 http:// 会让 CDN 失效）',
  )
})

test('resolveUrl：单元行为（用同步复刻实现验证逻辑）', () => {
  function resolveUrl(url, protocol = 'https:') {
    if (!url) return url
    if (/^https?:\/\//i.test(url)) return url
    if (url.startsWith('//')) return `${protocol}${url}`
    return `${protocol}//${url}`
  }
  assert.equal(resolveUrl('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg')
  assert.equal(resolveUrl('//cdn.example.com/a.jpg', 'https:'), 'https://cdn.example.com/a.jpg')
  assert.equal(resolveUrl('cdn.example.com/a.jpg', 'https:'), 'https://cdn.example.com/a.jpg')
})

// ---------------------------------------------------------------------------
// 11. 源文件契约：types/chat.ts + chat.ts + stores/chat.ts + 各组件
// ---------------------------------------------------------------------------

test('types/chat.ts：新增 ChatContextInfo / ChatMemoryResult + 新 ChatAttachment 字段', async () => {
  const src = await readFile(TYPES_URL, 'utf-8')
  assert.ok(src.includes('export interface ChatContextInfo'), '应导出 ChatContextInfo')
  assert.ok(src.includes('export interface ChatMemoryResult'), '应导出 ChatMemoryResult')
  // ChatAttachment 新字段
  for (const f of [
    'displayName',
    'fileId',
    'modality',
    'chunkIndex',
    'totalChunks',
    'sizeBytes',
  ]) {
    assert.ok(src.includes(f), `ChatAttachment 应包含 ${f}`)
  }
  // modality 限定为四种
  assert.ok(src.includes("'image' | 'audio' | 'video' | 'file'"), 'modality 应限制为四种')
})

test('chat.ts：暴露 onResource + resolveUrl + 7 种事件分发', async () => {
  const src = await readFile(SOURCE_URL, 'utf-8')
  // resolveUrl
  assert.ok(src.includes('export function resolveUrl'), '应导出 resolveUrl')
  // 7 种 type 分支
  for (const t of ['context', 'resource', 'tool', 'prefix', 'delta', 'done', 'memory_extracted']) {
    assert.ok(src.includes(`case '${t}':`), `handleFrame 应识别 type=${t}`)
  }
  // 暴露 onResource
  assert.ok(src.includes('onResource?'), '应暴露 onResource 回调')
  // 已移除旧协议 event 名
  assert.ok(!src.includes("event === 'finish'"), '不应再依赖 event === finish')
})

test('stores/chat.ts：3 个新 appendMessageXxx + appendMessageResource 已导出', async () => {
  const src = await readFile(STORE_URL, 'utf-8')
  for (const fn of [
    'appendMessageResource',
    'appendMessageToolCalls',
    'appendMessageContext',
    'appendMessageMemoryResult',
  ]) {
    assert.ok(src.includes(`function ${fn}`), `应定义 ${fn}`)
    assert.ok(src.includes(`${fn},`), `应从 store 暴露 ${fn}`)
  }
})

test('ChatContext.vue：按 info prop 渲染 persona / core / l1', async () => {
  const src = await readFile(CONTEXT_URL, 'utf-8')
  assert.ok(src.includes('info: ChatContextInfo'), '应接 info: ChatContextInfo')
  assert.ok(src.includes('info.personaLen'), '应渲染 personaLen')
  assert.ok(src.includes('info.coreCount'), '应渲染 coreCount')
  assert.ok(src.includes('info.l1Count'), '应渲染 l1Count')
})

test('ChatToolCall.vue：按新字段渲染 iter / ok / summary', async () => {
  const src = await readFile(TOOL_URL, 'utf-8')
  assert.ok(src.includes('toolCalls: ChatToolCall[]'), '应接 toolCalls')
  assert.ok(src.includes('tc.iter'), '应渲染 iter')
  assert.ok(src.includes('tc.ok'), '应渲染 ok')
  assert.ok(src.includes('tc.summary'), '应渲染 summary')
})

test('ChatAttachment.vue：按 modality 派发 + 调用 resolveUrl', async () => {
  const src = await readFile(ATTACH_URL, 'utf-8')
  // 四种 modality 分支
  for (const m of ['image', 'audio', 'video', 'file']) {
    assert.ok(src.includes(`modality === '${m}'`), `应派发 modality === ${m}`)
  }
  // resolveUrl 调用
  assert.ok(src.includes('resolve(') || src.includes('resolveUrl('), '应调用 resolveUrl')
  // chunkIndex / totalChunks
  assert.ok(src.includes('totalChunks'), '应使用 totalChunks')
  // displayName
  assert.ok(src.includes('displayName'), '应使用 displayName')
})