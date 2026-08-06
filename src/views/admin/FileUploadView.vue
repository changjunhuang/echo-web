<template>
  <div class="upload-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">记忆管理</h2>
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
        <el-alert
          type="success"
          :closable="false"
          show-icon
          class="upload-tip"
        >
          <template #title>
            <strong>音视频上传建议：</strong>时长控制在 <strong>1 分钟以内</strong> 可让 AI 抽取到更精细的画面/语义细节。
          </template>
        </el-alert>
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
        <span class="header-thumb"></span>
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
            <img
              v-if="thumbSrc(file)"
              :src="thumbSrc(file)!"
              class="file-thumb-img"
              loading="lazy"
              @error="onThumbError(file.id)"
            />
            <el-icon v-else :size="20">
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
            <!-- 描述展示：仅显示，只读（编辑入口在上传前的确认弹框中） -->
            <span
              v-if="file.description"
              class="file-desc-readonly"
              :title="file.description"
            >
              {{ file.description }}
            </span>
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
              v-if="canPreview(file)"
              size="small"
              plain
              :icon="View"
              @click="openPreview(file)"
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

    <!-- 预览弹框：与记忆管理页一致，按文件类型渲染不同内容 -->
    <el-dialog
      v-model="previewDialogVisible"
      :title="previewingFile ? `预览 — ${previewingFile.name}` : '预览'"
      :width="previewDialogWidth"
      :close-on-click-modal="false"
      destroy-on-close
      class="upload-preview-dialog"
      @close="onPreviewClosed"
    >
      <div v-if="previewingFile" class="preview-body">
        <!-- 文本：以上传时填的描述作正文（纯文本记忆型文件） -->
        <div v-if="previewKind === 'text'" class="preview-text">
          {{ previewingFile.description || '（该文件没有描述内容）' }}
        </div>
        <!-- 图片 -->
        <div v-else-if="previewKind === 'image' && previewSrc" class="preview-image">
          <img :src="previewSrc" :alt="previewingFile.name" />
        </div>
        <!-- 视频 -->
        <video
          v-else-if="previewKind === 'video' && previewSrc"
          class="preview-video"
          :src="previewSrc"
          controls
          preload="metadata"
        />
        <!-- 音频 -->
        <div v-else-if="previewKind === 'audio' && previewSrc" class="preview-audio">
          <div class="preview-audio-cover">
            <el-icon :size="40"><Microphone /></el-icon>
          </div>
          <div class="preview-audio-name" :title="previewingFile.name">
            {{ previewingFile.name }}
          </div>
          <audio :src="previewSrc" controls preload="metadata" />
        </div>
        <!-- PDF/其它：有 url 就直接给一个打开链接的兜底 -->
        <div v-else-if="previewSrc" class="preview-fallback">
          <el-icon :size="36"><Document /></el-icon>
          <p>该类型暂不支持内嵌预览</p>
          <el-button type="primary" plain :icon="View" @click="openInNewTab(previewSrc)">
            在新窗口打开
          </el-button>
        </div>
        <!-- 链接都没拿到 -->
        <div v-else class="preview-empty">
          <el-icon :size="36"><Document /></el-icon>
          <p>暂无内容可预览</p>
        </div>
      </div>
      <template #footer>
        <el-button @click="previewDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 上传确认弹框：填写每个文件的描述后，才真正开始上传 -->
    <el-dialog
      v-model="confirmDialogVisible"
      title="确认上传"
      width="640px"
      :close-on-click-modal="false"
      destroy-on-close
      class="upload-confirm-dialog"
    >
      <div class="confirm-hint">
        为每个文件补充描述，AI 将结合描述内容生成记忆；描述可留空。点击「确认上传」后开始上传。
      </div>
      <div class="confirm-list">
        <div
          v-for="item in pendingConfirmItems"
          :key="item.id"
          class="confirm-item"
        >
          <div class="confirm-item-head">
            <el-icon class="confirm-item-icon">
              <component :is="getFileIcon(item.type)" />
            </el-icon>
            <span class="confirm-item-name" :title="item.name">{{ item.name }}</span>
            <span class="confirm-item-size">{{ formatSize(item.size) }}</span>
          </div>
          <el-input
            v-model="item.description"
            type="textarea"
            :rows="2"
            :autosize="{ minRows: 2, maxRows: 4 }"
            maxlength="500"
            show-word-limit
            placeholder="可选：补充描述（将用于生成记忆）"
            size="small"
          />
        </div>
      </div>
      <template #footer>
        <el-button @click="cancelConfirm" :disabled="isUploading">取消</el-button>
        <el-button type="primary" :loading="isUploading" @click="confirmUpload">
          确认上传 ({{ pendingConfirmItems.length }})
        </el-button>
      </template>
    </el-dialog>
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
import { normalizeAssetUrl } from '@/utils/url'

