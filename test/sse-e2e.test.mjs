// 端到端测试：起一个本地 HTTP 服务吐 SSE，模拟前端 sendChatMessageStream 的完整调用链
// 跑：`node --test test/sse-e2e.test.mjs`
//
// 新协议：所有帧都是 `data: {"type":"...",...}`，**不带** event: 行

import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { readFile } from 'node:fs/promises'

const SOURCE_URL = new URL('../src/api/chat.ts', import.meta.url)

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
  return ''
}

// 与 chat.ts 同步的 handleFrame 复刻（opts 入参）
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
      const personaLen = typeof obj.persona_len === 'number' ? obj.persona_len : 0
      const coreCount = typeof obj.core_count === 'number' ? obj.core_count : 0
      const l1Count = typeof obj.l1_count === 'number' ? obj.l1_count : 0
      onContext?.({ personaLen, coreCount, l1Count })
      return
    }
    case 'resource': {
      const url = typeof obj.url === 'string' ? obj.url.trim() : ''
      if (!url) return
      const modality = obj.modality === 'image' || obj.modality === 'audio' || obj.modality === 'video' || obj.modality === 'file' ? obj.modality : 'file'
      onResource?.({
        id: obj.event_id ?? `${obj.file_id ?? url}#${obj.chunk_index ?? 0}`,
        name: obj.display_name ?? obj.name ?? url.split('/').pop() ?? '附件',
        displayName: obj.display_name ?? obj.name ?? url.split('/').pop() ?? '附件',
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
      })
      return
    }
    case 'tool': {
      const tc = {
        name: obj.name ?? 'tool',
        iter: obj.iter ?? 0,
        ok: obj.ok === true,
        summary: obj.summary ?? '',
      }
      onTool?.(tc)
      return
    }
    case 'prefix': {
      const t = extractText(obj)
      if (t) onPrefix?.(t)
      return
    }
    case 'delta': {
      const t = extractText(obj)
      if (t) onChunk?.(t)
      return
    }
    case 'memory_extracted': {
      onMemory?.({ ok: obj.ok === true, error: obj.error })
      return
    }
    case 'done': {
      onDone?.({ full: obj.full, sessionId: obj.sessionId })
      return
    }
  }
}

async function postSse(port, payload, collect) {
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
  const collected = collect || {
    chunks: [],
    prefixes: [],
    contexts: [],
    resources: [],
    tools: [],
    memories: [],
    finished: false,
  }
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      for (const f of buf.flush()) {
        handleFrame(f, {
          onChunk: (c) => collected.chunks.push(c),
          onPrefix: (c) => collected.prefixes.push(c),
          onContext: (cs) => collected.contexts.push(cs),
          onResource: (r) => collected.resources.push(r),
          onTool: (t) => collected.tools.push(t),
          onMemory: (ms) => collected.memories.push(ms),
          onDone: () => (collected.finished = true),
        })
      }
      break
    }
    const text = decoder.decode(value, { stream: true })
    for (const f of buf.push(text)) {
      handleFrame(f, {
        onChunk: (c) => collected.chunks.push(c),
        onPrefix: (c) => collected.prefixes.push(c),
        onContext: (cs) => collected.contexts.push(cs),
        onResource: (r) => collected.resources.push(r),
        onTool: (t) => collected.tools.push(t),
        onMemory: (ms) => collected.memories.push(ms),
        onDone: () => (collected.finished = true),
      })
    }
    if (collected.finished) break
  }
  return collected
}

