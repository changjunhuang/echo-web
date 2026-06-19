<template>
  <div class="upload-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">文件管理</h2>
        <p class="page-desc">上传和管理文件，支持图片、文档、音视频等多种格式</p>
      </div>
    </div>

    <!-- Config warning -->
    <div v-if="!isQiniuBackendConfigured" class="config-warning">
      <el-icon :size="20"><WarningFilled /></el-icon>
      <div class="config-warning-content">
        <p class="config-warning-title">七牛云配置未完成</p>
        <p class="config-warning-desc">
          请在 <code>.env</code> 文件中配置以下七牛云后端接口地址：
        </p>
        <ul class="config-warning-list">
          <li><code>VITE_API_BASE_URL</code> - API 后端地址（确保后端已配置七牛云参数）</li>
        </ul>
        <p class="config-warning-desc" style="margin-top: 12px;">
          后端需要实现 <code>/file/upload/token</code> 接口，返回七牛云上传凭证
        </p>
      </div>
    </div>

    <!-- Upload zone -->
    <div
      class="upload-zone"
      :class="{
        'upload-zone--dragging': isDragging,
        'upload-zone--disabled': !isQiniuBackendConfigured || isUploading
      }"
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
        <p class="upload-hint">支持单次上传多个文件，单个文件最大 2GB</p>
        <el-button type="primary" class="upload-btn" :disabled="!isQiniuBackendConfigured">
          {{ isQiniuBackendConfigured ? '选择文件' : '请先配置后端API' }}
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
        <el-button size="small" type="danger" plain @click="clearAll" :disabled="isUploading">
          清空记录
        </el-button>
        <el-button
          size="small"
          type="primary"
          plain
          @click="uploadAllPending"
          :disabled="isUploading || pendingCount === 0 || !isQiniuBackendConfigured"
        >
          上传全部 ({{ pendingCount }})
        </el-button>
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
          :class="`file-item--${getFilePrimaryStatus(file)}`"
        >
          <div class="file-icon">
            <el-icon :size="20">
              <component :is="getFileIcon(file.type)" />
            </el-icon>
          </div>

          <div class="file-info">
            <span class="file-name" :title="file.name">{{ file.name }}</span>
            <div v-if="file.status === 'uploading_qiniu' || file.status === 'uploading_backend'" class="file-progress">
              <el-progress
                :percentage="file.progress"
                :stroke-width="4"
                :show-text="false"
                status="active"
              />
              <span class="progress-text">
                {{ file.status === 'uploading_qiniu' ? '上传七牛云' : '通知后端' }} {{ file.progress }}%
              </span>
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
              :class="`status-badge--${getFilePrimaryStatus(file)}`"
            >
              <el-icon v-if="getFilePrimaryStatus(file) === 'success'"><CircleCheckFilled /></el-icon>
              <el-icon v-else-if="getFilePrimaryStatus(file) === 'error'"><CircleCloseFilled /></el-icon>
              <el-icon v-else-if="file.status === 'uploading_qiniu' || file.status === 'uploading_backend'">
                <Loading class="is-loading" />
              </el-icon>
              <el-icon v-else><Clock /></el-icon>
              {{ statusText[getFilePrimaryStatus(file)] }}
            </span>
          </div>

          <div class="file-actions">
            <el-button
              v-if="getFilePrimaryStatus(file) === 'error'"
              size="small"
              type="primary"
              plain
              :icon="Refresh"
              @click="retryUpload(file)"
            >
              重试
            </el-button>
            <el-button
              v-if="file.url"
              size="small"
              plain
              :icon="View"
              @click="openFile(file.url!)"
            >
              查看
            </el-button>
            <el-button
              size="small"
              type="danger"
              plain
              :icon="Delete"
              @click="removeFile(file.id)"
              :disabled="file.status === 'uploading_qiniu' || file.status === 'uploading_backend'"
            >
              删除
            </el-button>
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
import { ref, computed, onMounted } from 'vue'
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
  Refresh,
  View,
  Delete,
  WarningFilled,
} from '@element-plus/icons-vue'
import * as qiniu from 'qiniu-js'
import { useUploadStore } from '@/stores/upload'
import { getUploadToken, notifyUploadSuccess } from '@/api/upload'
import type { UploadFile } from '@/types/upload'