const uploadStore = useUploadStore()
const fileInputRef = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
const isUploading = ref(false)
const isQiniuBackendConfigured = ref(false)

/** 待上传确认项：file.id → 描述；与 store 中文件一一对应
 *  这里只持有引用，描述通过 updateFileStatus 写回 store。
 */
const confirmDialogVisible = ref(false)
const pendingConfirmItems = ref<Array<{ id: string; name: string; size: number; type: string; description: string }>>([])

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

/* 缩略图：仅对 image 类型启用；url 缺失或加载失败时回退到图标 */
const thumbErrorIds = ref<Set<string>>(new Set())
function thumbSrc(file: UploadFile): string {
  if (!file.type.startsWith('image/')) return ''
  if (!file.url) return ''
  if (thumbErrorIds.value.has(file.id)) return ''
  return normalizeAssetUrl(file.url)
}
function onThumbError(id: string) {
  thumbErrorIds.value.add(id)
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

  // 添加文件后不直接上传：弹确认框让用户填写描述
  openConfirmDialog()
}

/** 打开确认弹框：把当前所有 pending 文件的描述装入 pendingConfirmItems */
function openConfirmDialog() {
  if (isUploading.value) return
  const pendingFiles = uploadStore.files.filter((f) => f.status === 'pending')
  if (pendingFiles.length === 0) return

  pendingConfirmItems.value = pendingFiles.map((f) => ({
    id: f.id,
    name: f.name,
    size: f.size,
    type: f.type,
    description: f.description || '',
  }))
  confirmDialogVisible.value = true
}

/** 点击「取消」：清空当前未上传的确认项；store 中的 pending 文件继续保留，可后续点击「上传全部」再次拉起弹框 */
function cancelConfirm() {
  if (isUploading.value) return
  pendingConfirmItems.value = []
  confirmDialogVisible.value = false
}

