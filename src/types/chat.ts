/**
 * 聊天附件：后端可在 SSE 帧里携带图片 / 文件两类可下载资源。
 * - 图片：type='image'，组件里走大图预览 + 下载
 * - 文件：type='file'，组件里渲染为带文件名的下载卡片
 *
 * 设计原则：
 *   1. mimeType / size 由后端按需提供；前端按 type 字段决定渲染分支
 *   2. 缺省 type 时按 mimeType 前缀推断（image/* → image，其余 → file）
 *   3. id 优先取后端给的，没有就由前端按 url+name 自建，保证 key 稳定
 */
export interface ChatAttachment {
  id: string
  name: string
  url: string
  mimeType?: string
  size?: number
  /** 渲染分支：image | file（缺省时按 mimeType 推断） */
  type?: 'image' | 'file'
  createdAt?: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  /** 单图字段：兼容老协议（imageUrl 一来一去）；多资源请走 attachments */
  imageUrl?: string
  /** 多附件（图片 / 文件混合），由后端 SSE 帧的 attachments 字段写入 */
  attachments?: ChatAttachment[]
  /** 消息来源：text = 键盘输入，voice = 语音识别；默认 text */
  source?: 'text' | 'voice'
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
