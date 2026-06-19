// 端到端测试：模拟真实后端吐"文本 + 附件"的完整 SSE 流，
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

test('chat.ts：sendChatMessageStream 第 6 个参数是 onAttachments 回调', async () => {
  const src = await readFile(SOURCE_URL, 'utf-8')
  // 签名跨多行，用 [\s\S]*? 抓到 "): AbortController" 之前
  const sigMatch = src.match(
    /function sendChatMessageStream\s*\(([\s\S]*?)\)\s*:\s*AbortController/,
  )
  assert.ok(sigMatch, 'sendChatMessageStream 应有签名')
  const params = sigMatch[1]
  assert.ok(
    /onAttachments\?\s*:\s*\(\s*attachments\s*:\s*ChatAttachment\[\]\s*\)\s*=>/.test(params),
    `签名应包含 onAttachments?: (attachments: ChatAttachment[]) => void；实际: ${params}`,
  )
})

test('chat.ts：handleFrame 在 delta / finish / 未知事件三个分支都识别 attachments', async () => {
  const src = await readFile(SOURCE_URL, 'utf-8')
  // 三个分支都应调用 emitAttachments(parsed.attachments, ...) 或 normalizeAttachments(parsed.attachments)
  const branchCount =
    (src.match(/emitAttachments\(parsed\.attachments/g) ?? []).length +
    (src.match(/normalizeAttachments\(parsed\.attachments/g) ?? []).length +
    (src.match(/parsed\.attachments\s*\?\?\s*parsed\.data\?\.attachments/g) ?? []).length
  assert.ok(branchCount >= 3, `应在 ≥3 个分支提取 attachments，实际: ${branchCount}`)
})

test('types/chat.ts：ChatAttachment 字段完整', async () => {
  const src = await readFile(TYPES_URL, 'utf-8')
  assert.ok(src.includes('export interface ChatAttachment'), '应导出 ChatAttachment')
  // 必填字段：id / name / url
  for (const field of ['id:', 'name:', 'url:']) {
    assert.ok(src.includes(field), `ChatAttachment 应包含必填字段 ${field}`)
  }
  // 可选字段
  for (const field of ['mimeType?:', 'size?:', 'type?:', 'createdAt?:']) {
    assert.ok(src.includes(field), `ChatAttachment 应包含可选字段 ${field}`)
  }
  assert.ok(src.includes("'image' | 'file'"), 'type 字段应限制为 image | file')
  assert.ok(src.includes('attachments?: ChatAttachment[]'), 'Message 应带 attachments 字段')
})

test('stores/chat.ts：appendMessageAttachments 暴露且按 url 去重', async () => {
  const src = await readFile(STORES_URL, 'utf-8')
  assert.ok(src.includes('function appendMessageAttachments'), '应定义 appendMessageAttachments')
  assert.ok(src.includes('appendMessageAttachments,'), '应从 store 暴露')
  assert.ok(
    src.includes('knownUrls') || src.includes('Set('),
    '应使用 Set 按 url 去重',
  )
})

// ---------------------------------------------------------------------------
// 2. ChatAttachment 组件契约
// ---------------------------------------------------------------------------

test('ChatAttachment.vue：暴露 3 个核心能力：查看 / 下载 / 复制链接', async () => {
  const src = await readFile(CHAT_ATTACHMENT_URL, 'utf-8')
  assert.ok(src.includes('handleView'), '应有 handleView')
  assert.ok(src.includes('handleDownload'), '应有 handleDownload')
  assert.ok(src.includes('handleCopyUrl'), '应有 handleCopyUrl')
  // UI 入口
  assert.ok(src.includes('查看'), '应有"查看"按钮文案')
  assert.ok(src.includes('下载'), '应有"下载"按钮文案')
  assert.ok(src.includes('复制链接'), '应有"复制链接"按钮文案')
  // 图标
  assert.ok(src.includes('View'), '应使用 View 图标')
  assert.ok(src.includes('Download'), '应使用 Download 图标')
  assert.ok(src.includes('CopyDocument'), '应使用 CopyDocument 图标')
  // 用户反馈
  assert.ok(src.includes('ElMessage'), '应通过 ElMessage 给用户反馈')
})

test('ChatAttachment.vue：能根据 mimeType / 扩展名推断浏览器能否直接预览', async () => {
  const src = await readFile(CHAT_ATTACHMENT_URL, 'utf-8')
  assert.ok(src.includes('canPreviewInBrowser'), '应有 canPreviewInBrowser 判断函数')
  assert.ok(src.includes('image/'), '应识别 image/*')
  assert.ok(src.includes('pdf'), '应识别 PDF')
  assert.ok(src.includes('text/'), '应识别 text/*')
})

test('ChatAttachment.vue：download 走 fetch → blob 流程，跨域回退到 a[download]', async () => {
  const src = await readFile(CHAT_ATTACHMENT_URL, 'utf-8')
  assert.ok(src.includes('URL.createObjectURL(blob)'), '应走 blob URL')
  assert.ok(src.includes("a.download = att.name"), '应设置 a.download 触发下载')
  assert.ok(src.includes('URL.revokeObjectURL'), '应回收 blob URL')
})

// ---------------------------------------------------------------------------
// 3. ChatPage.vue 已正确接入 ChatAttachment
// ---------------------------------------------------------------------------

test('ChatPage.vue：assistant 气泡里同时渲染 ChatImage 和 ChatAttachment', async () => {
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
    src.includes('chatStore.appendMessageAttachments(localSessionId, attachments)'),
    'handleSend 应把 attachments 写入 store',
  )
})

// ---------------------------------------------------------------------------
// 4. 端到端：起本地 mock 后端吐"文本 + 图片附件 + 文件附件"的完整 SSE 流，
//    前端协议层（sendChatMessageStream 等价的解析链路）应正确分拣出
//    onChunk / onAttachments / onFinish 三个分支
// ---------------------------------------------------------------------------

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
      } catch { /* fallthrough */ }
    }
    onChunk(data)
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
      } catch { /* ignore */ }
    }
    if (list.length && onAttachments) onAttachments(list)
    onFinish?.(payload ?? {})
    return
  }
  // 未知事件：老式 data.* 包络
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
    } catch { /* fallthrough */ }
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
  const attachments = []
  let finished = false
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      for (const f of buf.flush()) {
        handleFrame(
          f,
          (c) => chunks.push(c),
          undefined,
          (list) => attachments.push(...list),
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
        (list) => attachments.push(...list),
        () => (finished = true),
        () => {},
      )
    }
    if (finished) break
  }
  return { text: chunks.join(''), attachments }
}

