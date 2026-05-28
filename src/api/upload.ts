import request from './index'
import type { UploadResponse } from '@/types/upload'

export interface UploadTokenResponse {
  token: string
  key: string
  domain: string
}

export function getUploadToken(fileName: string, fileSize: number, mimeType: string): Promise<UploadTokenResponse> {
  return request.post('/file/token', {
    fileName,
    fileSize,
    mimeType,
    bizType: 'default',
  })
}

export function uploadFile(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)

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
  userId: string = '000001',
): Promise<UploadResponse> {
  const fileType = getFileType(mimeType)
  return request.post('/file/register', {
    userId,
    fileName,
    key,
    fileType,
    bizType,
  })
}

export function deleteFile(id: string): Promise<void> {
  return request.delete(`/file/upload/${id}`)
}

export function listFiles(): Promise<UploadResponse[]> {
  return request.get('/file/upload')
}