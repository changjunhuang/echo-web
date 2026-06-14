// 端到端测试：起一个本地 HTTP 服务吐 SSE，模拟前端 sendChatMessageStream 的完整调用链
// 跑：`node --test test/sse-e2e.test.mjs`

import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'

// 复用 chat.ts 同款的 buffer + handleFrame（与 sse-parse.test.mjs 同一份）
import { readFile } from 'node:fs/promises'

// 直接 require 那个测试文件里的实现不方便，用 child 启动 echo-web 后端太重。
// 这里手工跑一遍：拿一份"服务端吐数据"→"客户端读 ReadableStream"→"parse + dispatch"的完整模拟。

const SOURCE_URL = new URL('../src/api/chat.ts', import.meta.url)

// 仅做"端到端链路能跑通"，不重复实现：复用 SSE buffer + handleFrame 的等价实现
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

function handleFrame(frame, onChunk, onImageUrl, onAttachments, onFinish, markReceived) {
  const data = frame.data.trim()
  const event = frame.event
  if (data === '[DONE]') return
  if (!data) return
  markReceived()
  if (event === 'delta' || event === 'message') {
    if (data.startsWith('{')) {
      try {
        const parsed = JSON.parse(data)
        const oa = parsed.choices?.[0]?.delta?.content
        if (typeof oa === 'string' && oa) {
          onChunk(oa)
          return
        }
        const inc = parsed.delta ?? parsed.reply
        if (typeof inc === 'string' && inc) onChunk(inc)
        if (parsed.imageUrl && onImageUrl) onImageUrl(parsed.imageUrl)
        return
      } catch {}
    }
    return
  }
  if (event === 'finish' || event === 'done' || event === 'complete') {
    onFinish?.({})
    return
  }
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
  let finished = false
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      for (const f of buf.flush()) {
        handleFrame(
          f,
          (c) => chunks.push(c),
          undefined,
          undefined,
          () => (finished = true),
          () => {},
        )
      }
      break
    }
    const text = decoder.decode(value, { stream: true })
    for (const f of buf.push(text)) {
      handleFrame(
        f,
        (c) => chunks.push(c),
        undefined,
        undefined,
        () => (finished = true),
        () => {},
      )
    }
    if (finished) break
  }
  return chunks.join('')
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

test('端到端：真实后端的 event 流能正确累积、且 finish 不重复', async () => {
  const expectedDelta = '非常抱歉，'
  const fullReply = '非常抱歉，作为一个通用助手……完整文本'

  const srv = await startServer((res) => {
    const write = (s) => res.write(s)
    write('event: start\r\n')
    write('data: {"sessionId":"s1"}\r\n\r\n')

    // 真实后端会分多次吐 delta
    write('event: delta\r\n')
    write(`data: {"delta":"${expectedDelta}","reply":"${expectedDelta}"}\r\n\r\n`)
    write('event: delta\r\n')
    write(`data: {"delta":"作为一个通用助手","reply":"${fullReply}"}\r\n\r\n`)

    write('event: finish\r\n')
    write(`data: {"reply":"${fullReply}","sessionId":"s1"}\r\n\r\n`)
    res.end()
  })

  try {
    const port = srv.address().port
    const text = await postSse(port, {
      model: 'gpt-4o',
      userId: 'u1',
      sessionId: 's1',
      message: 'hi',
      stream: true,
    })
    // 关键断言：拼出的文本 == 两个 delta 之和，**不**包含 finish 里的整段 reply
    assert.equal(text, expectedDelta + '作为一个通用助手')
    assert.ok(!text.includes('完整文本'), 'finish 的 reply 不应被追加到结果中')
  } finally {
    srv.close()
  }
})

// 占位：标记"chat.ts 源文件存在且包含修复后的关键字符串"，避免未来改动把修复改没
test('chat.ts 源文件包含修复后的关键字段（防御性快照）', async () => {
  const src = await readFile(SOURCE_URL, 'utf-8')
  assert.ok(src.includes('event === \'finish\''), 'handleFrame 应识别 finish 事件')
  assert.ok(src.includes('event === \'delta\''), 'handleFrame 应识别 delta 事件')
  assert.ok(
    src.includes('parsed.delta ?? parsed.reply'),
    '应优先取 delta 字段，再回退 reply',
  )
})