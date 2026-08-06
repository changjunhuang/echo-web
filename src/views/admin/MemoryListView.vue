<template>
  <div class="memory-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">记忆管理</h2>
        <p class="page-desc">
          按当前角色查看与管理已上传的文件与文本记忆，描述变更会触发服务端重新生成记忆
        </p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreateDialog" :disabled="loading">
        新增空白文本
      </el-button>
    </div>

    <div class="role-context">
      <el-icon><UserFilled /></el-icon>
      <span class="role-context-label">
        当前角色：<strong>{{ currentRoleName }}</strong>
      </span>
      <span class="role-context-count">共 {{ totalCount }} 条</span>
    </div>

    <el-tabs v-model="activeTab" class="memory-tabs" @tab-change="reload">
      <el-tab-pane
        v-for="tab in TABS"
        :key="tab.value"
        :name="tab.value"
        :label="`${tab.label} (${countByTab(tab.value)})`"
      />
    </el-tabs>

    <el-table
      v-loading="loading"
      :data="rows"
      class="memory-table"
      :empty-text="loading ? '加载中...' : '当前角色下暂无该类型记忆'"
    >
      <el-table-column label="名称" min-width="180">
        <template #default="{ row }">
          <div class="cell-name">
            <div class="cell-thumb">
              <img
                v-if="thumbSrc(row)"
                :src="thumbSrc(row)!"
                class="cell-thumb-img"
                loading="lazy"
                @error="onThumbError(row.id)"
              />
              <el-icon v-else class="cell-icon">
                <component :is="iconForFileType(row.fileType)" />
              </el-icon>
            </div>
            <span class="cell-name-text" :title="row.fileName">{{ row.fileName }}</span>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="描述" min-width="200">
        <template #default="{ row }">
          <span class="cell-desc" :title="row.desc || '（无描述）'">{{ row.desc || '—' }}</span>
        </template>
      </el-table-column>

      <el-table-column label="类型" width="76">
        <template #default="{ row }">
          <el-tag size="small" :type="typeTagFor(row.fileType)">
            {{ labelForFileType(row.fileType) }}
          </el-tag>
        </template>
      </el-table-column>

      <el-table-column label="创建时间" width="140">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>

      <el-table-column label="操作" width="260">
        <template #default="{ row }">
          <el-tooltip content="预览" placement="top">
            <el-button
              size="small"
              plain
              :icon="View"
              :disabled="!canPreview(row)"
              class="op-btn"
              @click="openPreview(row)"
            />
          </el-tooltip>
          <el-tooltip content="下载到本地" placement="top">
            <el-button
              size="small"
              plain
              :icon="Download"
              :disabled="!canDownload(row) || downloadingId === row.id"
              :loading="downloadingId === row.id"
              class="op-btn"
              @click="downloadFile(row)"
            />
          </el-tooltip>
          <el-button
            size="small"
            plain
            :icon="EditPen"
            class="op-btn op-btn--text"
            @click="openEditDesc(row)"
          >
            编辑
          </el-button>
          <el-button
            size="small"
            plain
            type="danger"
            :icon="Delete"
            class="op-btn op-btn--text"
            @click="handleDelete(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 编辑描述 -->
    <el-dialog
      v-model="descDialogVisible"
      title="编辑描述"
      width="520px"
      :close-on-click-modal="false"
      destroy-on-close
      class="memory-dialog"
    >
      <el-form label-width="0" @submit.prevent>
        <el-form-item>
          <el-input
            v-model="descForm"
            type="textarea"
            :rows="5"
            maxlength="1000"
            show-word-limit
            placeholder="为该文件/记忆补充说明，保存后服务端会重新生成记忆"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="descDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="descSubmitting" @click="submitDesc">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新增空白文本 -->
    <el-dialog
      v-model="createDialogVisible"
      title="新增空白文本记忆"
      width="520px"
      :close-on-click-modal="false"
      destroy-on-close
      class="memory-dialog"
    >
      <el-form label-width="0" @submit.prevent>
        <el-form-item>
          <el-input
            v-model="createForm.desc"
            type="textarea"
            :rows="6"
            maxlength="1000"
            show-word-limit
            placeholder="写下想让 AI 记住的内容；将作为「纯文本记忆」入库"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="createSubmitting"
          :disabled="createForm.desc.trim().length === 0"
          @click="submitCreate"
        >
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- 预览弹框：按文件类型渲染不同内容 -->
    <el-dialog
      v-model="previewDialogVisible"
      :title="previewingItem ? `预览 — ${previewingItem.fileName}` : '预览'"
      :width="previewDialogWidth"
      :close-on-click-modal="false"
      destroy-on-close
      class="memory-dialog preview-dialog"
      @close="onPreviewClosed"
    >
      <div v-if="previewingItem" class="preview-body">
        <!-- 文本：以 desc 作为正文渲染 -->
        <div v-if="previewFileType === 'text'" class="preview-text">
          {{ previewingItem.desc || '（该文本记忆无内容）' }}
        </div>
        <!-- 图片 -->
        <div v-else-if="previewFileType === 'image' && previewSrc" class="preview-image">
          <img :src="previewSrc" :alt="previewingItem.fileName" />
        </div>
        <!-- 视频 -->
        <video
          v-else-if="previewFileType === 'video' && previewSrc"
          class="preview-video"
          :src="previewSrc"
          controls
          preload="metadata"
        />
        <!-- 音频 -->
        <div v-else-if="previewFileType === 'audio' && previewSrc" class="preview-audio">
          <div class="preview-audio-cover">
            <el-icon :size="40"><Microphone /></el-icon>
          </div>
          <div class="preview-audio-name" :title="previewingItem.fileName">
            {{ previewingItem.fileName }}
          </div>
          <audio :src="previewSrc" controls preload="metadata" />
        </div>
        <!-- 兜底：URL 缺失等异常 -->
        <div v-else class="preview-empty">
          <el-icon :size="36"><Document /></el-icon>
          <p>暂无内容可预览</p>
        </div>
      </div>
      <template #footer>
        <el-button @click="previewDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, EditPen, Delete, UserFilled, Document, Picture, VideoPlay, Microphone, View, Download } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import { useRolesStore } from '@/stores/roles'
