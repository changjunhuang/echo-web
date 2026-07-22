import { defineStore } from 'pinia'
import { ref } from 'vue'
import { nanoid } from 'nanoid'
import type { UploadFile } from '@/types/upload'

export const useUploadStore = defineStore('upload', () => {
  const files = ref<UploadFile[]>([])
  // 存储原始 File 对象，用于七牛云上传
  const fileBlobs = ref<Map<string, File>>(new Map())

  function addFile(file: File): UploadFile {
    const uploadFile: UploadFile = {
      id: nanoid(),
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'pending',
      progress: 0,
      createdAt: Date.now(),
      description: '',
    }
    files.value.unshift(uploadFile)
    fileBlobs.value.set(uploadFile.id, file)
    return uploadFile
  }

  function updateFileStatus(
    id: string,
    updates: Partial<Pick<UploadFile, 'status' | 'progress' | 'url' | 'error' | 'qiniuStatus' | 'backendStatus' | 'description'>>,
  ) {
    const file = files.value.find((f) => f.id === id)
    if (file) Object.assign(file, updates)
  }

  function removeFile(id: string) {
    const idx = files.value.findIndex((f) => f.id === id)
    if (idx !== -1) files.value.splice(idx, 1)
    fileBlobs.value.delete(id)
  }

  function getFileBlob(id: string): File | undefined {
    return fileBlobs.value.get(id)
  }

  function getFile(id: string): UploadFile | undefined {
    return files.value.find((f) => f.id === id)
  }

  function resetFileForRetry(id: string) {
    const file = files.value.find((f) => f.id === id)
    if (file) {
      file.status = 'pending'
      file.progress = 0
      file.error = undefined
    }
  }

  return { files, addFile, updateFileStatus, removeFile, getFileBlob, getFile, resetFileForRetry }
})