export interface UploadFile {
  id: string
  name: string
  size: number
  type: string
  status: 'pending' | 'uploading' | 'uploading_qiniu' | 'uploading_backend' | 'success' | 'error'
  progress: number
  url?: string
  error?: string
  qiniuStatus?: 'pending' | 'uploading' | 'success' | 'error'
  backendStatus?: 'pending' | 'uploading' | 'success' | 'error'
  createdAt: number
}

export interface UploadResponse {
  id: string
  url: string
  name: string
  size: number
  type: string
}