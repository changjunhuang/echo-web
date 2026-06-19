// 单元测试：附件解析（src/api/chat.ts 的 normalizeAttachments / emitAttachments）
// 跑：`node --test test/chat-attachment.test.mjs`
//
// 目的：验证 handleFrame 能在 delta / finish / 老式 JSON 包络三种位置
//       提取出 attachments，并按预期回调到 onAttachments 上。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// --- 与 chat.ts 严格对齐的复刻实现 ---

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

function normalize(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const url = typeof item.url === 'string' ? item.url.trim() : ''
    if (!url) continue
    const name =
      (typeof item.name === 'string' && item.name.trim()) ||
      url.split('/').pop() ||
      '附件'
    const mimeType = item.mimeType ?? item.mime_type
    const size = typeof item.size === 'number' ? item.size : undefined
    const type =
      item.type === 'image' || item.type === 'file'
        ? item.type
        : mimeType?.toLowerCase().startsWith('image/')
        ? 'image'
        : undefined
    out.push({
      id: item.id || `${url}#${name}`,
      name,
      url,
      mimeType,
      size,
      type,
    })
  }
  return out
}

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
        const oa = parsed.choices?.[0]?.delta?.content
        if (typeof oa === 'string' && oa) {
          onChunk(oa)
        } else {
          const inc = parsed.delta ?? parsed.reply
          if (typeof inc === 'string' && inc) onChunk(inc)
        }
        if (parsed.imageUrl && onImageUrl) onImageUrl(parsed.imageUrl)
        const list = normalize(parsed.attachments)
        if (list.length && onAttachments) onAttachments(list)
        return
      } catch {
        /* fallthrough */
      }
    }
    return
  }

  if (event === 'start') return
  if (event === 'finish' || event === 'done' || event === 'complete') {
    let payload
    let list = []
    if (data.startsWith('{')) {
      try {
        const parsed = JSON.parse(data)
        payload = { reply: parsed.reply, sessionId: parsed.sessionId }
        list = normalize(parsed.attachments)
      } catch {
        /* ignore */
      }
    }
    if (list.length && onAttachments) onAttachments(list)
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
      const list = normalize(raw)
      if (list.length && onAttachments) onAttachments(list)
      return
    } catch {
      /* fallthrough */
    }
  }
}

function runFrames(sseText) {
  const buf = makeSseBuffer()
  const chunks = []
  let pos = 0
  while (pos < sseText.length) {
    const step = Math.min(sseText.length - pos, 1 + (pos % 7))
    const slice = sseText.slice(pos, pos + step)
    pos += step
    for (const f of buf.push(slice)) chunks.push(f)
  }
  for (const f of buf.flush()) chunks.push(f)
  return chunks
}

// ---------------------------------------------------------------------------
// 1. delta 帧里带 attachments → 应能提取出来
// ---------------------------------------------------------------------------

test('delta 帧携带 attachments（顶层数组）应被解析', () => {
  const sse = [
    'event: start\r\n',
    'data: {"sessionId":"s1"}\r\n',
    '\r\n',
    'event: delta\r\n',
    'data: {"delta":"文件如下：","reply":"文件如下：","attachments":[' +
      '{"id":"a1","name":"report.pdf","url":"https://x.com/r.pdf","mimeType":"application/pdf","size":12345,"type":"file"},' +
      '{"id":"a2","name":"cat.png","url":"https://x.com/c.png","mimeType":"image/png","size":6789,"type":"image"}' +
      ']}\r\n',
    '\r\n',
    'event: finish\r\n',
    'data: {"reply":"文件如下：","sessionId":"s1"}\r\n',
    '\r\n',
  ].join('')

  const frames = runFrames(sse)
  const calls = []
  for (const f of frames) {
    handleFrame(
      f,
      () => {},
      undefined,
      (list) => calls.push(...list),
      undefined,
      () => {},
    )
  }
  assert.equal(calls.length, 2)
  assert.equal(calls[0].id, 'a1')
  assert.equal(calls[0].name, 'report.pdf')
  assert.equal(calls[0].type, 'file') // 非 image/*
  assert.equal(calls[0].size, 12345)
  assert.equal(calls[1].id, 'a2')
  assert.equal(calls[1].type, 'image') // image/* 自动推断
})

// ---------------------------------------------------------------------------
// 2. finish 帧里也带 attachments → 应能提取
// ---------------------------------------------------------------------------

test('finish 帧携带 attachments 应被解析', () => {
  const sse = [
    'event: delta\r\n',
    'data: {"delta":"hi"}\r\n',
    '\r\n',
    'event: finish\r\n',
    'data: {"reply":"hi","attachments":[{"name":"a.txt","url":"https://x.com/a.txt"}]}\r\n',
    '\r\n',
  ].join('')
  const frames = runFrames(sse)
  const calls = []
  for (const f of frames) {
    handleFrame(
      f,
      () => {},
      undefined,
      (list) => calls.push(...list),
      () => {},
      () => {},
    )
  }
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'a.txt')
  assert.equal(calls[0].url, 'https://x.com/a.txt')
  assert.ok(calls[0].id) // 自动生成 id
})

// ---------------------------------------------------------------------------
// 3. 老式 JSON 包络：attachments 在 data.* 里
//    用一个非标准 event 名（legacy）触发"未知事件"分支，
//    该分支专门负责从 data.* 老式包络里抽 reply / attachments
// ---------------------------------------------------------------------------

