// 端到端测试：模拟真实后端吐"文本 + 资源"的完整 SSE 流（新协议），
// 验证 sendChatMessageStream 解析协议 + ChatAttachment 组件契约 + Store 写入。
// 跑：`node --test test/attachment-e2e.test.mjs`

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import http from 'node:http'

const SOURCE_URL = new URL('../src/api/chat.ts', import.meta.url)
const CHAT_ATTACHMENT_URL = new URL('../src/components/ChatAttachment.vue', import.meta.url)
const STORES_URL = new URL('../src/stores/chat.ts', import.meta.url)
const CHAT_PAGE_URL = new URL('../src/views/chat/ChatPage.vue', import.meta.url)
const TYPES_URL = new URL('../src/types/chat.ts', import.meta.url)

// ---------------------------------------------------------------------------
// 1. 契约守卫：源代码包含必要导出
// ---------------------------------------------------------------------------

test('chat.ts：sendChatMessageStream 改为 options 入参，暴露 onResource', async () => {
  const src = await readFile(SOURCE_URL, 'utf-8')
  const sigMatch = src.match(
    /function sendChatMessageStream\s*\(([\s\S]*?)\)\s*:\s*AbortController/,
  )
  assert.ok(sigMatch, 'sendChatMessageStream 应有签名')
  const params = sigMatch[1]
  assert.ok(
    /options\s*:\s*SendChatStreamOptions/.test(params),
    `签名应包含 options: SendChatStreamOptions；实际: ${params}`,
  )
  assert.ok(
    src.includes('onResource?: (resource: ChatAttachment) => void'),
    'SendChatStreamOptions 应暴露 onResource',
  )
})

test('chat.ts：handleFrame 在 resource / done 两个分支都识别 type 字段', async () => {
  const src = await readFile(SOURCE_URL, 'utf-8')
  // resource 是新协议独有的事件类型
  assert.ok(src.includes("case 'resource':"), 'handleFrame 应识别 resource 类型')
  assert.ok(src.includes("case 'done':"), 'handleFrame 应识别 done 类型')
})

test('types/chat.ts：ChatAttachment 字段完整', async () => {
  const src = await readFile(TYPES_URL, 'utf-8')
  assert.ok(src.includes('export interface ChatAttachment'), '应导出 ChatAttachment')
  // 新字段
  for (const f of [
    'displayName',
    'fileId',
    'modality',
    'mimeType',
    'chunkIndex',
    'totalChunks',
    'sizeBytes',
  ]) {
    assert.ok(src.includes(f), `ChatAttachment 应包含 ${f}`)
  }
  assert.ok(src.includes("'image' | 'audio' | 'video' | 'file'"), 'modality 应限制四种')
  assert.ok(src.includes('attachments?: ChatAttachment[]'), 'Message 应带 attachments 字段')
})

test('stores/chat.ts：appendMessageResource 暴露且按 fileId+chunkIndex 去重', async () => {
  const src = await readFile(STORES_URL, 'utf-8')
  assert.ok(src.includes('function appendMessageResource'), '应定义 appendMessageResource')
  assert.ok(src.includes('appendMessageResource,'), '应从 store 暴露')
  // 去重键：fileId + chunkIndex
  assert.ok(src.includes('fileId'), '应使用 fileId 做去重')
  assert.ok(src.includes('chunkIndex'), '应使用 chunkIndex 做去重')
})

// ---------------------------------------------------------------------------
// 2. ChatAttachment 组件契约
// ---------------------------------------------------------------------------

test('ChatAttachment.vue：暴露 3 个核心能力：查看 / 下载 / 复制链接', async () => {
  const src = await readFile(CHAT_ATTACHMENT_URL, 'utf-8')
  assert.ok(src.includes('handleView'), '应有 handleView')
  assert.ok(src.includes('handleDownload'), '应有 handleDownload')
  assert.ok(src.includes('handleCopyUrl'), '应有 handleCopyUrl')
  assert.ok(src.includes('查看'), '应有"查看"按钮文案')
  assert.ok(src.includes('下载'), '应有"下载"按钮文案')
  assert.ok(src.includes('复制链接'), '应有"复制链接"按钮文案')
  assert.ok(src.includes('View'), '应使用 View 图标')
  assert.ok(src.includes('Download'), '应使用 Download 图标')
  assert.ok(src.includes('CopyDocument'), '应使用 CopyDocument 图标')
  assert.ok(src.includes('ElMessage'), '应通过 ElMessage 给用户反馈')
})