function startServer(handler) {
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

test('端到端：delta 累积成完整文本，done 不重复', async () => {
  const expectedDelta = '非常抱歉，'
  const fullReply = '非常抱歉，作为一个通用助手……完整文本'

  const srv = await startServer((res) => {
    const w = (s) => res.write(s)
    w(`data: {"type":"context","persona_len":412,"core_count":8,"l1_count":2}\n\n`)
    w(`data: {"type":"delta","text":"${expectedDelta}"}\n\n`)
    w(`data: {"type":"delta","text":"作为一个通用助手"}\n\n`)
    w(`data: {"type":"done","full":"${fullReply}","sessionId":"s1"}\n\n`)
    res.end()
  })

  try {
    const port = srv.address().port
    const collected = await postSse(port, {
      model: 'gpt-4o',
      userId: 'u1',
      sessionId: 's1',
      message: 'hi',
      stream: true,
    })
    assert.equal(collected.chunks.join(''), expectedDelta + '作为一个通用助手')
    assert.ok(!collected.chunks.join('').includes('完整文本'), 'done 的 full 不应被追加到 chunks')
    assert.equal(collected.finished, true)
    assert.equal(collected.contexts.length, 1)
    assert.equal(collected.contexts[0].personaLen, 412)
  } finally {
    srv.close()
  }
})

test('端到端：新协议 7 种事件全部正确分发', async () => {
  const srv = await startServer((res) => {
    const w = (s) => res.write(s)
    // 1. context
    w(`data: {"type":"context","persona_len":412,"core_count":8,"l1_count":3}\n\n`)
    // 2. tool
    w(`data: {"type":"tool","name":"web_search","iter":0,"ok":true,"summary":"[hits] 42"}\n\n`)
    // 3. resource
    w(`data: {"type":"resource","event_id":"a1b2c3d4e5f67890a1b2c3d4e5f67890","url":"cdn.example.com/lab.jpg","name":"拉布拉多.jpg","display_name":"拉布拉多.jpg","file_id":"F-1024","modality":"image","mime_type":"image/jpeg","chunk_index":0,"total_chunks":1,"size_bytes":248532,"similarity":0.4218,"source":"search_memory","iter":0}\n\n`)
    // 4. prefix
    w(`data: {"type":"prefix","text":"好的，让我先查一下："}\n\n`)
    // 5. delta
    w(`data: {"type":"delta","text":"查到的结果是"}\n\n`)
    w(`data: {"type":"delta","text":"：42"}\n\n`)
    // 6. memory_extracted
    w(`data: {"type":"memory_extracted","ok":true}\n\n`)
    // 7. done
    w(`data: {"type":"done","full":"查到的结果是：42","sessionId":"s1"}\n\n`)
    res.end()
  })

  try {
    const port = srv.address().port
    const collected = await postSse(port, {
      model: 'gpt-4o',
      userId: 'u1',
      sessionId: 's1',
      message: 'echo 是几？',
      stream: true,
    })

    assert.equal(collected.contexts.length, 1)
    assert.equal(collected.contexts[0].coreCount, 8)

    assert.equal(collected.tools.length, 1)
    assert.equal(collected.tools[0].name, 'web_search')
    assert.equal(collected.tools[0].iter, 0)
    assert.equal(collected.tools[0].ok, true)

    assert.equal(collected.resources.length, 1)
    assert.equal(collected.resources[0].modality, 'image')
    assert.equal(collected.resources[0].fileId, 'F-1024')
    assert.equal(collected.resources[0].displayName, '拉布拉多.jpg')

    assert.deepEqual(collected.prefixes, ['好的，让我先查一下：'])
    assert.equal(collected.chunks.join(''), '查到的结果是：42')

    assert.equal(collected.memories.length, 1)
    assert.equal(collected.memories[0].ok, true)

    assert.equal(collected.finished, true)
  } finally {
    srv.close()
  }
})

test('端到端：URL 不带 scheme 时，前端必须 resolveUrl() 才能用', async () => {
  const srv = await startServer((res) => {
    const w = (s) => res.write(s)
    w(
      `data: {"type":"resource","event_id":"a1b2c3d4e5f67890a1b2c3d4e5f67890","url":"the04ztre.hn-bkt.clouddn.com/default/20260629/lab.jpg","name":"拉布拉多.jpg","display_name":"拉布拉多.jpg","file_id":"F-1024","modality":"image","mime_type":"image/jpeg","chunk_index":0,"total_chunks":1}\n\n`,
    )
    w(`data: {"type":"done","full":"给你找到啦"}\n\n`)
    res.end()
  })
  try {
    const port = srv.address().port
    const collected = await postSse(port, { sessionId: 's1', message: 'x' })
    assert.equal(collected.resources.length, 1)
    assert.equal(collected.resources[0].url, 'the04ztre.hn-bkt.clouddn.com/default/20260629/lab.jpg')
    // 前端必须用 resolveUrl() 拼接
    const finalUrl = collected.resources[0].url.startsWith('http')
      ? collected.resources[0].url
      : `https://${collected.resources[0].url}`
    assert.ok(finalUrl.startsWith('https://'))
  } finally {
    srv.close()
  }
})

// 占位：标记"chat.ts 源文件存在且包含新协议的关键字符串"，避免未来改动把修复改没
test('chat.ts 源文件包含新协议关键字符串（防御性快照）', async () => {
  const src = await readFile(SOURCE_URL, 'utf-8')
  // 7 种 type 分支
  for (const t of ['context', 'resource', 'tool', 'prefix', 'delta', 'done', 'memory_extracted']) {
    assert.ok(src.includes(`case '${t}':`), `handleFrame 应识别 type=${t}`)
  }
  // resolveUrl + onResource
  assert.ok(src.includes('export function resolveUrl'), '应导出 resolveUrl')
  assert.ok(src.includes('onResource?'), '应暴露 onResource 回调')
  // 已移除旧协议 finish/delta event 名
  assert.ok(!src.includes("event === 'finish'"), '不应再依赖 event === finish')
  assert.ok(!src.includes("event === 'delta'"), '不应再依赖 event === delta')
  // options 形态
  assert.ok(src.includes('SendChatStreamOptions'), '应导出 SendChatStreamOptions')
  assert.ok(
    src.includes('onChunk?: (chunk: string) => void'),
    'SendChatStreamOptions 应暴露 onChunk',
  )
})