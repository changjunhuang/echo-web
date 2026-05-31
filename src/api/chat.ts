import request from './index'
import type { ChatRequest, ChatResponse } from '@/types/chat'

export function getClientIP(): Promise<string> {
  return request.get('/ip')
}

export function sendChatMessage(payload: ChatRequest): Promise<ChatResponse> {
  return request.post('/chat/completions', payload)
}

export function sendChatMessageStream(
  payload: ChatRequest,
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: Error) => void,
  onImageUrl?: (imageUrl: string) => void,
): AbortController {
  const controller = new AbortController()
  const baseURL = import.meta.env.VITE_API_BASE_URL || '/api'

  fetch(`${baseURL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, stream: true }),
    signal: controller.signal,
  })
    .then(async (response) => {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || '请求失败')
      }
      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const data = await response.json()
        if (data.code === 200 && data.data?.reply) {
          onChunk(data.data.reply)
        }
        if (data.data?.imageUrl) {
          onImageUrl?.(data.data.imageUrl)
        }
        onDone()
        return
      }
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) {
        onDone()
        return
      }
      const processStream = async () => {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            onDone()
            break
          }
          const text = decoder.decode(value, { stream: true })
          const lines = text.split('\n').filter((l) => l.trim())
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)
              if (data === '[DONE]') {
                onDone()
                return
              }
              try {
                const parsed = JSON.parse(data)
                const content = parsed.choices?.[0]?.delta?.content || ''
                if (content) onChunk(content)
              } catch {
                // ignore parse errors
              }
            }
          }
        }
      }
      await processStream()
    })
    .catch((error) => {
      if (error.name !== 'AbortError') {
        onError(error)
      }
    })

  return controller
}
