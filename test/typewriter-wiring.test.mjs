// 契约测试：ChatPage.vue 必须把 SSE onChunk/onPrefix 走打字机节流，
// 不能再直接 appendToLastAssistantMessage（否则会瞬间满屏）。
//
// 打字机的单测见 test/typewriter.test.mjs（vitest），这里只验证：
//   - ChatPage.vue 引入 useTypewriter / createTypewriter
//   - handleSend 里的 SSE onChunk/onPrefix 用 typewriter.push(...)
//   - onDone / onError / handleStop 必须 flush 队列（sink 写入 msg.content）
//   - 模板里有 typing-caret，且 v-if 绑到 streamingMessageId
//   - 流式指示器行（3 个 .streaming-dot）只在 streamingMessageId 为空时显示
//
// 跑：`node --test test/typewriter-wiring.test.mjs`

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const CHAT_PAGE_URL = new URL('../src/views/chat/ChatPage.vue', import.meta.url)
const TYPEWRITER_URL = new URL('../src/composables/useTypewriter.ts', import.meta.url)

test('ChatPage.vue 引入 createTypewriter / useTypewriter', async () => {
  const src = await readFile(CHAT_PAGE_URL, 'utf-8')
  assert.ok(
    src.includes("from '@/composables/useTypewriter'"),
    'ChatPage.vue 必须 import 打字机 composable',
  )
})

test('onChunk / onPrefix 把 delta 推到打字机队列（不再直接 appendToLastAssistantMessage）', async () => {
  const src = await readFile(CHAT_PAGE_URL, 'utf-8')
  // 关键回归：现在 onChunk / onPrefix 必须使用 typewriter.push(...)，
  // 不能直接 chatStore.appendToLastAssistantMessage（这是上一版"瞬间满屏"的根因）。
  assert.ok(
    /onChunk:\s*async\s*\([^)]*\)\s*=>\s*\{[^}]*typewriter[\s\S]*?\.push\(/.test(src),
    'onChunk 必须通过 typewriter.push(chunk) 入队，不能直接 appendToLastAssistantMessage',
  )
  assert.ok(
    /onPrefix:\s*async\s*\([^)]*\)\s*=>\s*\{[^}]*typewriter[\s\S]*?\.push\(/.test(src),
    'onPrefix 必须通过 typewriter.push(content) 入队',
  )
})

test('onDone 必须 flush 队列（剩余字符一次性写入消息）', async () => {
  const src = await readFile(CHAT_PAGE_URL, 'utf-8')
  // onDone / onError 都要 stopStreamingTypewriter(true, sink)，sink 把剩余内容写进 lastMsg.content
  assert.ok(
    /stopStreamingTypewriter\(true\s*,/.test(src),
    '必须存在 stopStreamingTypewriter 的 flush=true 调用（done / error / stop 任一处）',
  )
})

test('handleStop 也调用 stopStreamingTypewriter：手动停流时不丢失已排队字符', async () => {
  const src = await readFile(CHAT_PAGE_URL, 'utf-8')
  // 找到 handleStop 函数体内也得调 stopStreamingTypewriter
  const stopMatch = src.match(/function\s+handleStop\s*\(\s*\)\s*\{[\s\S]*?\n\}/)
  assert.ok(stopMatch, '必须存在 handleStop 函数')
  assert.ok(
    /stopStreamingTypewriter\(/.test(stopMatch[0]),
    'handleStop 必须 flush 打字机队列，否则用户点停止时 UI 会卡在部分文本',
  )
})

test('模板里有 typing-caret + v-if="msg.id === streamingMessageId"', async () => {
  const src = await readFile(CHAT_PAGE_URL, 'utf-8')
  assert.ok(
    /class="typing-caret"/.test(src),
    '模板里必须渲染打字机光标 .typing-caret',
  )
  assert.ok(
    /msg\.id\s*===\s*streamingMessageId/.test(src),
    '光标 v-if 必须绑到 msg.id === streamingMessageId（仅当前流式消息显示）',
  )
})

test('独立 3-圆点指示器只在 streamingMessageId 为空时显示（与气泡内光标不双指示）', async () => {
  const src = await readFile(CHAT_PAGE_URL, 'utf-8')
  assert.ok(
    /chatStore\.isStreaming\s*&&\s*!streamingMessageId/.test(src),
    '独立 streaming-dot 行的 v-if 必须带 && !streamingMessageId，否则会和气泡内光标双指示',
  )
})

test('useTypewriter 暴露 push / stop / isActive 三个 API', async () => {
  const src = await readFile(TYPEWRITER_URL, 'utf-8')
  assert.ok(/push\s*\(/.test(src), 'createTypewriter 必须返回 push(chunk)')
  assert.ok(/stop\s*\(/.test(src), 'createTypewriter 必须返回 stop(flush, sink)')
  assert.ok(/isActive/.test(src), 'createTypewriter 必须暴露 isActive')
})
