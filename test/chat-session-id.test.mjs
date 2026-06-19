// sessionId 一致性回归测试
//
// 背景：用户报"前端传给后端的 sessionId 和后端给的不一致"——
// 根因是 chatStore 之前用的是前端自生成的 nanoid / IP 派生值（defaultSessionId），
// 而登录接口返回的 auth sessionId 存在 authStore.sessionId 里、没透传到 chat。
//
// 修复方案：chatStore 新增 sessionId 字段，由 authStore.sessionId 自动同步；
// /api/chat 发送时用 chatStore.sessionId（即 auth sessionId）。
// 文件上传相关接口（getUploadToken / notifyUploadSuccess / uploadFile）也带上同一份 sessionId。
//
// 本测试覆盖以下契约（用读源码 + 正则断言，避免起 jsdom/vitest）：
//   1. chatStore 暴露 sessionId / syncSessionId / ensureAnonymousSession
//   2. chatStore 用 watch 把 authStore.sessionId 同步到自己的 sessionId
//   3. ChatPage 的 send 调用把 wireSessionId 写到 payload.sessionId
//   4. upload.ts 的三个写接口都附带 sessionId
//   5. SSE 日志里明确"sessionId 应等于后端 /api/auth/login 返回值"

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const chatStoreSrc = await readFile(
  new URL('../src/stores/chat.ts', import.meta.url),
  'utf-8',
)
const chatPageSrc = await readFile(
  new URL('../src/views/chat/ChatPage.vue', import.meta.url),
  'utf-8',
)
const uploadSrc = await readFile(
  new URL('../src/api/upload.ts', import.meta.url),
  'utf-8',
)
const chatApiSrc = await readFile(
  new URL('../src/api/chat.ts', import.meta.url),
  'utf-8',
)
const authStoreSrc = await readFile(
  new URL('../src/stores/auth.ts', import.meta.url),
  'utf-8',
)

// ---------------------------------------------------------------------------
// 1. chatStore 契约
// ---------------------------------------------------------------------------

test('chatStore 暴露 sessionId 字段（前端发到后端的 sessionId 来源）', () => {
  // ref<string>
  assert.ok(/const\s+sessionId\s*=\s*ref<string>/.test(chatStoreSrc),
    'chatStore 应有 const sessionId = ref<string>(...)')
  // 在 return 里导出
  assert.ok(/sessionId,?\s*\n/.test(chatStoreSrc),
    'chatStore 应在 return 中导出 sessionId')
})

