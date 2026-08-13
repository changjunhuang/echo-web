<script setup lang="ts">
/**
 * 聊天气泡内的附件列表（SSE `resource` 事件归一化的 ChatAttachment[]）。
 *
 * 渲染分支（按 modality 派发）：
 *   - image  → 复用 ChatImage 缩略图（自带点击预览），下方叠查看 / 下载 / 复制链接
 *   - audio  → <audio controls> 播放器
 *   - video  → <video controls> 播放器
 *   - file   → 文件卡片（图标 + 名称 + 大小 + 查看 / 下载 / 复制链接）
 *
 * 关键设计：
 *   1. URL 后端不带 scheme，必须用 resolveUrl() 拼接 https://
 *   2. 单一入口：组件接 attachments: ChatAttachment[]，按 modality 字段派发
 *   3. 下载实现：浏览器原生的 a[download] + URL.createObjectURL（处理跨域 / CORS 缺省）
 *   4. 多 chunk 文本片段显示 "分片 N/M"
 *   5. 命名稳定：用 id 作为 v-for key
 *   6. toast 反馈：成功 / 失败都用 ElMessage 提示
 */

import ChatImage from './ChatImage.vue'
import { ElMessage } from 'element-plus'
import { Download, View, CopyDocument } from '@element-plus/icons-vue'
import { resolveUrl as resolve } from '@/api/chat'
import type { ChatAttachment } from '@/types/chat'
import { downloadWith } from '@/utils/download'

const props = withDefaults(
  defineProps<{
    attachments: ChatAttachment[]
  }>(),
  { attachments: () => [] },
)

/** 稳定 key：缺 id 时退化到 fileId+chunkIndex / url+name */
function keyOf(att: ChatAttachment, idx: number): string {
  return att.id || att.fileId || `${att.url}#${att.chunkIndex ?? 0}-${idx}`
}

/** 把字节数格式化成人类可读 */
function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let n = bytes
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

/** 根据 mimeType / 文件名挑一个合适的文件图标 */
function fileIcon(att: ChatAttachment): string {
  const m = (att.mimeType || '').toLowerCase()
  if (m.includes('pdf')) return '📕'
  if (m.includes('zip') || m.includes('rar') || m.includes('7z')) return '🗜️'
  if (m.includes('word') || m.includes('msword')) return '📄'
  if (m.includes('sheet') || m.includes('excel')) return '📊'
  if (m.includes('presentation') || m.includes('powerpoint')) return '📈'
  if (m.includes('text')) return '📃'
  if (m.includes('audio')) return '🎵'
  if (m.includes('video')) return '🎬'
  const ext = (att.displayName || att.name).split('.').pop()?.toLowerCase() || ''
  if (['pdf'].includes(ext)) return '📕'
  if (['doc', 'docx'].includes(ext)) return '📄'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊'
  if (['ppt', 'pptx'].includes(ext)) return '📈'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '🗜️'
  if (['mp3', 'wav', 'flac', 'm4a'].includes(ext)) return '🎵'
  if (['mp4', 'mov', 'avi', 'mkv'].includes(ext)) return '🎬'
  if (['txt', 'md', 'log', 'json', 'xml', 'yml', 'yaml'].includes(ext)) return '📃'
  return '📎'
}

/** 文件是否能在浏览器里直接预览 */
function canPreviewInBrowser(att: ChatAttachment): boolean {
  const m = (att.mimeType || '').toLowerCase()
  if (m.startsWith('image/') || m.startsWith('text/') || m.startsWith('audio/') || m.startsWith('video/')) {
    return true
  }
  if (m === 'application/pdf' || m.includes('pdf')) return true
  if (m === 'application/json' || m === 'application/xml') return true
  const ext = (att.displayName || att.name).split('.').pop()?.toLowerCase() || ''
  if (['pdf', 'txt', 'md', 'log', 'json', 'xml', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp3', 'wav', 'mp4', 'webm'].includes(ext)) {
    return true
  }
  return false
}

/** 解析后的最终 URL（已拼 https://） */
function src(att: ChatAttachment): string {
  return resolve(att.url)
}

/** 在新标签页打开预览（不下载） */
function handleView(att: ChatAttachment) {
  const url = src(att)
  if (!url) {
    ElMessage.warning('该附件没有可访问的链接')
    return
  }
  try {
    const w = window.open(url, '_blank', 'noopener,noreferrer')
    if (!w) {
      ElMessage.warning('浏览器拦截了新窗口，请允许弹窗后重试')
    } else {
      console.info('[attachment] opened in new tab: name=%s url=%s', att.name, url)
    }
  } catch (err) {
    ElMessage.error('打开预览失败')
    console.warn('[attachment] view failed: name=%s, err=%s', att.name, (err as Error)?.message ?? String(err))
  }
}

/** 复制 URL 到剪贴板（带 scheme，方便直接用） */
async function handleCopyUrl(att: ChatAttachment) {
  const url = src(att)
  if (!url) {
    ElMessage.warning('该附件没有可复制的链接')
    return
  }
  try {
    await navigator.clipboard.writeText(url)
    ElMessage.success('链接已复制')
    console.info('[attachment] url copied: %s', url)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = url
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
      ElMessage.success('链接已复制')
    } catch {
      ElMessage.error('复制失败，请手动复制')
    } finally {
      document.body.removeChild(ta)
    }
  }
}