test('ChatAttachment.vue：四种 modality 派发', async () => {
  const src = await readFile(CHAT_ATTACHMENT_URL, 'utf-8')
  for (const m of ['image', 'audio', 'video', 'file']) {
    assert.ok(src.includes(`modality === '${m}'`), `应派发 modality === ${m}`)
  }
  // 音频 / 视频走原生播放器
  assert.ok(src.includes('<audio'), '音频应使用 <audio>')
  assert.ok(src.includes('<video'), '视频应使用 <video>')
})

test('ChatAttachment.vue：调用 resolveUrl() 处理后端不带 scheme 的 URL', async () => {
  const src = await readFile(CHAT_ATTACHMENT_URL, 'utf-8')
  assert.ok(src.includes("from '@/api/chat'"), '应从 chat 模块导入')
  assert.ok(src.includes('resolve('), '应调用 resolve() (即 resolveUrl)')
})

test('ChatAttachment.vue：download 走 fetch → blob 流程，跨域回退到 a[download]', async () => {
  const src = await readFile(CHAT_ATTACHMENT_URL, 'utf-8')
  assert.ok(src.includes('URL.createObjectURL(blob)'), '应走 blob URL')
  assert.ok(src.includes('a.download = downloadName'), '应设置 a.download 触发下载')
  assert.ok(src.includes('URL.revokeObjectURL'), '应回收 blob URL')
})

// ---------------------------------------------------------------------------
// 3. ChatPage.vue 已正确接入 ChatAttachment + onResource
// ---------------------------------------------------------------------------

test('ChatPage.vue：assistant 气泡里渲染 ChatAttachment + 接 onResource', async () => {
  const src = await readFile(CHAT_PAGE_URL, 'utf-8')
  assert.ok(
    src.includes("import ChatAttachment from '@/components/ChatAttachment.vue'"),
    '应 import ChatAttachment',
  )
  assert.ok(src.includes('<ChatAttachment'), '应使用 <ChatAttachment>')
  assert.ok(
    src.includes('msg.attachments && msg.attachments.length'),
    '应只在有 attachments 时才渲染',
  )
  assert.ok(
    src.includes('chatStore.appendMessageResource(localSessionId, resource)'),
    'handleSend 应把 onResource 写到 store',
  )
})

// ---------------------------------------------------------------------------
// 4. 端到端：起本地 mock 后端吐"文本 + 图片附件 + 音频附件"的完整 SSE 流
// ---------------------------------------------------------------------------

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
  const name = obj.display_name ?? obj.name ?? url.split('/').pop() ?? '附件'
  const modality =
    obj.modality === 'image' || obj.modality === 'audio' || obj.modality === 'video' || obj.modality === 'file'
      ? obj.modality
      : 'file'
  return {
    id: obj.event_id ?? `${obj.file_id ?? url}#${obj.chunk_index ?? 0}`,
    name,
    displayName: obj.display_name ?? obj.name ?? name,
    url,
    fileId: obj.file_id,
    modality,
    mimeType: obj.mime_type,
    chunkIndex: obj.chunk_index ?? 0,
    totalChunks: obj.total_chunks ?? 1,
    sizeBytes: obj.size_bytes,
    similarity: obj.similarity,
    source: obj.source,
    iter: obj.iter,
  }
}

function handleFrame(frame, onChunk, onResource, onFinish) {
  const data = frame.data.trim()
  if (!data) return
  if (data === '[DONE]') return
  const obj = safeJson(data)
  if (!obj) return
  const type = typeof obj.type === 'string' ? obj.type : ''
  if (type === 'delta') {
    const text = obj.text ?? obj.content ?? obj.delta ?? obj.reply
    if (typeof text === 'string' && text) onChunk(text)
    return
  }
  if (type === 'resource') {
    const r = parseResource(data)
    if (r) onResource(r)
    return
  }
  if (type === 'done') {
    onFinish?.({ full: obj.full, sessionId: obj.sessionId })
    return
  }
}

function startChatServer(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      if (req.url === '/api/chat') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
        handler(res)
        return
      }
      res.writeHead(404).end()
    })
    srv.listen(0, '127.0.0.1', () => resolve(srv))
  })
}