test('老式包络 data.attachments 应被解析', () => {
  const sse =
    'event: legacy\n' +
    'data: {"data":{"reply":"ok","attachments":[{"name":"pic.png","url":"https://x.com/p.png","mimeType":"image/png"}]}}\n\n' +
    'data: [DONE]\n\n'
  const frames = runFrames(sse)
  const calls = []
  let text = ''
  for (const f of frames) {
    handleFrame(
      f,
      (c) => (text += c),
      undefined,
      (list) => calls.push(...list),
      undefined,
      () => {},
    )
  }
  assert.equal(text, 'ok')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].type, 'image')
})

// ---------------------------------------------------------------------------
// 4. 非法 / 缺 url 的 attachment 应被过滤
// ---------------------------------------------------------------------------

test('缺 url 的非法 attachment 应被过滤掉', () => {
  const sse = [
    'event: delta\r\n',
    'data: {"attachments":[{"name":"valid.png","url":"https://x.com/v.png"},' +
      '{"name":"no-url"},{"url":""},null,"oops"]}\r\n',
    '\r\n',
  ].join('')
  const frames = runFrames(sse)
  const calls = []
  for (const f of frames) {
    handleFrame(
      f,
      () => {},
      undefined,
      (list) => calls.push(...list),
      undefined,
      () => {},
    )
  }
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'valid.png')
})

// ---------------------------------------------------------------------------
// 5. 字段命名空间宽松：mime_type 也应被识别
// ---------------------------------------------------------------------------

test('后端把 mimeType 写成 mime_type 也能被解析', () => {
  const sse = [
    'event: finish\r\n',
    'data: {"attachments":[{"name":"x","url":"https://x.com/x","mime_type":"image/jpeg","size":99}]}\r\n',
    '\r\n',
  ].join('')
  const frames = runFrames(sse)
  const calls = []
  for (const f of frames) {
    handleFrame(
      f,
      () => {},
      undefined,
      (list) => calls.push(...list),
      () => {},
      () => {},
    )
  }
  assert.equal(calls.length, 1)
  assert.equal(calls[0].mimeType, 'image/jpeg')
  assert.equal(calls[0].type, 'image')
})

// ---------------------------------------------------------------------------
// 6. 没有 onAttachments 回调时也不应抛错
// ---------------------------------------------------------------------------

test('onAttachments 为 undefined 时不抛错', () => {
  const sse = [
    'event: delta\r\n',
    'data: {"attachments":[{"name":"x","url":"https://x.com/x"}]}\r\n',
    '\r\n',
  ].join('')
  const frames = runFrames(sse)
  for (const f of frames) {
    handleFrame(f, () => {}, undefined, undefined, undefined, () => {})
  }
  // 不抛错即通过
  assert.ok(true)
})

// ---------------------------------------------------------------------------
// 7. 源文件契约：handleFrame 透传 onAttachments，组件 ChatAttachment.vue 存在
// ---------------------------------------------------------------------------

test('chat.ts 把 onAttachments 一路传进 handleFrame', async () => {
  const src = await readFile(new URL('../src/api/chat.ts', import.meta.url), 'utf-8')
  assert.ok(src.includes('onAttachments?'), 'sendChatMessageStream 应暴露 onAttachments 可选参数')
  assert.ok(
    src.includes('onAttachments: ((attachments: ChatAttachment[]) => void) | undefined'),
    'handleFrame 应接收 onAttachments',
  )
  assert.ok(src.includes('emitAttachments'), '应有 emitAttachments 收口函数')
  assert.ok(src.includes('normalizeAttachments'), '应有 normalizeAttachments 规整函数')
})

test('ChatAttachment.vue 存在并暴露 attachments prop', async () => {
  const src = await readFile(
    new URL('../src/components/ChatAttachment.vue', import.meta.url),
    'utf-8',
  )
  assert.ok(src.includes('<script setup lang="ts">'))
  assert.ok(src.includes('attachments: ChatAttachment[]'), '应接 attachments: ChatAttachment[]')
  assert.ok(src.includes('Download'), '应使用 Download 图标')
  assert.ok(src.includes('handleDownload'), '应有 handleDownload 实现')
  assert.ok(src.includes('inferType'), '应有 inferType 推断函数')
})

test('types/chat.ts 暴露 ChatAttachment 与 Message.attachments', async () => {
  const src = await readFile(new URL('../src/types/chat.ts', import.meta.url), 'utf-8')
  assert.ok(src.includes('export interface ChatAttachment'), '应导出 ChatAttachment 接口')
  assert.ok(src.includes('attachments?: ChatAttachment[]'), 'Message 应带 attachments 可选字段')
})

test('ChatPage.vue 已经引入 ChatAttachment 并渲染', async () => {
  const src = await readFile(new URL('../src/views/chat/ChatPage.vue', import.meta.url), 'utf-8')
  assert.ok(
    src.includes("import ChatAttachment from '@/components/ChatAttachment.vue'"),
    '应 import ChatAttachment 组件',
  )
  assert.ok(src.includes('<ChatAttachment'), '应在模板里使用 <ChatAttachment>')
  assert.ok(
    src.includes('chatStore.appendMessageAttachments(localSessionId, attachments)'),
    '应把 onAttachments 接到 store',
  )
})