const uploadStore = useUploadStore()
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const isUploading = ref(false)
const isQiniuBackendConfigured = ref(false)

const statusText: Record<string, string> = {
  pending: '等待上传',
  uploading_qiniu: '上传七牛云',
  uploading_backend: '通知后端',
  success: '已上传',
  error: '上传失败',
}

onMounted(() => {
  isQiniuBackendConfigured.value = true
})

const successCount = computed(() => uploadStore.files.filter((f) => getFilePrimaryStatus(f) === 'success').length)
const errorCount = computed(() => uploadStore.files.filter((f) => getFilePrimaryStatus(f) === 'error').length)
const pendingCount = computed(() => uploadStore.files.filter((f) => f.status === 'pending').length)
const totalSize = computed(() => uploadStore.files.reduce((sum, f) => sum + f.size, 0))

function getFilePrimaryStatus(file: UploadFile): string {
  if (file.status === 'error') return 'error'
  if (file.status === 'success') return 'success'
  if (file.status === 'uploading_qiniu' || file.status === 'uploading_backend') return 'uploading'
  return 'pending'
}

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
  if (isQiniuBackendConfigured.value) {
    fileInputRef.value?.click()
  }
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

  if (files.length > 10) {
    ElMessage.warning('最多同时上传 10 个文件')
    files = files.slice(0, 10)
  }

  const MAX_SIZE = 2 * 1024 * 1024 * 1024 // 2GB
  const validFiles = files.filter((f) => {
    if (f.size > MAX_SIZE) {
      ElMessage.warning(`文件 "${f.name}" 超过 2GB 限制，已跳过`)
      return false
    }
    return true
  })

  if (validFiles.length === 0) return

  for (const file of validFiles) {
    uploadStore.addFile(file)
  }

  await processUploads()
}

async function processUploads() {
  const pendingFiles = uploadStore.files.filter((f) => f.status === 'pending')
  if (pendingFiles.length === 0) return

  isUploading.value = true

  const uploadPromises = pendingFiles.slice(0, 10).map((file) => doUpload(file))
  await Promise.allSettled(uploadPromises)

  isUploading.value = false
}

async function uploadAllPending() {
  await processUploads()
}

