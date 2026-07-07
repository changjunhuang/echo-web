// 单元测试：SSE buffer（src/api/chat.ts 里的 makeSseBuffer 复刻）
// 跑：`node --test test/sse-parse.test.mjs`
//
// 目的：
//   1. SSE buffer 能正确切分跨 chunk 的 data 行
//   2. CRLF / LF / 粘连等边界都能被 fallback flush 处理
//   3. 真后端的 data 格式（无 event: 行）也能被解析

import { test } from 'node:test'
import assert from 'node:assert/strict'

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

// --- 工具：把整段 SSE 按字节喂给 buffer ---

function runFrames(sseText) {
  const buf = makeSseBuffer()
  const out = []
  let pos = 0
  while (pos < sseText.length) {
    const step = Math.min(sseText.length - pos, 4)
    const slice = sseText.slice(pos, pos + step)
    pos += step
    out.push(...buf.push(slice))
  }
  out.push(...buf.flush())
  return out
}

// ---------------------------------------------------------------------------
// 1. 新协议格式：所有帧都只有 data: 行（没有 event:）
// ---------------------------------------------------------------------------

test('新协议：data-only 帧切出 type + payload', () => {
  const sse = [
    'data: {"type":"context","persona_len":412,"core_count":3,"l1_count":2}\n\n',
    'data: {"type":"delta","text":"你好，"}\n\n',
    'data: {"type":"delta","text":"世界！"}\n\n',
    'data: {"type":"done","full":"你好，世界！"}\n\n',
  ].join('')

  const frames = runFrames(sse)
  assert.equal(frames.length, 4)
  // 全部都是默认 event（message）；路由靠 data.type 字段
  for (const f of frames) assert.equal(f.event, 'message')

  // 解析后能拿到 type
  const types = frames.map((f) => JSON.parse(f.data.trim()).type)
  assert.deepEqual(types, ['context', 'delta', 'delta', 'done'])
})

// ---------------------------------------------------------------------------
// 2. CRLF 边界：后端用 \r\n 时也能切出来
// ---------------------------------------------------------------------------

test('CRLF 边界：\\r\\n\\r\\n 也能作为事件分隔', () => {
  const sse = [
    'data: {"type":"delta","text":"hi"}\r\n\r\n',
    'data: {"type":"done","full":"hi"}\r\n\r\n',
  ].join('')
  const frames = runFrames(sse)
  assert.equal(frames.length, 2)
  assert.equal(JSON.parse(frames[0].data).type, 'delta')
  assert.equal(JSON.parse(frames[1].data).type, 'done')
})

// ---------------------------------------------------------------------------
// 3. 残缺事件：flush 救场
// ---------------------------------------------------------------------------

test('服务端漏掉空行的"粘连"也能 fallback 处理（flush 救场）', () => {
  const bad = [
    'data: {"type":"delta","text":"hi"}\n\n',
    'data: {"type":"done","full":"hi"}\n',
  ].join('') // done 帧末尾没有换行 → flush 救场
  const frames = runFrames(bad)
  assert.ok(frames.length >= 2)
  assert.equal(JSON.parse(frames[0].data).type, 'delta')
})

// ---------------------------------------------------------------------------
// 4. OpenAI 风格 [DONE] 哨兵也能被 buffer 切出来
// ---------------------------------------------------------------------------

test('OpenAI 风格 data: [DONE] 仍能被 buffer 切分', () => {
  const sse = [
    'data: {"type":"delta","text":"x"}\n\n',
    'data: [DONE]\n\n',
  ].join('')
  const frames = runFrames(sse)
  assert.equal(frames.length, 2)
  assert.equal(frames[1].data.trim(), '[DONE]')
})

// ---------------------------------------------------------------------------
// 5. resource 帧切分正确（带 32 字符 event_id）
// ---------------------------------------------------------------------------

test('resource 帧：含 event_id 与 modality 字段也能正确切分', () => {
  const sse =
    'data: {"type":"resource","event_id":"a1b2c3d4e5f67890a1b2c3d4e5f67890","url":"cdn.example.com/lab.jpg","name":"拉布拉多.jpg","display_name":"拉布拉多.jpg","file_id":"F-1024","modality":"image","mime_type":"image/jpeg","chunk_index":0,"total_chunks":1,"size_bytes":248532,"similarity":0.42,"source":"search_memory","iter":0}\n\n'
  const frames = runFrames(sse)
  assert.equal(frames.length, 1)
  const obj = JSON.parse(frames[0].data)
  assert.equal(obj.type, 'resource')
  assert.equal(obj.modality, 'image')
  assert.equal(obj.event_id.length, 32)
  assert.equal(obj.chunk_index, 0)
})