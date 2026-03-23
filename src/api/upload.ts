import request from './index'
import type { UploadResponse } from '@/types/upload'

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

export function deleteFile(id: string): Promise<void> {
  return request.delete(`/file/upload/${id}`)
}

export function listFiles(): Promise<UploadResponse[]> {
  return request.get('/file/upload')
}
