export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  imageUrl?: string
  createdAt: number
}

export interface ChatSession {
  id: string
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export interface ChatRequest {
  model: string
  userId: string
  sessionId: string
  messages?: Pick<Message, 'role' | 'content'>[]
  message?: string
  stream?: boolean
  temperature?: number
  max_tokens?: number
}

export interface ChatResponse {
  id: string
  choices: {
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}
