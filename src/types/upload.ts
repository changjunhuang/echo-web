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
  /**
   * 用户为该文件附加的文字描述（可选）。
   * - 上传时被一同发给后端，作为后续生成记忆的提示语。
   * - 上传成功后可在"记忆管理"页继续修改（PUT /api/file/:id/desc）。
   */
  description?: string
}

export interface UploadResponse {
  id: string
  url: string
  name: string
  size: number
  type: string
}
