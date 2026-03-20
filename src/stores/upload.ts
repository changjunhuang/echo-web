import { defineStore } from 'pinia'
import { ref } from 'vue'
import { nanoid } from 'nanoid'
import type { UploadFile } from '@/types/upload'

export const useUploadStore = defineStore('upload', () => {
  const files = ref<UploadFile[]>([])

  function addFile(file: File): UploadFile {
    const uploadFile: UploadFile = {
      id: nanoid(),
      name: file.name,
      size: file.size,
      type: file.type,
      status: 'pending',
      progress: 0,
      createdAt: Date.now(),
    }
    files.value.unshift(uploadFile)
    return uploadFile
  }

  function updateFileStatus(
    id: string,
    updates: Partial<Pick<UploadFile, 'status' | 'progress' | 'url' | 'error'>>,
  ) {
    const file = files.value.find((f) => f.id === id)
    if (file) Object.assign(file, updates)
  }

  function removeFile(id: string) {
    const idx = files.value.findIndex((f) => f.id === id)
    if (idx !== -1) files.value.splice(idx, 1)
  }

  return { files, addFile, updateFileStatus, removeFile }
})