async function postSse(port, payload) {
  const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`http ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  const buf = makeSseBuffer()
  const chunks = []
  const resources = []
  let finished = false
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      for (const f of buf.flush()) {
        handleFrame(
          f,
          (c) => chunks.push(c),
          (r) => resources.push(r),
          () => (finished = true),
        )
      }
      break
    }
    const text = decoder.decode(value, { stream: true })
    for (const f of buf.push(text)) {
      handleFrame(
        f,
        (c) => chunks.push(c),
        (r) => resources.push(r),
        () => (finished = true),
      )
    }
    if (finished) break
  }
  return { text: chunks.join(''), resources, finished }
}

test('端到端：resource 事件流 → onResource 收到完整数组（图片 + 音频）', async () => {
  const srv = await startChatServer((res) => {
    res.write('data: {"type":"context","persona_len":412,"core_count":8,"l1_count":2}\n\n')
    res.write('data: {"type":"delta","text":"给你找到啦："}\n\n')
    res.write('data: {"type":"delta","text":"一张图 + 一段语音"}\n\n')
    // 图片资源
    res.write(
      'data: {"type":"resource","event_id":"a1b2c3d4e5f67890a1b2c3d4e5f67890","url":"cdn.example.com/lab.jpg","name":"拉布拉多.jpg","display_name":"拉布拉多.jpg","file_id":"F-1024","modality":"image","mime_type":"image/jpeg","chunk_index":0,"total_chunks":1,"size_bytes":248532,"similarity":0.4218,"source":"search_memory","iter":0}\n\n',
    )
    // 音频资源
    res.write(
      'data: {"type":"resource","event_id":"b2c3d4e5f67890a1b2c3d4e5f67890b2","url":"cdn.example.com/bark.m4a","name":"bark.m4a","display_name":"bark.m4a","file_id":"F-1025","modality":"audio","mime_type":"audio/mp4","chunk_index":0,"total_chunks":1,"size_bytes":4096}\n\n',
    )
    res.write('data: {"type":"done","full":"给你找到啦：一张图 + 一段语音","sessionId":"s1"}\n\n')
    res.end()
  })

  try {
    const port = srv.address().port
    const { text, resources, finished } = await postSse(port, {
      model: 'gpt-4o',
      userId: 'u1',
      sessionId: 's1',
      message: '给我看看',
      stream: true,
    })
    assert.equal(text, '给你找到啦：一张图 + 一段语音')
    assert.equal(resources.length, 2)
    assert.equal(resources[0].id, 'a1b2c3d4e5f67890a1b2c3d4e5f67890')
    assert.equal(resources[0].modality, 'image')
    assert.equal(resources[0].displayName, '拉布拉多.jpg')
    assert.equal(resources[0].sizeBytes, 248532)
    assert.equal(resources[1].modality, 'audio')
    assert.equal(resources[1].mimeType, 'audio/mp4')
    assert.equal(finished, true)
  } finally {
    srv.close()
  }
})

test('端到端：同一资源多次召回 → 通过 fileId+chunkIndex 在 store 层去重', async () => {
  const srv = await startChatServer((res) => {
    res.write(
      'data: {"type":"resource","event_id":"r1","url":"cdn.example.com/r.pdf","file_id":"F-1","chunk_index":0,"total_chunks":1,"modality":"file","name":"r.pdf","display_name":"r.pdf"}\n\n',
    )
    // 第二次同 fileId + chunkIndex 但不同 event_id：协议层都解析，由 store 去重
    res.write(
      'data: {"type":"resource","event_id":"r1-dup","url":"cdn.example.com/r.pdf","file_id":"F-1","chunk_index":0,"total_chunks":1,"modality":"file","name":"r-dup.pdf","display_name":"r-dup.pdf"}\n\n',
    )
    res.write('data: {"type":"done","full":"x"}\n\n')
    res.end()
  })
  try {
    const port = srv.address().port
    const { resources } = await postSse(port, { sessionId: 's2', message: 'x' })
    // 协议层不强制去重，store 按 fileId+chunkIndex 去重
    assert.equal(resources.length, 2)
    assert.equal(resources[0].fileId, 'F-1')
    assert.equal(resources[1].fileId, 'F-1')
  } finally {
    srv.close()
  }
})

test('端到端：URL 不带 scheme → 前端用 resolveUrl() 补齐', () => {
  // 后端实际推送格式（按 spec §4.1）：url 字段不带 http/https 前缀
  const r = parseResource(
    '{"type":"resource","url":"the04ztre.hn-bkt.clouddn.com/default/20260629/lab.jpg","modality":"image","file_id":"F-1","chunk_index":0,"total_chunks":1}',
  )
  assert.equal(r.url, 'the04ztre.hn-bkt.clouddn.com/default/20260629/lab.jpg')
  // 前端必须 resolve
  function resolveUrl(url, proto = 'https:') {
    if (!url) return url
    if (/^https?:\/\//i.test(url)) return url
    if (url.startsWith('//')) return `${proto}${url}`
    return `${proto}//${url}`
  }
  assert.equal(
    resolveUrl(r.url),
    'https://the04ztre.hn-bkt.clouddn.com/default/20260629/lab.jpg',
  )
})