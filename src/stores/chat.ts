import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { nanoid } from 'nanoid'
import type { ChatAttachment, ChatSession, Message } from '@/types/chat'
import { getClientIP } from '@/api/chat'
import { useAuthStore } from '@/stores/auth'

const DEFAULT_MODEL = import.meta.env.VITE_DEFAULT_CHAT_MODEL || 'gpt-4o'

/** 持久化 key：当前登录用户在 chat 维度的 sessionId。
 *  - 已登录时 == authStore.sessionId（与后端登录返回值一致）
 *  - 未登录时退回 IP 派生值，保证匿名用户也能用 */
const STORAGE_KEY_CHAT_SESSION = 'chat_wire_session_id'

/** 从 localStorage 同步一份 chat 维度的 sessionId（首屏用，避免闪烁） */
function loadPersistedChatSessionId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_CHAT_SESSION) || ''
  } catch {
    return ''
  }
}

function persistChatSessionId(value: string) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY_CHAT_SESSION, value)
    else localStorage.removeItem(STORAGE_KEY_CHAT_SESSION)
  } catch {
    /* ignore */
  }
}

function getUserId(): string {
  let userId = localStorage.getItem('chat_user_id')
  if (!userId) {
    userId = nanoid()
    localStorage.setItem('chat_user_id', userId)
  }
  return userId
}

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<ChatSession[]>([])
  const currentSessionId = ref<string | null>(null)
  const isStreaming = ref(false)
  const selectedModel = ref(DEFAULT_MODEL)
  const userId = ref(getUserId())
  const defaultSessionId = ref<string | null>(null)

  /**
   * 实际发送到后端的 sessionId。
   *  - 登录后 = authStore.sessionId（与后端 /api/auth/login 返回值严格一致）
   *  - 未登录 = 退回到 IP 派生的 anonymous sessionId
   *  - 既未登录又没拿到 IP 时 = 空字符串
   *
   * 注意：这个字段才是 ChatPage 写到 payload.sessionId 的值，
   * 之前是 currentSessionId/defaultSessionId（都是前端自生成），
   * 跟后端登录返回的 sessionId 对不上 —— 这就是用户报的"前后端 sessionId 不一致"。
   */
  const sessionId = ref<string>(loadPersistedChatSessionId())

  const currentSession = computed(() =>
    sessions.value.find((s) => s.id === currentSessionId.value) ?? null,
  )

  async function initDefaultSession() {
    if (defaultSessionId.value) return
    let sessionId = localStorage.getItem('default_session_id')
    if (!sessionId) {
      try {
        const res = (await getClientIP()) as unknown as { ip?: string }
        sessionId = `ip_${(res?.ip || 'unknown').replace(/\./g, '_')}`
        localStorage.setItem('default_session_id', sessionId)
      } catch {
        sessionId = `ip_default`
        localStorage.setItem('default_session_id', sessionId)
      }
    }
    defaultSessionId.value = sessionId
  }

  /**
   * 把外部（通常是 authStore）提供的 authSessionId 同步到 chatStore.sessionId。
   *  - 传非空值：直接采用（同时落 localStorage，供刷新后首屏用）
   *  - 传空：清空当前 sessionId，下一次读取会回退到 IP 派生
   *
   * 调用时机：
   *  - authStore.login() 成功后
   *  - authStore.bootstrap() 完成后（启动恢复）
   *  - authStore.logout() 后
   *  - 跨标签页 storage 事件
   */
  function syncSessionId(authSessionId: string) {
    const next = (authSessionId || '').trim()
    sessionId.value = next
    persistChatSessionId(next)
  }

  /**
   * 给"未登录"场景兜底：拿到 IP 派生 sessionId 后写入。
   * 登录态下不会调用，避免覆盖刚同步进来的 authSessionId。
   */
  function ensureAnonymousSession() {
    if (sessionId.value) return
    if (defaultSessionId.value) {
      sessionId.value = defaultSessionId.value
      persistChatSessionId(defaultSessionId.value)
    }
  }

  function createSession(): ChatSession {
    const session: ChatSession = {
      id: nanoid(),
      title: '新对话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    sessions.value.unshift(session)
    currentSessionId.value = session.id
    return session
  }

  function deleteSession(id: string) {
    const idx = sessions.value.findIndex((s) => s.id === id)
    if (idx !== -1) sessions.value.splice(idx, 1)
    if (currentSessionId.value === id) {
      currentSessionId.value = sessions.value[0]?.id ?? null
    }
  }

  function addMessage(sessionId: string, message: Omit<Message, 'id' | 'createdAt'>): Message {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) throw new Error('Session not found')

    const newMsg: Message = {
      ...message,
      id: nanoid(),
      createdAt: Date.now(),
    }
    session.messages.push(newMsg)
    session.updatedAt = Date.now()

    if (session.messages.length === 1 && message.role === 'user') {
      session.title = message.content.slice(0, 30) || '新对话'
    }

    return newMsg
  }

  function appendToLastAssistantMessage(sessionId: string, content: string) {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    const last = session.messages[session.messages.length - 1]
    if (last && last.role === 'assistant') {
      last.content += content
      session.updatedAt = Date.now()
    }
  }

  function setMessageImageUrl(sessionId: string, imageUrl: string) {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    const last = session.messages[session.messages.length - 1]
    if (last && last.role === 'assistant') {
      last.imageUrl = imageUrl
      session.updatedAt = Date.now()
    }
  }

  /**
   * 把一批附件追加到指定会话最后一条 assistant 消息上。
   * - 同 url 视为同一条，按 url 去重（后端在 finish 帧里再回放一次时不会重复添加）
   * - 历史会话里没有最后一条 assistant 消息时静默丢弃
   */
  function appendMessageAttachments(sessionId: string, attachments: ChatAttachment[]) {
    if (!attachments?.length) return
    const session = sessions.value.find((s) => s.id === sessionId)
    if (!session) return
    const last = session.messages[session.messages.length - 1]
    if (!last || last.role !== 'assistant') return
    const existing = last.attachments ?? []
    const knownUrls = new Set(existing.map((a) => a.url))
    const merged = [...existing]
    for (const att of attachments) {
      if (!att?.url) continue
      if (knownUrls.has(att.url)) continue
      knownUrls.add(att.url)
      merged.push(att)
    }
    last.attachments = merged
    session.updatedAt = Date.now()
  }

  function clearSession(sessionId: string) {
    const session = sessions.value.find((s) => s.id === sessionId)
    if (session) {
      session.messages = []
      session.updatedAt = Date.now()
    }
  }

  // 监听 authStore 变化：登录态切换时自动同步 sessionId。
  // 用 watch 而不是手动在每个调用点同步，避免漏改。
  const authStore = useAuthStore()
  watch(
    () => authStore.sessionId,
    (sid) => syncSessionId(sid),
    { immediate: true },
  )

  return {
    sessions,
    currentSessionId,
    isStreaming,
    selectedModel,
    userId,
    defaultSessionId,
    sessionId,
    currentSession,
    initDefaultSession,
    syncSessionId,
    ensureAnonymousSession,
    createSession,
    deleteSession,
    addMessage,
    appendToLastAssistantMessage,
    setMessageImageUrl,
    appendMessageAttachments,
    clearSession,
  }
})