test('chatStore 暴露 syncSessionId / ensureAnonymousSession', () => {
  assert.ok(/function\s+syncSessionId\s*\(/.test(chatStoreSrc),
    'chatStore 应提供 syncSessionId()')
  assert.ok(/function\s+ensureAnonymousSession\s*\(/.test(chatStoreSrc),
    'chatStore 应提供 ensureAnonymousSession() 给未登录场景兜底')
})

test('chatStore 持久化 chat_wire_session_id（首屏恢复用）', () => {
  assert.ok(/chat_wire_session_id/.test(chatStoreSrc),
    'chatStore 应把 sessionId 落到 localStorage 的 chat_wire_session_id')
})

// ---------------------------------------------------------------------------
// 2. 自动同步：authStore.sessionId 变化 → chatStore.sessionId
// ---------------------------------------------------------------------------

test('chatStore 用 watch 把 authStore.sessionId 同步到自己的 sessionId', () => {
  // 抽出 watch(...) 那段
  assert.ok(/watch\s*\(\s*\(\s*\)\s*=>\s*authStore\.sessionId/.test(chatStoreSrc),
    'chatStore 应 watch authStore.sessionId')
  assert.ok(/syncSessionId\(sid\)/.test(chatStoreSrc),
    'watch 触发后应调用 syncSessionId(sid) 写入')
  assert.ok(/immediate:\s*true/.test(chatStoreSrc),
    'watch 应 immediate:true，确保 store 创建时就把当前 authSessionId 拉过来')
})

test('authStore 在 login/logout/bootstrap 都会改 sessionId（触发 watch）', () => {
  // 三处都应改 sessionId.value
  const mutations = authStoreSrc.match(/sessionId\.value\s*=/g) || []
  assert.ok(mutations.length >= 3,
    `authStore 至少在 applySession/clearSession/bootstrap 三处改 sessionId.value（实际 ${mutations.length} 处）`)
})

// ---------------------------------------------------------------------------
// 3. ChatPage 发请求时用 chatStore.sessionId
// ---------------------------------------------------------------------------

test('ChatPage 的 send 路径用 chatStore.sessionId 作为 wire sessionId', () => {
  // localSessionId 和 wireSessionId 双轨：UI 用 localSessionId 切对话，
  // 发请求用 wireSessionId（= chatStore.sessionId）
  assert.ok(/localSessionId/.test(chatPageSrc),
    'ChatPage 应区分 localSessionId（UI 分组）')
  assert.ok(/wireSessionId/.test(chatPageSrc),
    'ChatPage 应有 wireSessionId（发到后端）')
  // 发请求时 sessionId 字段用 wireSessionId。直接对全文匹配，
  // 避免被 import 行的 sendChatMessageStream 干扰。
  assert.ok(/\bsessionId:\s*wireSessionId\b/.test(chatPageSrc),
    'sendChatMessageStream 的 sessionId 字段必须等于 wireSessionId（= chatStore.sessionId）')
  // 不再直接用 defaultSessionId 当作 payload.sessionId
  assert.ok(!/\bsessionId:\s*defaultSessionId\b/.test(chatPageSrc),
    'sendChatMessageStream 的 sessionId 字段不应直接是 defaultSessionId')
  assert.ok(!/\bsessionId:\s*localSessionId\b/.test(chatPageSrc),
    'sendChatMessageStream 的 sessionId 字段不应直接是 localSessionId（UI 维度）')
})

test('ChatPage 在 onMounted 兜底：未登录时也确保 sessionId 有值', () => {
  // 找 onMounted 那块
  assert.ok(/onMounted[\s\S]{0,500}ensureAnonymousSession/.test(chatPageSrc),
    'ChatPage onMounted 应在 initDefaultSession 之后调用 ensureAnonymousSession()')
})

// ---------------------------------------------------------------------------
// 4. 上传相关接口也带 auth sessionId
// ---------------------------------------------------------------------------

test('upload.ts 三个写接口都把 sessionId 一起发给后端', () => {
  // getUploadToken / uploadFile / notifyUploadSuccess 三处
  const tokenBlock = uploadSrc.match(/getUploadToken[\s\S]{0,400}/)?.[0] || ''
  const uploadBlock = uploadSrc.match(/uploadFile\s*\([\s\S]{0,500}/)?.[0] || ''
  const registerBlock = uploadSrc.match(/notifyUploadSuccess[\s\S]{0,500}/)?.[0] || ''

  assert.ok(/sessionId:\s*getAuthSessionId\(\)/.test(tokenBlock),
    'getUploadToken 必须在 body 里带 sessionId')
  assert.ok(/formData\.append\([\s\S]*?sessionId/.test(uploadBlock),
    'uploadFile 必须在 formData 里带 sessionId（multipart 走 form field）')
  assert.ok(/sessionId:\s*getAuthSessionId\(\)/.test(registerBlock),
    'notifyUploadSuccess 必须在 body 里带 sessionId')
})

test('upload.ts 内部统一从 authStore.sessionId 读取', () => {
  assert.ok(/useAuthStore\(\)/.test(uploadSrc),
    'upload.ts 应使用 useAuthStore() 拿到登录态的 sessionId')
  assert.ok(/function\s+getAuthSessionId\s*\(/.test(uploadSrc),
    'upload.ts 应抽出统一的 getAuthSessionId() 帮助函数')
})

// ---------------------------------------------------------------------------
// 5. SSE 日志里把"sessionId 应等于登录返回值"写进注释
// ---------------------------------------------------------------------------

test('SSE 上行日志明确 sessionId 等于后端登录返回值', () => {
  // 找到 sendChatMessageStream 里的 console.info
  const logBlock = chatApiSrc.match(/console\.info\(\s*'\[sse\][\s\S]{0,400}/)?.[0] || ''
  assert.ok(/sessionId/i.test(logBlock),
    'SSE 日志应输出 sessionId 字段')
  assert.ok(/\/api\/auth\/login/.test(logBlock),
    'SSE 日志应在日志里说明 sessionId 应等于 /api/auth/login 返回值（让排查时一眼看到契约）')
})
