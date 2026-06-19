import request from './index'
import type { UploadResponse } from '@/types/upload'
import { useAuthStore } from '@/stores/auth'

export interface UploadTokenResponse {
  token: string
  key: string
  domain: string
}

/** 从 authStore 读取当前登录态的 sessionId（统一来源） */
function getAuthSessionId(): string {
  try {
    return useAuthStore().sessionId || ''
  } catch {
    return ''
  }
}

/** 从 authStore 读取当前登录态的 userId（统一来源）。
 *  用于后端需要按用户归档资源的接口（如 /file/register）。
 *  未登录时返回空串，绝不退回硬编码值。 */
function getAuthUserId(): string {
  try {
    const id = useAuthStore().currentUser?.id
    return id === undefined || id === null ? '' : String(id)
  } catch {
    return ''
  }
}

export function getUploadToken(fileName: string, fileSize: number, mimeType: string): Promise<UploadTokenResponse> {
  return request.post('/file/token', {
    fileName,
    fileSize,
    mimeType,
    bizType: 'default',
    // 关键：把登录返回的 sessionId 一起带过去，与 /api/chat 走同一份会话身份
    sessionId: getAuthSessionId(),
  })
}

export function uploadFile(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)
  // multipart 的 sessionId 用独立字段上传；form-data 里加一道就行
  formData.append('sessionId', getAuthSessionId())

  return request.post('/file/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (event.total) {
        const percent = Math.round((event.loaded * 100) / event.total)
        onProgress?.(percent)
      }
    },
  })
}

export function getFileType(mimeType: string): number {
  if (mimeType.startsWith('image/')) return 2
  if (mimeType.startsWith('video/')) return 3
  if (mimeType.startsWith('audio/')) return 4
  return 1
}

export function notifyUploadSuccess(
  key: string,
  fileName: string,
  mimeType: string,
  bizType: number = 1,
  userId?: string,
): Promise<UploadResponse> {
  const fileType = getFileType(mimeType)
  // 关键：把硬编码的 '000001' mock 值换成真实登录用户 ID。
  // 调用方未传 userId 时，从 authStore.currentUser.id 读取（统一来源）。
  return request.post('/file/register', {
    userId: userId ?? getAuthUserId(),
    fileName,
    key,
    fileType,
    bizType,
    // 同上：把 auth sessionId 带上
    sessionId: getAuthSessionId(),
  })
}

export function deleteFile(id: string): Promise<void> {
  return request.delete(`/file/upload/${id}`)
}

export function listFiles(): Promise<UploadResponse[]> {
  return request.get('/file/upload')
}