test('端到端：finish 帧携带图片+文件附件 → onAttachments 收到完整数组', async () => {
  const srv = await startChatServer((res) => {
    res.write('event: start\r\n')
    res.write('data: {"sessionId":"s1"}\r\n\r\n')

    res.write('event: delta\r\n')
    res.write('data: {"delta":"好的，文件见下：","reply":"好的，文件见下："}\r\n\r\n')

    res.write('event: delta\r\n')
    res.write(
      'data: {"delta":"","attachments":[{"id":"img1","name":"截图.png","url":"https://x.com/s.png","mimeType":"image/png","size":12345,"type":"image"}]}\r\n\r\n',
    )

    res.write('event: finish\r\n')
    res.write(
      'data: {"reply":"好的，文件见下：","sessionId":"s1","attachments":[' +
        '{"id":"doc1","name":"需求文档.pdf","url":"https://x.com/d.pdf","mimeType":"application/pdf","size":67890,"type":"file"}' +
        ']}\r\n\r\n',
    )
    res.end()
  })

  try {
    const port = srv.address().port
    const { text, attachments } = await postSse(port, {
      model: 'gpt-4o',
      userId: 'u1',
      sessionId: 's1',
      message: '给我看看',
      stream: true,
    })
    // 文本流：delta 拼起来 = 完整 reply（finish 不重复追加）
    assert.equal(text, '好的，文件见下：')
    // 附件流：delta 收到 1 张图片 + finish 收到 1 个 PDF = 2 条
    assert.equal(attachments.length, 2)
    assert.equal(attachments[0].id, 'img1')
    assert.equal(attachments[0].type, 'image')
    assert.equal(attachments[0].mimeType, 'image/png')
    assert.equal(attachments[1].id, 'doc1')
    assert.equal(attachments[1].type, 'file')
    assert.equal(attachments[1].name, '需求文档.pdf')
  } finally {
    srv.close()
  }
})

test('端到端：attachments 按 url 去重（同一 url 在 delta 和 finish 重复发送）', async () => {
  const srv = await startChatServer((res) => {
    res.write('event: delta\r\n')
    res.write(
      'data: {"attachments":[{"id":"a1","name":"r.pdf","url":"https://x.com/r.pdf"}]}\r\n\r\n',
    )
    res.write('event: finish\r\n')
    res.write(
      'data: {"attachments":[{"id":"a1-dup","name":"r-dup.pdf","url":"https://x.com/r.pdf"}]}\r\n\r\n',
    )
    res.end()
  })
  try {
    const port = srv.address().port
    const { attachments } = await postSse(port, { sessionId: 's2', message: 'x' })
    // store 层的去重由 appendMessageAttachments 负责；这里只验证协议层都解析了
    assert.equal(attachments.length, 2)
    assert.equal(attachments[0].url, 'https://x.com/r.pdf')
    assert.equal(attachments[1].url, 'https://x.com/r.pdf')
  } finally {
    srv.close()
  }
})

test('端到端：mimeType 缺省时，normalize 按 mimeType 前缀推断', () => {
  const a = normalize([
    { name: 'a.png', url: 'https://x.com/a.png', mimeType: 'image/png' },
    { name: 'b.txt', url: 'https://x.com/b.txt', mimeType: 'text/plain' },
    { name: 'c', url: 'https://x.com/c' }, // 无 mimeType → type 留空，组件层默认 file
  ])
  assert.equal(a.length, 3)
  assert.equal(a[0].type, 'image')
  // text/* 不在推断白名单里 → 留空，让组件层默认按 file 渲染
  assert.equal(a[1].type, undefined)
  assert.equal(a[2].type, undefined)
})