/** 点击「确认上传」：把描述写回 store 文件，再触发 processUploads */
async function confirmUpload() {
  // 把描述写回 store
  for (const item of pendingConfirmItems.value) {
    uploadStore.updateFileStatus(item.id, { description: item.description.trim() })
  }
  pendingConfirmItems.value = []
  confirmDialogVisible.value = false
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
  // 与新增文件走同一路径：弹确认框
  openConfirmDialog()
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
        // 兜底 URL：用 token 响应里的 domain 拼一个，前端用它在七牛配置/响应异常时仍能渲染缩略图
        const fallbackUrl = domain ? `${domain}/${qiniuKey}` : ''

        uploadStore.updateFileStatus(file.id, {
          status: 'uploading_backend',
          progress: 0,
          url: fallbackUrl,
        })

        try {
          const regRes = await notifyUploadSuccess(qiniuKey, file.name, file.type, 1, undefined, file.description)
          // 优先用后端 GetPublicURL 出的公开 URL（已含正确协议与公共域名），
          // 没有再回退到兜底 URL，避免缩略图 / 预览拿到畸形链接
          const finalUrl = regRes?.url || fallbackUrl
          uploadStore.updateFileStatus(file.id, {
            status: 'success',
            progress: 100,
            url: finalUrl,
          })
          ElMessage.success(`"${file.name}" 上传成功`)
        } catch (backendErr) {
          uploadStore.updateFileStatus(file.id, {
            status: 'error',
            url: fallbackUrl,
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
      const regRes = await notifyUploadSuccess(key!, file.name, file.type, 1, undefined, file.description)
      // 优先用后端 GetPublicURL 出的公开 URL，没有再保留旧 URL
      const finalUrl = regRes?.url || file.url
      uploadStore.updateFileStatus(file.id, {
        status: 'success',
        progress: 100,
        error: undefined,
        url: finalUrl,
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

/* -------------------- 预览弹框（与 MemoryListView 一致） -------------------- */

/** 预览弹框里实际展示什么：text 走描述，其余按 mimeType 走媒体分支 */
const previewDialogVisible = ref(false)
const previewingFile = ref<UploadFile | null>(null)

const previewKind = computed<'text' | 'image' | 'video' | 'audio' | 'other'>(() => {
  const f = previewingFile.value
  if (!f) return 'other'
  const t = f.type
  if (t.startsWith('image/')) return 'image'
  if (t.startsWith('video/')) return 'video'
  if (t.startsWith('audio/')) return 'audio'
  // 文本类文件（前端无文件时也可由描述驱动；这里保守只把纯文本 mime 视为 text）
  if (t.startsWith('text/') || t === 'application/json') return 'text'
  return 'other'
})

/** 不同类型用不同宽度，避免窄弹框撑爆视频/图片 */
const previewDialogWidth = computed(() => {
  switch (previewKind.value) {
    case 'audio': return '480px'
    case 'video': return '800px'
    case 'image': return '720px'
    case 'text': return '600px'
    default: return '520px'
  }
})

/** 预览用 URL：补齐协议头，保证浏览器能正确加载七牛云资源 */
const previewSrc = computed(() => normalizeAssetUrl(previewingFile.value?.url))

/** 按钮可用性：text 看描述，其它看 url */
function canPreview(file: UploadFile): boolean {
  if (previewKindFor(file) === 'text') return !!(file.description && file.description.trim().length > 0)
  return !!file.url
}

function previewKindFor(file: UploadFile): 'text' | 'image' | 'video' | 'audio' | 'other' {
  const t = file.type
  if (t.startsWith('image/')) return 'image'
  if (t.startsWith('video/')) return 'video'
  if (t.startsWith('audio/')) return 'audio'
  if (t.startsWith('text/') || t === 'application/json') return 'text'
  return 'other'
}

function openPreview(file: UploadFile) {
  if (!canPreview(file)) return
  previewingFile.value = file
  previewDialogVisible.value = true
}

function onPreviewClosed() {
  previewingFile.value = null
}

function openInNewTab(url: string) {
  if (!url) return
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

.upload-tip {
  max-width: 360px;
  margin: 8px auto 12px;
  text-align: left;
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
  overflow: hidden;
}

.file-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
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

/* 描述输入框：固定单行+占整列宽度 */
.file-desc-input {
  margin-top: 0.25rem;
  width: 100%;
}

.file-desc-input :deep(.el-textarea__inner) {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.85);
  padding: 0.25rem 0.5rem;
  font-size: clamp(0.7rem, 0.85vw, 0.78rem);
  resize: none;
}

.file-desc-input :deep(.el-textarea__inner:focus) {
  border-color: rgba(22, 93, 255, 0.6);
}

.file-desc-input :deep(.el-input__count) {
  color: rgba(255, 255, 255, 0.35);
  background: transparent;
}

/* 上传确认弹框：每行一个文件，含描述输入 */
.confirm-hint {
  font-size: clamp(0.75rem, 0.9vw, 0.85rem);
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 0.75rem;
  line-height: 1.5;
}

.confirm-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  max-height: 24rem;
  overflow-y: auto;
  padding-right: 0.25rem;
}

.confirm-item {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem 0.75rem;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 0.5rem;
}

.confirm-item-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.confirm-item-icon {
  color: rgba(121, 171, 255, 0.9);
  font-size: 1rem;
  flex-shrink: 0;
}

.confirm-item-name {
  flex: 1;
  min-width: 0;
  font-size: clamp(0.78rem, 0.95vw, 0.88rem);
  color: rgba(255, 255, 255, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.confirm-item-size {
  font-size: clamp(0.7rem, 0.85vw, 0.78rem);
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}

.confirm-item :deep(.el-textarea__inner) {
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
  font-size: clamp(0.75rem, 0.9vw, 0.85rem);
  resize: none;
  box-shadow: none;
}

.confirm-item :deep(.el-textarea__inner::placeholder) {
  color: rgba(255, 255, 255, 0.35);
}

.confirm-item :deep(.el-textarea__inner:focus) {
  border-color: rgba(22, 93, 255, 0.6);
}

.confirm-item :deep(.el-input__count) {
  color: rgba(255, 255, 255, 0.35);
  background: transparent;
}

/* 上传确认弹框：暗色面板，与页面风格一致
 * 注：<el-dialog class="X"> 通过 $attrs 转发给 el-dialog-content，
 *     实际上 X 与 .el-dialog 是同一个元素，所以选择器直接用类名即可。 */
:deep(.el-dialog.upload-confirm-dialog),
:deep(.upload-confirm-dialog) {
  background: #1c1f26 !important;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

:deep(.upload-confirm-dialog .el-dialog__title) {
  color: #fff;
}

:deep(.upload-confirm-dialog .el-dialog__body) {
  color: rgba(255, 255, 255, 0.85);
}

:deep(.upload-confirm-dialog .el-dialog__header) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

:deep(.upload-confirm-dialog .el-dialog__footer) {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

/* 预览弹框：暗色面板，与记忆管理页风格一致 */
:deep(.el-dialog.upload-preview-dialog),
:deep(.upload-preview-dialog) {
  background: #1c1f26 !important;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

:deep(.upload-preview-dialog .el-dialog__title) {
  color: #fff;
}

:deep(.upload-preview-dialog .el-dialog__body) {
  color: rgba(255, 255, 255, 0.85);
}

:deep(.upload-preview-dialog .el-dialog__header) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

:deep(.upload-preview-dialog .el-dialog__footer) {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.upload-preview-dialog :deep(.el-dialog__body) {
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
}

.preview-body {
  display: flex;
  flex-direction: column;
  min-height: 4rem;
}

.preview-text {
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 60vh;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.28);
  padding: 1rem 1.1rem;
  border-radius: 0.5rem;
  color: rgba(255, 255, 255, 0.92);
  font-size: 0.9rem;
  line-height: 1.65;
  font-family: 'Cascadia Code', 'Fira Code', 'Source Han Sans SC', 'Microsoft YaHei', monospace, sans-serif;
}

.preview-image {
  text-align: center;
  background: rgba(0, 0, 0, 0.32);
  border-radius: 0.5rem;
  padding: 0.75rem;
  max-height: 65vh;
  overflow: auto;
}

.preview-image img {
  max-width: 100%;
  max-height: 62vh;
  object-fit: contain;
  display: block;
  margin: 0 auto;
}

.preview-video {
  width: 100%;
  max-height: 65vh;
  background: #000;
  border-radius: 0.5rem;
  outline: none;
  display: block;
}

.preview-audio {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.85rem;
  padding: 1rem 0.5rem 0.25rem;
}

.preview-audio-cover {
  width: 6rem;
  height: 6rem;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(121, 171, 255, 0.18), rgba(22, 93, 255, 0.32));
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.85);
}

.preview-audio-name {
  max-width: 100%;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.85);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-audio audio {
  width: 100%;
}

.preview-empty,
.preview-fallback {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 2rem 0;
  color: rgba(255, 255, 255, 0.5);
}

.preview-empty p,
.preview-fallback p {
  margin: 0;
  font-size: 0.85rem;
}

.file-desc-readonly {
  margin-top: 0.25rem;
  font-size: clamp(0.7rem, 0.85vw, 0.78rem);
  color: rgba(255, 255, 255, 0.5);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
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