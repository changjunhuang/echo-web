<template>
  <div class="upload-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">文件管理</h2>
        <p class="page-desc">上传和管理文件，支持图片、文档、音视频等多种格式</p>
      </div>
    </div>

    <!-- Upload zone -->
    <div
      class="upload-zone"
      :class="{ 'upload-zone--dragging': isDragging, 'upload-zone--disabled': isUploading }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
      @click="triggerFileInput"
    >
      <input
        ref="fileInputRef"
        type="file"
        multiple
        class="file-input"
        @change="handleFileInputChange"
      />
      <div class="upload-zone-content">
        <div class="upload-icon">
          <el-icon :size="40"><UploadFilled /></el-icon>
        </div>
        <p class="upload-text">点击或拖拽文件到此区域上传</p>
        <p class="upload-hint">支持单次上传多个文件，单个文件不超过 100MB</p>
        <el-button type="primary" class="upload-btn" :loading="isUploading">
          {{ isUploading ? '上传中...' : '选择文件' }}
        </el-button>
      </div>
    </div>

    <!-- Stats bar -->
    <div class="stats-bar" v-if="uploadStore.files.length > 0">
      <div class="stat">
        <span class="stat-value">{{ uploadStore.files.length }}</span>
        <span class="stat-label">总文件数</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ successCount }}</span>
        <span class="stat-label">已上传</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ errorCount }}</span>
        <span class="stat-label">上传失败</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ formatSize(totalSize) }}</span>
        <span class="stat-label">总大小</span>
      </div>
      <div class="stat-actions">
        <el-button size="small" type="danger" plain @click="clearAll">清空记录</el-button>
      </div>
    </div>

    <!-- File list -->
    <div class="file-list-section" v-if="uploadStore.files.length > 0">
      <div class="file-list-header">
        <span class="header-name">文件名</span>
        <span class="header-size">大小</span>
        <span class="header-type">类型</span>
        <span class="header-status">状态</span>
        <span class="header-action">操作</span>
      </div>

      <div class="file-list">
        <div
          v-for="file in uploadStore.files"
          :key="file.id"
          class="file-item"
          :class="`file-item--${file.status}`"
        >
          <div class="file-icon">
            <el-icon :size="20">
              <component :is="getFileIcon(file.type)" />
            </el-icon>
          </div>

          <div class="file-info">
            <span class="file-name" :title="file.name">{{ file.name }}</span>
            <div v-if="file.status === 'uploading'" class="file-progress">
              <el-progress
                :percentage="file.progress"
                :stroke-width="4"
                :show-text="false"
                status="active"
              />
              <span class="progress-text">{{ file.progress }}%</span>
            </div>
            <span v-if="file.error" class="file-error">{{ file.error }}</span>
          </div>

          <span class="file-size">{{ formatSize(file.size) }}</span>

          <span class="file-type">
            <code>{{ getFileCategory(file.type) }}</code>
          </span>

          <div class="file-status">
            <span
              class="status-badge"
              :class="`status-badge--${file.status}`"
            >
              <el-icon v-if="file.status === 'success'"><CircleCheckFilled /></el-icon>
              <el-icon v-else-if="file.status === 'error'"><CircleCloseFilled /></el-icon>
              <el-icon v-else-if="file.status === 'uploading'"
                ><Loading class="is-loading"
              /></el-icon>
              <el-icon v-else><Clock /></el-icon>
              {{ statusText[file.status] }}
            </span>
          </div>

          <div class="file-actions">
            <el-button
              v-if="file.status === 'error' || file.status === 'pending'"
              size="small"
              type="primary"
              plain
              :icon="Upload"
              @click="retryUpload(file)"
              >重试</el-button
            >
            <el-button
              v-if="file.url"
              size="small"
              plain
              :icon="View"
              @click="openFile(file.url!)"
              >查看</el-button
            >
            <el-button
              size="small"
              type="danger"
              plain
              :icon="Delete"
              @click="removeFile(file.id)"
              >删除</el-button
            >
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="empty-state">
      <el-icon :size="64" color="rgba(0,0,0,0.15)"><FolderOpened /></el-icon>
      <p>暂无文件，请上传文件</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  UploadFilled,
  Document,
  Picture,
  VideoPlay,
  Microphone,
  FolderOpened,
  CircleCheckFilled,
  CircleCloseFilled,
  Loading,
  Clock,
  Upload,
  View,
  Delete,
} from '@element-plus/icons-vue'
import { useUploadStore } from '@/stores/upload'
import { uploadFile } from '@/api/upload'
import type { UploadFile } from '@/types/upload'

const uploadStore = useUploadStore()
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const isUploading = ref(false)

const statusText: Record<UploadFile['status'], string> = {
  pending: '等待上传',
  uploading: '上传中',
  success: '已上传',
  error: '上传失败',
}

const successCount = computed(() => uploadStore.files.filter((f) => f.status === 'success').length)
const errorCount = computed(() => uploadStore.files.filter((f) => f.status === 'error').length)
const totalSize = computed(() => uploadStore.files.reduce((sum, f) => sum + f.size, 0))

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function getFileCategory(type: string): string {
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  if (type.includes('pdf')) return 'pdf'
  if (type.includes('text')) return 'text'
  return 'file'
}

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return Picture
  if (type.startsWith('video/')) return VideoPlay
  if (type.startsWith('audio/')) return Microphone
  return Document
}

function triggerFileInput() {
  fileInputRef.value?.click()
}

function handleFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) {
    handleFiles(Array.from(input.files))
    input.value = ''
  }
}

function handleDrop(e: DragEvent) {
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (files) handleFiles(Array.from(files))
}

async function handleFiles(files: File[]) {
  if (files.length === 0) return

  const MAX_SIZE = 100 * 1024 * 1024 // 100MB
  const validFiles = files.filter((f) => {
    if (f.size > MAX_SIZE) {
      ElMessage.warning(`文件 "${f.name}" 超过 100MB 限制，已跳过`)
      return false
    }
    return true
  })

  if (validFiles.length === 0) return

  isUploading.value = true
  const uploadPromises = validFiles.map((file) => doUpload(file))
  await Promise.allSettled(uploadPromises)
  isUploading.value = false
}

async function doUpload(file: File) {
  const uploadEntry = uploadStore.addFile(file)
  uploadStore.updateFileStatus(uploadEntry.id, { status: 'uploading', progress: 0 })

  try {
    const result = await uploadFile(file, (progress) => {
      uploadStore.updateFileStatus(uploadEntry.id, { progress })
    })
    uploadStore.updateFileStatus(uploadEntry.id, {
      status: 'success',
      progress: 100,
      url: result.url,
    })
    ElMessage.success(`"${file.name}" 上传成功`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : '上传失败'
    uploadStore.updateFileStatus(uploadEntry.id, { status: 'error', error: msg })
  }
}

async function retryUpload(_file: UploadFile) {
  // Create a fake File object for retry; in a real app, re-select or keep a reference
  ElMessage.info('请重新选择文件进行上传')
}

function openFile(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function removeFile(id: string) {
  uploadStore.removeFile(id)
}

async function clearAll() {
  try {
    await ElMessageBox.confirm('确认清空所有文件记录？此操作不可撤销。', '确认清空', {
      type: 'warning',
      confirmButtonText: '确认清空',
      cancelButtonText: '取消',
    })
    uploadStore.files.splice(0, uploadStore.files.length)
  } catch {
    // user cancelled
  }
}
</script>

<style scoped>
.upload-page {
  max-width: 1000px;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: #1d2129;
  margin: 0 0 6px;
}

.page-desc {
  font-size: 14px;
  color: #86909c;
  margin: 0;
}

/* Upload zone */
.upload-zone {
  border: 2px dashed #c9cdd4;
  border-radius: 12px;
  background: #fafafa;
  padding: 48px 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.25s;
  margin-bottom: 24px;
  position: relative;
}

.upload-zone:hover {
  border-color: #165dff;
  background: #f0f5ff;
}

.upload-zone--dragging {
  border-color: #165dff;
  background: #e8f3ff;
  transform: scale(1.005);
}

.upload-zone--disabled {
  pointer-events: none;
  opacity: 0.7;
}

.file-input {
  display: none;
}

.upload-zone-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.upload-icon {
  color: #86909c;
  margin-bottom: 8px;
}

.upload-text {
  font-size: 16px;
  font-weight: 600;
  color: #1d2129;
  margin: 0;
}

.upload-hint {
  font-size: 13px;
  color: #86909c;
  margin: 0 0 12px;
}

.upload-btn {
  pointer-events: none;
}

/* Stats */
.stats-bar {
  display: flex;
  align-items: center;
  gap: 32px;
  padding: 16px 20px;
  background: #fff;
  border: 1px solid #e4e7ec;
  border-radius: 10px;
  margin-bottom: 16px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #1d2129;
}

.stat-label {
  font-size: 12px;
  color: #86909c;
}

.stat-actions {
  margin-left: auto;
}

/* File list */
.file-list-section {
  background: #fff;
  border: 1px solid #e4e7ec;
  border-radius: 10px;
  overflow: hidden;
}

.file-list-header {
  display: grid;
  grid-template-columns: 40px 1fr 100px 80px 120px 200px;
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
  background: #f7f8fa;
  border-bottom: 1px solid #e4e7ec;
  font-size: 12px;
  font-weight: 600;
  color: #86909c;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.file-list {
  display: flex;
  flex-direction: column;
}

.file-item {
  display: grid;
  grid-template-columns: 40px 1fr 100px 80px 120px 200px;
  gap: 12px;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid #f2f3f5;
  transition: background-color 0.15s;
}

.file-item:last-child {
  border-bottom: none;
}

.file-item:hover {
  background: #f9fafc;
}

.file-item--error {
  background: #fff8f6;
}

.file-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #f2f3f5;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4e5969;
  flex-shrink: 0;
}

.file-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.file-name {
  font-size: 14px;
  font-weight: 500;
  color: #1d2129;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.progress-text {
  font-size: 12px;
  color: #165dff;
  white-space: nowrap;
  flex-shrink: 0;
}

.file-error {
  font-size: 12px;
  color: #f53f3f;
}

.file-size,
.file-type {
  font-size: 13px;
  color: #86909c;
}

.file-type code {
  background: #f2f3f5;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  color: #4e5969;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 100px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge--pending {
  background: #f2f3f5;
  color: #4e5969;
}

.status-badge--uploading {
  background: #e8f3ff;
  color: #165dff;
}

.status-badge--success {
  background: #e8ffea;
  color: #00b42a;
}

.status-badge--error {
  background: #ffece8;
  color: #f53f3f;
}

.file-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: 64px 24px;
  color: #86909c;
}

.empty-state p {
  margin: 16px 0 0;
  font-size: 14px;
}
</style>