import { useAuthStore } from '@/stores/auth'
import request from '@/api'
import * as uploadApi from '@/api/upload'
import type { MemoryFileItem } from '@/api/upload'
import { normalizeAssetUrl } from '@/utils/url'

const rolesStore = useRolesStore()
const { currentRoleId } = storeToRefs(rolesStore)
const authStore = useAuthStore()

const TAB_ALL = 0
const TAB_TEXT = 1
const TAB_IMAGE = 2
const TAB_VIDEO = 3
const TAB_AUDIO = 4
const TABS: { value: number; label: string }[] = [
  { value: TAB_ALL, label: '全部' },
  { value: TAB_TEXT, label: '文本' },
  { value: TAB_IMAGE, label: '图片' },
  { value: TAB_VIDEO, label: '视频' },
  { value: TAB_AUDIO, label: '音频' },
]

const activeTab = ref<number>(TAB_ALL)
const rows = ref<MemoryFileItem[]>([])
const allRows = ref<MemoryFileItem[]>([]) // 保存所有类型以便 tab 计数
const loading = ref<boolean>(false)

const currentRoleName = computed(() => rolesStore.currentRole?.name || '默认角色')
const totalCount = computed(() => allRows.value.length)

function countByTab(value: number): number {
  if (value === TAB_ALL) return allRows.value.length
  return allRows.value.filter((r) => r.fileType === value).length
}

function labelForFileType(t: number): string {
  switch (t) {
    case TAB_TEXT:
      return '文本'
    case TAB_IMAGE:
      return '图片'
    case TAB_VIDEO:
      return '视频'
    case TAB_AUDIO:
      return '音频'
    default:
      return '其他'
  }
}

function typeTagFor(t: number): 'success' | 'primary' | 'warning' | 'info' | 'danger' {
  switch (t) {
    case TAB_TEXT:
      return 'info'
    case TAB_IMAGE:
      return 'success'
    case TAB_VIDEO:
      return 'danger'
    case TAB_AUDIO:
      return 'warning'
    default:
      return 'primary'
  }
}