/** 触发浏览器下载（托管式：优先走 fileId 授权，缺失时回退到旧 fetch+blob 路径） */
async function handleDownload(att: ChatAttachment) {
  const downloadName = att.displayName || att.name || 'download'

  // 1. 优先：SSE 帧带了 fileId → 走授权
  if (att.fileId) {
    const { ok } = await downloadWith({
      kind: 'authorized',
      req: { resourceType: 'file', resourceId: att.fileId },
    })
    if (ok) return
    // 失败时不立刻回退到旧路径，避免重复下载提示
    console.warn('[attachment] authorized download failed for fileId=%s', att.fileId)
    return
  }

  // 2. 回退：旧 SSE 帧不带 fileId（早期实现）→ 走 fetch+blob+anchor。
  //    这一路径保留是因为部分历史会话可能不含 fileId；后续 SSE 协议统一后会消失。
  const url = src(att)
  if (!url) {
    ElMessage.warning('该附件没有可下载的链接')
    return
  }
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (res.ok) {
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = downloadName
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      ElMessage.success(`已下载 ${downloadName}`)
      console.info('[attachment] fallback downloaded via blob: name=%s size=%d', downloadName, blob.size)
      return
    }
    console.warn('[attachment] fetch returned %d, fallback to anchor: name=%s', res.status, downloadName)
  } catch (err) {
    console.warn(
      '[attachment] fetch failed (likely CORS), fallback to anchor: name=%s, err=%s',
      downloadName,
      (err as Error)?.message ?? String(err),
    )
  }
  const a = document.createElement('a')
  a.href = url
  if (/^https?:\/\//i.test(url)) a.download = downloadName
  a.rel = 'noopener noreferrer'
  a.target = '_blank'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  console.info('[attachment] fallback download via anchor: name=%s', downloadName)
}
</script>

<template>
  <div v-if="attachments.length" class="chat-attachment">
    <!-- 图片：缩略图 + 操作条 -->
    <div
      v-for="(att, idx) in attachments.filter((a) => a.modality === 'image')"
      :key="keyOf(att, idx)"
      class="chat-attachment__image"
    >
      <ChatImage
        :src="src(att)"
        :alt="att.displayName || att.name"
        :max-width="'24rem'"
        :max-height="'20rem'"
      />
      <div class="chat-attachment__image-actions">
        <button type="button" class="chat-attachment__action" :title="`查看 ${att.displayName || att.name}`" @click="handleView(att)">
          <el-icon><View /></el-icon>
          <span>查看</span>
        </button>
        <button type="button" class="chat-attachment__action" :title="`下载 ${att.displayName || att.name}`" @click="handleDownload(att)">
          <el-icon><Download /></el-icon>
          <span>下载</span>
        </button>
        <button type="button" class="chat-attachment__action" title="复制链接" @click="handleCopyUrl(att)">
          <el-icon><CopyDocument /></el-icon>
          <span>复制链接</span>
        </button>
      </div>
      <div v-if="att.totalChunks > 1" class="chat-attachment__chunk-hint">
        分片 {{ att.chunkIndex + 1 }}/{{ att.totalChunks }}
      </div>
      <div v-if="typeof att.similarity === 'number'" class="chat-attachment__meta">
        相似度 {{ (att.similarity * 100).toFixed(1) }}%<span v-if="att.source"> · {{ att.source }}</span>
      </div>
    </div>

    <!-- 音频：原生播放器 + 操作条 -->
    <div
      v-for="(att, idx) in attachments.filter((a) => a.modality === 'audio')"
      :key="keyOf(att, idx)"
      class="chat-attachment__media"
    >
      <audio :src="src(att)" controls preload="none" class="chat-attachment__audio">
        {{ att.displayName || att.name }}
      </audio>
      <div class="chat-attachment__media-actions">
        <button type="button" class="chat-attachment__action" :title="`下载 ${att.displayName || att.name}`" @click="handleDownload(att)">
          <el-icon><Download /></el-icon>
          <span>下载</span>
        </button>
        <button type="button" class="chat-attachment__action" title="复制链接" @click="handleCopyUrl(att)">
          <el-icon><CopyDocument /></el-icon>
          <span>复制链接</span>
        </button>
        <span class="chat-attachment__media-name">{{ att.displayName || att.name }}</span>
      </div>
    </div>

    <!-- 视频：原生播放器 + 操作条 -->
    <div
      v-for="(att, idx) in attachments.filter((a) => a.modality === 'video')"
      :key="keyOf(att, idx)"
      class="chat-attachment__media"
    >
      <video :src="src(att)" controls preload="metadata" class="chat-attachment__video" />
      <div class="chat-attachment__media-actions">
        <button type="button" class="chat-attachment__action" :title="`下载 ${att.displayName || att.name}`" @click="handleDownload(att)">
          <el-icon><Download /></el-icon>
          <span>下载</span>
        </button>
        <button type="button" class="chat-attachment__action" title="复制链接" @click="handleCopyUrl(att)">
          <el-icon><CopyDocument /></el-icon>
          <span>复制链接</span>
        </button>
        <span class="chat-attachment__media-name">{{ att.displayName || att.name }}</span>
      </div>
    </div>

    <!-- 文件：横排卡片 -->
    <div
      v-for="(att, idx) in attachments.filter((a) => a.modality === 'file')"
      :key="keyOf(att, idx)"
      class="chat-attachment__file"
    >
      <div class="chat-attachment__file-icon" aria-hidden="true">{{ fileIcon(att) }}</div>
      <div class="chat-attachment__file-body">
        <div class="chat-attachment__file-name" :title="att.displayName || att.name">
          {{ att.displayName || att.name || '未命名文件' }}
        </div>
        <div class="chat-attachment__file-meta">
          <span v-if="formatSize(att.sizeBytes)">{{ formatSize(att.sizeBytes) }}</span>
          <span v-if="att.mimeType" class="chat-attachment__file-mime">
            {{ formatSize(att.sizeBytes) ? ' · ' : '' }}{{ att.mimeType }}
          </span>
          <span v-if="att.totalChunks > 1" class="chat-attachment__file-chunk">
            分片 {{ att.chunkIndex + 1 }}/{{ att.totalChunks }}
          </span>
        </div>
      </div>
      <div class="chat-attachment__file-actions">
        <button v-if="canPreviewInBrowser(att)" type="button" class="chat-attachment__file-action" :title="`查看 ${att.displayName}`" @click="handleView(att)">
          <el-icon><View /></el-icon>
        </button>
        <button type="button" class="chat-attachment__file-action chat-attachment__file-action--primary" :title="`下载 ${att.displayName}`" @click="handleDownload(att)">
          <el-icon><Download /></el-icon>
        </button>
        <button type="button" class="chat-attachment__file-action" title="复制链接" @click="handleCopyUrl(att)">
          <el-icon><CopyDocument /></el-icon>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-attachment {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

/* ----- 图片附件 ----- */
.chat-attachment__image {
  position: relative;
  max-width: 24rem;
  border-radius: 0.75rem;
  overflow: hidden;
}
.chat-attachment__image-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.4rem;
}
.chat-attachment__chunk-hint,
.chat-attachment__meta {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 0.25rem;
}
.chat-attachment__action {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.7rem;
  border-radius: 0.45rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.85);
  font-size: clamp(0.72rem, 0.85vw, 0.8rem);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.chat-attachment__action:hover {
  background: rgba(22, 93, 255, 0.25);
  border-color: rgba(22, 93, 255, 0.55);
  color: #fff;
}
.chat-attachment__action .el-icon {
  font-size: 0.95rem;
}

