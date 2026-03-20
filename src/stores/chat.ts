import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { nanoid } from 'nanoid'
import type { Message, ChatSession } from '@/types/chat'

const DEFAULT_MODEL = import.meta.env.VITE_DEFAULT_CHAT_MODEL || 'gpt-4o'

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<ChatSession[]>([])
  const currentSessionId = ref<string | null>(null)
  const isStreaming = ref(false)
  const selectedModel = ref(DEFAULT_MODEL)

  const currentSession = computed(() =>
    sessions.value.find((s) => s.id === currentSessionId.value) ?? null,
  )

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
    currentSession,
    createSession,
    deleteSession,
    addMessage,
    appendToLastAssistantMessage,
    clearSession,
  }
})