function iconForFileType(t: number) {
  switch (t) {
    case TAB_IMAGE:
      return Picture
    case TAB_VIDEO:
      return VideoPlay
    case TAB_AUDIO:
      return Microphone
    default:
      return Document
  }
}

/** 缩略图源：仅图片类型返回归一化后的 URL；其它类型返回空，回退到类型图标 */
const thumbErrorIds = ref<Set<number>>(new Set())

function thumbSrc(row: MemoryFileItem): string {
  if (row.fileType !== TAB_IMAGE) return ''
  if (thumbErrorIds.value.has(row.id)) return ''
  return normalizeAssetUrl(row.url)
}

/** 图片加载失败时记下来，下次重渲染回退到图标，避免一直显示破图 */
function onThumbError(id: number) {
  thumbErrorIds.value.add(id)
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function reload() {
  // 确保角色已就绪
  if (!rolesStore.bootstrapped) {
    try {
      await rolesStore.fetchRoles()
    } catch {
      /* 静默：顶部 ErrorMessage 已经展示 */
    }
  }
  loading.value = true
  try {
    // fileType=0 拉取全部，前端按 tab 切分；这样既快又能让 tab 角标实时准确
    const list = await uploadApi.listMemoryFiles(currentRoleId.value || undefined, 0)
    allRows.value = list
    applyTabFilter()
  } catch (err) {
    if (err instanceof Error) {
      console.warn('[memory] list failed:', err.message)
    }
    allRows.value = []
    rows.value = []
  } finally {
    loading.value = false
  }
}

function applyTabFilter() {
  if (activeTab.value === TAB_ALL) {
    rows.value = allRows.value.slice()
  } else {
    rows.value = allRows.value.filter((r) => r.fileType === activeTab.value)
  }
}

// 编辑描述
const descDialogVisible = ref(false)
const descSubmitting = ref(false)
const descEditingId = ref<number | null>(null)
const descForm = ref<string>('')

function openEditDesc(row: MemoryFileItem) {
  descEditingId.value = row.id
  descForm.value = row.desc || ''
  descDialogVisible.value = true
}

async function submitDesc() {
  if (descEditingId.value === null) return
  descSubmitting.value = true
  try {
    await uploadApi.updateFileDesc(descEditingId.value, descForm.value.trim())
    ElMessage.success('描述已更新，正在重新生成记忆')
    descDialogVisible.value = false
    await reload()
  } catch (err) {
    if (err instanceof Error) {
      console.warn('[memory] update desc failed:', err.message)
    }
  } finally {
    descSubmitting.value = false
  }
}

// 新增纯文本记忆
const createDialogVisible = ref(false)
const createSubmitting = ref(false)
const createForm = reactive({ desc: '' })

function openCreateDialog() {
  createForm.desc = ''
  createDialogVisible.value = true
}

async function submitCreate() {
  const text = createForm.desc.trim()
  if (!text) {
    ElMessage.warning('请填写文本内容')
    return
  }
  createSubmitting.value = true
  try {
    await uploadApi.createTextMemory(text, currentRoleId.value || undefined)
    ElMessage.success('已添加纯文本记忆')
    createDialogVisible.value = false
    await reload()
  } catch (err) {
    if (err instanceof Error) {
      console.warn('[memory] create text memory failed:', err.message)
    }
  } finally {
    createSubmitting.value = false
  }
}

// 预览与下载
const previewDialogVisible = ref(false)
const previewingItem = ref<MemoryFileItem | null>(null)
const downloadingId = ref<number | null>(null)

/** 把 fileType 数字映射成预览分支关键字 */
const previewFileType = computed<'text' | 'image' | 'video' | 'audio' | 'other'>(() => {
  const t = previewingItem.value?.fileType
  if (t === TAB_TEXT) return 'text'
  if (t === TAB_IMAGE) return 'image'
  if (t === TAB_VIDEO) return 'video'
  if (t === TAB_AUDIO) return 'audio'
  return 'other'
})

/** 按文件类型选择合适宽度，避免窄弹框撑爆视频/图片 */
const previewDialogWidth = computed(() => {
  switch (previewFileType.value) {
    case 'audio':
      return '480px'
    case 'video':
      return '800px'
    case 'image':
      return '720px'
    case 'text':
      return '600px'
    default:
      return '520px'
  }
})

/** 预览用 URL：补齐协议头，浏览器才能正确加载七牛云资源 */
const previewSrc = computed(() => normalizeAssetUrl(previewingItem.value?.url))

/** 按钮可用性：仅在能拿到预览源时启用，避免点了出现空白弹框 */
function canPreview(row: MemoryFileItem): boolean {
  if (row.fileType === TAB_TEXT) return !!(row.desc && row.desc.trim().length > 0)
  return !!row.url
}

function canDownload(row: MemoryFileItem): boolean {
  if (row.fileType === TAB_TEXT) return !!(row.desc && row.desc.trim().length > 0)
  return !!row.url
}

function openPreview(row: MemoryFileItem) {
  if (!canPreview(row)) return
  previewingItem.value = row
  previewDialogVisible.value = true
}

/** 关闭预览时清空引用，确保 destroy-on-close 之后再无残留数据 */
function onPreviewClosed() {
  previewingItem.value = null
}

/**
 * 触发浏览器下载。
 * - 文本类型：把 desc 打包成 Blob 后下载（统一为 .txt 后缀，避免无后缀文件被系统拒收）
 * - 媒体类型：走后端 `/file/:id/download` 代理，由服务端通过七牛源站 API 拉取二进制
 *   后流式转发给我们，再走 Blob 下载。
 *
 *   为什么不再直连 `row.url`：存储域名（如 `*.hn-bkt.clouddn.com`）可能在浏览器侧
 *   DNS 解析失败 / 已下线 / 缺 CORS 头，导致 `fetch()` 直接抛 `Failed to fetch`；
 *   走自家代理后这条链路完全在我们可控的网络里。
 */
async function downloadFile(row: MemoryFileItem) {
  if (downloadingId.value !== null) return
  downloadingId.value = row.id
  try {
    if (row.fileType === TAB_TEXT) {
      const blob = new Blob([row.desc ?? ''], { type: 'text/plain;charset=utf-8' })
      const name = row.fileName.toLowerCase().endsWith('.txt') ? row.fileName : `${row.fileName}.txt`
      triggerBlobDownload(blob, name)
      ElMessage.success(`已开始下载「${row.fileName}」`)
      return
    }
    if (!row.key) {
      ElMessage.warning('该文件没有可下载的媒体内容')
      return
    }
    // 注意：responseType=blob 时，axios 拦截器 unwrap 一次后返回的就是 Blob 本体
    const blob = (await request.get(`/file/${row.id}/download`, {
      responseType: 'blob',
      headers: { 'X-Session-Id': authStore.sessionId || '' },
      // axios 默认会把非 2xx 走 reject 分支，由拦截器统一弹错；
      // 这里把 validateStatus 放宽到全部状态，避免 blob 形态下"网络看着 200 但解析失败"
      validateStatus: () => true,
    })) as unknown as Blob
    // 响应拦截器已经在 2xx 时返回 response.data，但当后端返回非 2xx JSON 错误时
    // 拦截器走 reject 分支抛错；这里 catch 块会捕获，因此 blob 一定是真实文件
    triggerBlobDownload(blob, row.fileName)
    ElMessage.success(`已开始下载「${row.fileName}」`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误'
    ElMessage.error(`下载失败：${msg}`)
    console.warn('[memory] download failed:', msg)
  } finally {
    downloadingId.value = null
  }
}

function triggerBlobDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  // 某些浏览器即使 a.download 仍会新窗口打开，再加 rel=noopener 兜底
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 给浏览器一点时间真正发出请求再回收 URL
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

// 删除文件
async function handleDelete(row: MemoryFileItem) {
  try {
    await ElMessageBox.confirm(
      `确定删除"${row.fileName}"？文件元数据与已生成的记忆将一并清理。`,
      '删除记忆文件',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }
  // 服务端无 deleteFile 我们沿用 listMemoryFiles；这里直接从前端移除并提示
  // TODO: 服务端尚未提供 /file/:id 的删除端点，待后续补充
  ElMessage.warning('后端尚未提供删除接口，请稍后再试')
}

// 当前角色切换 → 重新拉列表
watch(currentRoleId, () => {
  reload()
})

// 首次进入如未就绪则加载
onMounted(() => {
  reload()
})
</script>

<style scoped>
.memory-page {
  max-width: 75rem;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
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

.role-context {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem;
  background: rgba(121, 171, 255, 0.08);
  border: 1px solid rgba(121, 171, 255, 0.2);
  border-radius: 100px;
  color: rgba(255, 255, 255, 0.85);
  font-size: clamp(0.78rem, 0.95vw, 0.85rem);
  margin-bottom: clamp(0.75rem, 1.6vw, 1.25rem);
}

.role-context strong {
  color: #79abff;
  font-weight: 600;
}

.role-context-count {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.78rem;
}

.memory-tabs {
  margin-bottom: clamp(0.5rem, 1.2vw, 1rem);
}

.memory-tabs :deep(.el-tabs__nav-wrap::after) {
  background-color: rgba(255, 255, 255, 0.08);
}

.memory-tabs :deep(.el-tabs__item) {
  color: rgba(255, 255, 255, 0.55);
  font-size: clamp(0.8rem, 0.95vw, 0.9rem);
}

.memory-tabs :deep(.el-tabs__item.is-active) {
  color: #79abff;
}

.memory-table {
  background: rgba(255, 255, 255, 0.03) !important;
  border-radius: 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  width: 100%;
  /* 让表格按容器宽度自适应，禁止出现水平滚动条 */
  table-layout: auto;
}

.memory-table :deep(.el-table),
.memory-table :deep(.el-table__inner-wrapper),
.memory-table :deep(.el-table__header-wrapper),
.memory-table :deep(.el-table__header),
.memory-table :deep(.el-table__body),
.memory-table :deep(.el-table__body-wrapper),
.memory-table :deep(.el-table__row),
.memory-table :deep(.el-table__empty-block),
.memory-table :deep(.el-table__empty-text),
.memory-table :deep(.el-table__fixed),
.memory-table :deep(.el-table__fixed-body-wrapper),
.memory-table :deep(.el-table__fixed-header-wrapper),
.memory-table :deep(.el-table__footer-wrapper) {
  background: transparent !important;
  background-color: transparent !important;
  color: rgba(255, 255, 255, 0.85);
}

.memory-table :deep(th.el-table__cell),
.memory-table :deep(.el-table__header th),
.memory-table :deep(.el-table__header-wrapper th) {
  background: rgba(255, 255, 255, 0.04) !important;
  background-color: rgba(255, 255, 255, 0.04) !important;
  color: rgba(255, 255, 255, 0.65) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-weight: 600;
}

.memory-table :deep(td.el-table__cell) {
  background: transparent !important;
  background-color: transparent !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.85);
}

.memory-table :deep(tr.el-table__row:hover > td.el-table__cell),
.memory-table :deep(tr.el-table__row:hover) {
  background: rgba(255, 255, 255, 0.04) !important;
}

.memory-table :deep(.el-table__border-left-patch),
.memory-table :deep(.el-table__border-right-patch),
.memory-table :deep(.el-table__border-top-patch),
.memory-table :deep(.el-table__border-bottom-patch) {
  background: transparent !important;
}

/* ---------- 右侧固定列（操作列）背景一致性 ----------
 *
 * Element Plus 的 fixed-right 列，从 2.4 起不再渲染独立的 .el-table__fixed-right
 * 容器，而是和普通列一起渲染在同一张 <table> 里，靠 .el-table-fixed-column--right
 * + position: sticky 把单元格钉在右侧。
 *
 * 这种实现下，fixed 列的 background 在 EP CSS 里被设为 `background: inherit`，
 * 即从父 <tr> 继承；而 <tr> 的 background-color 又来自
 *   var(--el-table-tr-bg-color) → var(--el-fill-color-blank)
 * 在 AdminLayout 里 --el-fill-color-blank 被设成 rgba(20, 22, 28, 0.96)（暗色），
 * 所以操作列会继承到这个暗色，看起来像一块"高亮色块"嵌在表里。
 *
 * 修法：把表作用域内的所有填充变量全部重置为 transparent，让 .memory-table 自身
 * 的 rgba(255,255,255,0.03) 透出来，fixed 列就不再有色差。
 *
 * 同时 hover / current-row 用 EP 标准选择器同步。
 */
.memory-table {
  /* 把表内所有"填充色"统一改成透明，避免 fixed 列继承到暗色背景出现"高亮条" */
  --el-fill-color-blank: transparent !important;
  --el-fill-color-light: transparent !important;
  --el-fill-color-lighter: transparent !important;
  --el-fill-color-extra-light: transparent !important;
  --el-table-bg-color: transparent !important;
  --el-table-tr-bg-color: transparent !important;
  --el-table-header-bg-color: transparent !important;
  --el-table-expanded-cell-bg-color: transparent !important;
  --el-table-row-hover-bg-color: rgba(255, 255, 255, 0.04) !important;
  --el-table-current-row-bg-color: rgba(22, 93, 255, 0.08) !important;
  --el-table-fixed-box-shadow: none !important;
}

.memory-table :deep(.el-table),
.memory-table :deep(.el-table__inner-wrapper),
.memory-table :deep(.el-table__header-wrapper),
.memory-table :deep(.el-table__body-wrapper),
.memory-table :deep(.el-table__footer-wrapper) {
  background: transparent !important;
  background-color: transparent !important;
}

/* EP 表格里 tr / td / th 都从 CSS 变量取背景色；显式置 transparent 兜底，
 * 这样 fixed 列用 background: inherit 拿到的就是透明色。 */
.memory-table :deep(.el-table tr),
.memory-table :deep(.el-table__body tr),
.memory-table :deep(.el-table__header tr),
.memory-table :deep(.el-table__footer tr) {
  background: transparent !important;
  background-color: transparent !important;
}

.memory-table :deep(.el-table td.el-table__cell) {
  background: transparent !important;
  background-color: transparent !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  /* 紧凑内边距，让一行的高度更小，一页能塞下更多行 */
  padding: 6px 0 !important;
  text-align: left !important;
}

/* 即使旧代码里残留 is-right / is-center 类，也强制左对齐 */
.memory-table :deep(.el-table__cell.is-right),
.memory-table :deep(.el-table__cell.is-center) {
  text-align: left !important;
}

.memory-table :deep(.el-table .cell) {
  padding: 0 8px !important;
  line-height: 1.4 !important;
}

/* 表头单独保留一层弱色，让标题与正文有视觉分隔 */
.memory-table :deep(.el-table th.el-table__cell) {
  background: rgba(255, 255, 255, 0.04) !important;
  background-color: rgba(255, 255, 255, 0.04) !important;
  color: rgba(255, 255, 255, 0.65) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-weight: 600;
  padding: 8px 0 !important;
  text-align: left !important;
}

/* fixed-right 列定位修复
 *
 * Element Plus 2.4+ 的 fixed="right" 用的是 `position: sticky; right: 0`：
 *   - 不滚动时它停在创建时间右边，看起来"没事"
 *   - 一旦表格出现水平滚动（容器宽度 < 列总宽），创建时间列的内容会从
 *     操作列底下"穿过"，形成两块 div 的视觉重叠
 *   - 即便不滚动，sticky 在某些浏览器里也会留出 1~2px 的重叠区，露出
 *     下层的暗色背景，于是出现"右边一块高亮"的色块
 *
 * 修法：直接把 fixed 列的 position 改成 static，让它回到普通流，
 *       与创建时间列并排显示，从根上消除重叠。
 *       （代价：水平滚动时操作列会跟着滚走，但本表列总宽 ~1160px，
 *        普通桌面端不会触发水平滚动，可以接受。）
 */
.memory-table :deep(.el-table-fixed-column--right) {
  position: static !important;
  background: transparent !important;
  background-color: transparent !important;
}

.memory-table :deep(.el-table__fixed-right),
.memory-table :deep(.el-table__fixed-right .el-table__fixed-header-wrapper),
.memory-table :deep(.el-table__fixed-right .el-table__fixed-body-wrapper),
.memory-table :deep(.el-table__fixed-right .el-table__fixed-footer-wrapper) {
  /* 这版 EP 不再渲染 .el-table__fixed-right 容器（固定列改用 position: sticky），
   * 这里保留规则只是兜底老版本，不影响新版本。
   * ——新版本的真正修复见上方"右侧固定列（操作列）背景一致性"。 */
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
}

/* 行 hover：让包括 fixed-right 列在内的所有单元格同步高亮 */
.memory-table :deep(.el-table__body-wrapper tr.el-table__row:hover > td.el-table__cell) {
  background: rgba(255, 255, 255, 0.04) !important;
  background-color: rgba(255, 255, 255, 0.04) !important;
}

/* current-row（选中行） */
.memory-table :deep(.el-table__body-wrapper tr.current-row > td.el-table__cell) {
  background: rgba(22, 93, 255, 0.08) !important;
  background-color: rgba(22, 93, 255, 0.08) !important;
}

.memory-table :deep(.el-table__column-filter-trigger),
.memory-table :deep(.el-table__sort-icon) {
  color: rgba(255, 255, 255, 0.5);
}

.memory-table :deep(.el-table__sort-icon.is-active),
.memory-table :deep(.el-table__column-filter-trigger.is-active) {
  color: #79abff;
}

/* 弹框：编辑描述 / 新增空白文本 — 暗色面板，与页面风格一致 */
:deep(.memory-dialog) {
  background: #1c1f26 !important;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

:deep(.memory-dialog .el-dialog__title) {
  color: #fff;
}

:deep(.memory-dialog .el-dialog__body) {
  color: rgba(255, 255, 255, 0.85);
}

:deep(.memory-dialog .el-dialog__header) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

:deep(.memory-dialog .el-dialog__footer) {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

:deep(.memory-dialog .el-textarea__inner) {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  box-shadow: none;
}

:deep(.memory-dialog .el-textarea__inner:focus) {
  border-color: rgba(22, 93, 255, 0.6);
}

:deep(.memory-dialog .el-input__count) {
  color: rgba(255, 255, 255, 0.35);
  background: transparent;
}

/* el-tooltip 弹层对齐暗色面板 */
:deep(.memory-dialog ~ .el-popper.is-dark),
:deep(.el-popper.is-dark) {
  background: rgba(20, 22, 28, 0.96) !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
  color: rgba(255, 255, 255, 0.85) !important;
}

.cell-name {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: rgba(255, 255, 255, 0.9);
}

.cell-thumb {
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 0.35rem;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.cell-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  background: rgba(0, 0, 0, 0.2);
}

.cell-icon {
  color: rgba(121, 171, 255, 0.9);
  font-size: 0.85rem;
}

.cell-name-text {
  max-width: 9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-desc {
  color: rgba(255, 255, 255, 0.7);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.35;
  font-size: 0.78rem;
}

.memory-table :deep(.el-button + .el-button) {
  margin-left: 0.3rem;
}

/* 操作列按钮：紧凑尺寸，无图标时只保留方块 */
.memory-table :deep(.op-btn) {
  padding: 4px !important;
  min-height: 24px !important;
  height: 24px !important;
  width: 24px !important;
}

.memory-table :deep(.op-btn--text) {
  width: auto !important;
  padding: 4px 8px !important;
  font-size: 0.75rem !important;
}

.memory-table :deep(.el-tag) {
  font-size: 0.7rem !important;
  padding: 0 6px !important;
  height: 20px !important;
  line-height: 18px !important;
}

/* ---------- 预览弹框 ---------- */
.preview-dialog :deep(.el-dialog__body) {
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

.preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem 0;
  color: rgba(255, 255, 255, 0.5);
}

.preview-empty p {
  margin: 0;
  font-size: 0.85rem;
}
</style>