/* ----- 音视频附件 ----- */
.chat-attachment__media {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  max-width: 28rem;
}
.chat-attachment__audio,
.chat-attachment__video {
  width: 100%;
  border-radius: 0.5rem;
  background: rgba(255, 255, 255, 0.04);
}
.chat-attachment__video {
  max-height: 24rem;
}
.chat-attachment__media-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}
.chat-attachment__media-name {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.55);
  margin-left: 0.25rem;
  word-break: break-all;
}

/* ----- 文件附件 ----- */
.chat-attachment__file {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.6rem 0.8rem;
  border-radius: 0.6rem;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  min-width: 14rem;
  max-width: 28rem;
  transition: all 0.2s;
}
.chat-attachment__file:hover {
  background: rgba(255, 255, 255, 0.09);
  border-color: rgba(255, 255, 255, 0.18);
}
.chat-attachment__file-icon {
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 0.45rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(22, 93, 255, 0.18);
  font-size: 1.25rem;
  flex-shrink: 0;
}
.chat-attachment__file-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.chat-attachment__file-name {
  font-size: clamp(0.8rem, 1vw, 0.9rem);
  color: rgba(255, 255, 255, 0.92);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-attachment__file-meta {
  font-size: clamp(0.7rem, 0.85vw, 0.78rem);
  color: rgba(255, 255, 255, 0.5);
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.chat-attachment__file-mime {
  font-family: monospace;
  opacity: 0.85;
}
.chat-attachment__file-chunk {
  color: rgba(22, 93, 255, 0.85);
}
.chat-attachment__file-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}
.chat-attachment__file-action {
  width: 1.95rem;
  height: 1.95rem;
  border-radius: 0.4rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.chat-attachment__file-action:hover {
  background: rgba(22, 93, 255, 0.25);
  border-color: rgba(22, 93, 255, 0.55);
  color: #fff;
}
.chat-attachment__file-action--primary {
  background: #165dff;
  border-color: #165dff;
  color: #fff;
}
.chat-attachment__file-action--primary:hover {
  background: #3a7aff;
  border-color: #3a7aff;
}
.chat-attachment__file-action .el-icon {
  font-size: 0.95rem;
}
</style>