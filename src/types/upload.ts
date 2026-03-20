export interface UploadFile {
  id: string
  name: string
  size: number
  type: string
  status: 'pending' | 'uploading' | 'success' | 'error'
  progress: number
  url?: string
  error?: string
  createdAt: number
}

export interface UploadResponse {
  id: string
  url: string
  name: string
  size: number
  type: string
}
