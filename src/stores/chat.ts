import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { nanoid } from 'nanoid'
import type { ChatAttachment, ChatSession, Message } from '@/types/chat'
import { getClientIP } from '@/api/chat'

const DEFAULT_MODEL = import.meta.env.VITE_DEFAULT_CHAT_MODEL || 'gpt-4o'

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

  const currentSession = computed(() =>
    sessions.value.find((s) => s.id === currentSessionId.value) ?? null,
  )

  async function initDefaultSession() {
    if (defaultSessionId.value) return
    let sessionId = localStorage.getItem('default_session_id')
    if (!sessionId) {
      try {
        const res = await getClientIP()
        sessionId = `ip_${res.ip.replace(/\./g, '_')}`
        localStorage.setItem('default_session_id', sessionId)
      } catch {
        sessionId = `ip_default`
        localStorage.setItem('default_session_id', sessionId)
      }
    }
    defaultSessionId.value = sessionId
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

  return {
    sessions,
    currentSessionId,
    isStreaming,
    selectedModel,
    userId,
    defaultSessionId,
    currentSession,
    initDefaultSession,
    createSession,
    deleteSession,
    addMessage,
    appendToLastAssistantMessage,
    setMessageImageUrl,
    appendMessageAttachments,
    clearSession,
  }
})