async function doUpload(file: UploadFile) {
  // 从 store 获取原始 File 对象
  const fileBlob = uploadStore.getFileBlob(file.id)
  if (!fileBlob) {
    uploadStore.updateFileStatus(file.id, { status: 'error', error: '文件对象丢失' })
    return
  }

  uploadStore.updateFileStatus(file.id, { status: 'uploading_qiniu', progress: 0 })

  try {
    // 调用后端接口获取七牛云上传凭证
    const tokenRes = await getUploadToken(file.name, file.size, file.type)
    const { token, key, domain } = tokenRes

    const observable = qiniu.upload(fileBlob, key, token, {
      fname: file.name,
      mimeType: file.type,
    }, {
      useCdnDomain: true,
      region: qiniu.region.z2,
    })
    void observable.subscribe({
      next: (res) => {
        const percent = Math.round(res.total.percent)
        uploadStore.updateFileStatus(file.id, { progress: percent })
      },
      error: (err) => {
        uploadStore.updateFileStatus(file.id, { status: 'error', error: `七牛云上传失败: ${err.message || err}` })
      },
      complete: async (res) => {
        const qiniuKey = res.key || key
        const qiniuUrl = `${domain}/${qiniuKey}`

        uploadStore.updateFileStatus(file.id, {
          status: 'uploading_backend',
          progress: 0,
          url: qiniuUrl,
        })

        try {
          await notifyUploadSuccess(qiniuKey, file.name, file.type)
          uploadStore.updateFileStatus(file.id, {
            status: 'success',
            progress: 100,
            url: qiniuUrl,
          })
          ElMessage.success(`"${file.name}" 上传成功`)
        } catch (backendErr) {
          uploadStore.updateFileStatus(file.id, {
            status: 'error',
            url: qiniuUrl,
            error: `通知后端失败: ${backendErr instanceof Error ? backendErr.message : '未知错误'}`,
          })
        }
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : '获取上传凭证失败'
    uploadStore.updateFileStatus(file.id, { status: 'error', error: msg })
  }
}

async function retryUpload(file: UploadFile) {
  const hasQiniuUrl = !!file.url && file.status === 'error' && file.error?.includes('后端')

  if (hasQiniuUrl && file.url) {
    uploadStore.updateFileStatus(file.id, { status: 'uploading_backend', progress: 0, error: undefined })
    try {
      const key = file.url.split('/').pop()
      await notifyUploadSuccess(key!, file.name, file.type)
      uploadStore.updateFileStatus(file.id, {
        status: 'success',
        progress: 100,
        error: undefined,
      })
      ElMessage.success(`"${file.name}" 通知后端成功`)
    } catch (err) {
      uploadStore.updateFileStatus(file.id, {
        status: 'error',
        error: `通知后端失败: ${err instanceof Error ? err.message : '未知错误'}`,
      })
    }
  } else {
    uploadStore.resetFileForRetry(file.id)
    await doUpload(file)
  }
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
  max-width: 70rem;
  margin: 0 auto;
}

.page-header {
  margin-bottom: clamp(1rem, 2vw, 1.5rem);
}

.page-title {
  font-size: clamp(1.1rem, 1.6vw, 1.4rem);
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.4rem;
}

.page-desc {
  font-size: clamp(0.75rem, 0.95vw, 0.9rem);
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

/* Config warning */
.config-warning {
  display: flex;
  gap: 0.75rem;
  padding: clamp(0.75rem, 1.4vw, 1rem) clamp(0.85rem, 1.6vw, 1.25rem);
  background: rgba(245, 108, 108, 0.1);
  border: 1px solid rgba(245, 108, 108, 0.3);
  border-radius: 0.6rem;
  margin-bottom: clamp(1rem, 2vw, 1.5rem);
  color: #f56c6c;
}

.config-warning-content {
  flex: 1;
}

.config-warning-title {
  font-size: clamp(0.8rem, 1vw, 0.9rem);
  font-weight: 600;
  color: #fff;
  margin: 0 0 0.5rem;
}

.config-warning-desc {
  font-size: clamp(0.7rem, 0.9vw, 0.85rem);
  color: rgba(255, 255, 255, 0.7);
  margin: 0 0 0.5rem;
}

.config-warning-list {
  margin: 0;
  padding-left: 1.25rem;
  font-size: clamp(0.7rem, 0.9vw, 0.85rem);
  color: rgba(255, 255, 255, 0.7);
}

.config-warning-list li {
  margin: 0.25rem 0;
}

.config-warning code {
  background: rgba(255, 255, 255, 0.1);
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
  font-size: clamp(0.65rem, 0.8vw, 0.78rem);
  color: #79abff;
}

/* Upload zone */
.upload-zone {
  border: 2px dashed rgba(255, 255, 255, 0.15);
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.03);
  padding: clamp(1.75rem, 4vw, 3rem) clamp(0.85rem, 1.8vw, 1.5rem);
  text-align: center;
  cursor: pointer;
  transition: all 0.25s;
  margin-bottom: clamp(1rem, 2vw, 1.5rem);
  position: relative;
}

.upload-zone:hover {
  border-color: rgba(22, 93, 255, 0.6);
  background: rgba(22, 93, 255, 0.08);
}

.upload-zone--dragging {
  border-color: rgba(22, 93, 255, 0.8);
  background: rgba(22, 93, 255, 0.12);
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
  gap: 0.5rem;
}

.upload-icon {
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 0.5rem;
}

.upload-text {
  font-size: clamp(0.85rem, 1.1vw, 1rem);
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.upload-hint {
  font-size: clamp(0.7rem, 0.9vw, 0.85rem);
  color: rgba(255, 255, 255, 0.4);
  margin: 0 0 0.75rem;
}

.upload-btn {
  pointer-events: none;
}

/* Stats */
.stats-bar {
  display: flex;
  align-items: center;
  gap: clamp(1rem, 2.4vw, 2rem);
  padding: clamp(0.75rem, 1.4vw, 1rem) clamp(0.85rem, 1.6vw, 1.25rem);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.6rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.stat-value {
  font-size: clamp(1rem, 1.4vw, 1.25rem);
  font-weight: 700;
  color: #fff;
}

.stat-label {
  font-size: clamp(0.65rem, 0.85vw, 0.78rem);
  color: rgba(255, 255, 255, 0.5);
}

.stat-actions {
  margin-left: auto;
  display: flex;
  gap: 0.5rem;
}

/* File list */
.file-list-section {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0.6rem;
  overflow: hidden;
}

.file-list-header {
  display: grid;
  grid-template-columns: 2.5rem 1fr 6rem 5rem 7.5rem 12rem;
  gap: 0.75rem;
  align-items: center;
  padding: clamp(0.5rem, 1vw, 0.75rem) clamp(0.75rem, 1.4vw, 1rem);
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: clamp(0.65rem, 0.85vw, 0.78rem);
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.file-list {
  display: flex;
  flex-direction: column;
}

.file-item {
  display: grid;
  grid-template-columns: 2.5rem 1fr 6rem 5rem 7.5rem 12rem;
  gap: 0.75rem;
  align-items: center;
  padding: clamp(0.6rem, 1.2vw, 0.9rem) clamp(0.75rem, 1.4vw, 1rem);
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background-color 0.15s;
}

.file-item:last-child {
  border-bottom: none;
}

.file-item:hover {
  background: rgba(255, 255, 255, 0.03);
}

.file-item--error {
  background: rgba(245, 108, 108, 0.05);
}

.file-icon {
  width: clamp(1.8rem, 2.4vw, 2.25rem);
  height: clamp(1.8rem, 2.4vw, 2.25rem);
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.7);
  flex-shrink: 0;
}

.file-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.file-name {
  font-size: clamp(0.8rem, 1vw, 0.9rem);
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-progress {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.progress-text {
  font-size: clamp(0.65rem, 0.85vw, 0.78rem);
  color: #79abff;
  white-space: nowrap;
  flex-shrink: 0;
}

.file-error {
  font-size: clamp(0.65rem, 0.85vw, 0.78rem);
  color: #f56c6c;
}

.file-size,
.file-type {
  font-size: clamp(0.7rem, 0.9vw, 0.85rem);
  color: rgba(255, 255, 255, 0.5);
}

.file-type code {
  background: rgba(255, 255, 255, 0.08);
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
  font-size: clamp(0.6rem, 0.8vw, 0.7rem);
  color: rgba(255, 255, 255, 0.7);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.6rem;
  border-radius: 100px;
  font-size: clamp(0.65rem, 0.85vw, 0.78rem);
  font-weight: 500;
}

.status-badge--pending {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}

.status-badge--uploading {
  background: rgba(22, 93, 255, 0.2);
  color: #79abff;
}

.status-badge--success {
  background: rgba(0, 180, 42, 0.15);
  color: #67c23a;
}

.status-badge--error {
  background: rgba(245, 108, 108, 0.15);
  color: #f56c6c;
}

.file-actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

/* Empty state */
.empty-state {
  text-align: center;
  padding: clamp(2.5rem, 5vw, 4rem) clamp(1rem, 2vw, 1.5rem);
  color: rgba(255, 255, 255, 0.4);
}

.empty-state p {
  margin: 1rem 0 0;
  font-size: clamp(0.8rem, 1vw, 0.9rem);
}
</style>