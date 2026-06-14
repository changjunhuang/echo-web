<script setup lang="ts">
/**
 * 聊天气泡内的附件列表。
 *
 * 设计目标：满足"图片/文件可查看 + 可下载"的需求，并把按钮做得
 * 对用户可见、可理解、可操作。
 *
 * 渲染分支：
 *   - type='image'（或 mimeType 推断为 image/*）→ 复用 ChatImage 缩略图（自带点击预览）
 *   - type='file'（其余）→ 文件卡片
 *
 * 卡片按钮：
 *   - 查看：浏览器能直接渲染的（pdf / 图片 / 文本 / 音视频）→ 在新标签页打开预览
 *   - 下载：fetch → blob → a[download]；跨域 / 失败时回退到 a[download] 直接下载原 URL
 *   - 复制：把 URL 复制到剪贴板
 *
 * 关键设计：
 *   1. 单一入口：组件接 attachments: ChatAttachment[]，按 type 字段派发
 *   2. 下载实现：浏览器原生的 a[download] + URL.createObjectURL（处理
 *      跨域/CORS 缺省的图床，避免直接打开新窗口被拦截）
 *   3. 日志：下载 / 预览失败都有 console.warn 留痕
 *   4. 命名稳定：图片用 id 作为 v-for key，没有 id 时用 url 做 fallback
 *   5. toast 反馈：成功 / 失败都用 ElMessage 提示，给用户即时反馈
 */

import ChatImage from './ChatImage.vue'
import { ElMessage } from 'element-plus'
import { Download, View, CopyDocument } from '@element-plus/icons-vue'
import type { ChatAttachment } from '@/types/chat'

const props = withDefaults(
  defineProps<{
    attachments: ChatAttachment[]
  }>(),
  { attachments: () => [] },
)

/** 推断渲染分支：缺省时按 mimeType 前缀回退 */
function inferType(att: ChatAttachment): 'image' | 'file' {
  if (att.type === 'image' || att.type === 'file') return att.type
  if (att.mimeType?.startsWith('image/')) return 'image'
  return 'file'
}

/** 稳定 key：缺 id 时退化到 url+name */
function keyOf(att: ChatAttachment, idx: number): string {
  return att.id || att.url || `${att.name}-${idx}`
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

/** 根据 mimeType / 文件名挑一个合适的文件图标（保持简单，用 emoji 兜底） */
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
  // 看后缀名再兜底一次
  const ext = (att.name.split('.').pop() || '').toLowerCase()
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

/**
 * 判断该文件能否在浏览器里直接预览：
 *   - 图片（img/*）      → 浏览器渲染
 *   - 文本（text/*）     → 浏览器渲染
 *   - PDF（application/pdf）→ 浏览器渲染
 *   - 音视频             → 浏览器播放
 * 其余（zip、docx、xlsx 等）必须下载后才能看，"查看"按钮隐藏
 */
function canPreviewInBrowser(att: ChatAttachment): boolean {
  const m = (att.mimeType || '').toLowerCase()
  if (m.startsWith('image/') || m.startsWith('text/') || m.startsWith('audio/') || m.startsWith('video/')) {
    return true
  }
  if (m === 'application/pdf' || m.includes('pdf')) return true
  if (m === 'application/json' || m === 'application/xml') return true
  // 缺 mimeType 时按后缀兜底
  const ext = (att.name.split('.').pop() || '').toLowerCase()
  if (['pdf', 'txt', 'md', 'log', 'json', 'xml', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp3', 'wav', 'mp4', 'webm'].includes(ext)) {
    return true
  }
  return false
}

/** 在新标签页打开预览（不下载）。对 PDF / 图片 / 文本都适用 */
function handleView(att: ChatAttachment) {
  if (!att.url) {
    ElMessage.warning('该附件没有可访问的链接')
    console.warn('[attachment] view skipped: empty url, name=%s', att.name)
    return
  }
  try {
    const w = window.open(att.url, '_blank', 'noopener,noreferrer')
    if (!w) {
      // 浏览器拦截弹窗 → 提示用户
      ElMessage.warning('浏览器拦截了新窗口，请允许弹窗后重试')
      console.warn('[attachment] window.open blocked by browser: name=%s', att.name)
    } else {
      console.info('[attachment] opened in new tab: name=%s url=%s', att.name, att.url)
    }
  } catch (err) {
    ElMessage.error('打开预览失败')
    console.warn('[attachment] view failed: name=%s, err=%s', att.name, (err as Error)?.message ?? String(err))
  }
}

/** 复制 URL 到剪贴板 */
async function handleCopyUrl(att: ChatAttachment) {
  if (!att.url) {
    ElMessage.warning('该附件没有可复制的链接')
    return
  }
  try {
    await navigator.clipboard.writeText(att.url)
    ElMessage.success('链接已复制')
    console.info('[attachment] url copied: %s', att.url)
  } catch {
    // 兜底：选中文本让用户 Ctrl+C
    const ta = document.createElement('textarea')
    ta.value = att.url
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

/** 触发浏览器下载：同源用 a[download]，跨域/不带 download 属性时回退到新窗口 */
async function handleDownload(att: ChatAttachment) {
  const url = att.url
  if (!url) {
    ElMessage.warning('该附件没有可下载的链接')
    console.warn('[attachment] download skipped: empty url, name=%s', att.name)
    return
  }
  // 优先走 fetch+blob 走本进程下载（可绕过部分图床"必须新窗口打开"的限制）
  // 但跨域 + 无 CORS 时 fetch 会抛错，此时退到 a[download] / 新窗口
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (res.ok) {
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = att.name || 'download'
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // 异步释放 URL，Chrome/Edge 的"另存为"对话框需要对象存在片刻
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      ElMessage.success(`已下载 ${att.name || '文件'}`)
      console.info('[attachment] downloaded via blob: name=%s size=%d', att.name, blob.size)
      return
    }
    console.warn(
      '[attachment] fetch returned %d, fallback to anchor: name=%s',
      res.status,
      att.name,
    )
  } catch (err) {
    console.warn(
      '[attachment] fetch failed (likely CORS), fallback to anchor: name=%s, err=%s',
      att.name,
      (err as Error)?.message ?? String(err),
    )
  }
  // 兜底：直接 a[download]（同源有效）；若浏览器忽略 download 属性，会在新窗口打开
  const a = document.createElement('a')
  a.href = url
  // 兼容：http(s) 协议才设 download，避免 mailto: tel: 等被错误处理
  if (/^https?:\/\//i.test(url) || url.startsWith('/') || url.startsWith('./')) {
    a.download = att.name || 'download'
  }
  a.rel = 'noopener noreferrer'
  a.target = '_blank'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  console.info('[attachment] fallback download via anchor: name=%s', att.name)
}
</script>

<template>
  <div v-if="attachments.length" class="chat-attachment">
    <!-- 图片附件：复用 ChatImage 拿到一致的预览体验，叠加下载条 -->
    <div
      v-for="(att, idx) in attachments.filter((a) => inferType(a) === 'image')"
      :key="keyOf(att, idx)"
      class="chat-attachment__image"
    >
      <ChatImage
        :src="att.url"
        :alt="att.name || att.url"
        :max-width="'24rem'"
        :max-height="'20rem'"
      />
      <div class="chat-attachment__image-actions">
        <button
          type="button"
          class="chat-attachment__action"
          :title="`查看 ${att.name || '图片'}`"
          @click="handleView(att)"
        >
          <el-icon><View /></el-icon>
          <span>查看</span>
        </button>
        <button
          type="button"
          class="chat-attachment__action"
          :title="`下载 ${att.name || '图片'}`"
          @click="handleDownload(att)"
        >
          <el-icon><Download /></el-icon>
          <span>下载</span>
        </button>
        <button
          type="button"
          class="chat-attachment__action"
          title="复制链接"
          @click="handleCopyUrl(att)"
        >
          <el-icon><CopyDocument /></el-icon>
          <span>复制链接</span>
        </button>
      </div>
    </div>

    <!-- 文件附件：文件卡片（图标 + 名称 + 大小 + 查看/下载/复制 按钮） -->
    <div
      v-for="(att, idx) in attachments.filter((a) => inferType(a) === 'file')"
      :key="keyOf(att, idx)"
      class="chat-attachment__file"
    >
      <div class="chat-attachment__file-icon" aria-hidden="true">
        {{ fileIcon(att) }}
      </div>
      <div class="chat-attachment__file-body">
        <div class="chat-attachment__file-name" :title="att.name">
          {{ att.name || '未命名文件' }}
        </div>
        <div class="chat-attachment__file-meta">
          <span v-if="att.size">{{ formatSize(att.size) }}</span>
          <span v-if="att.mimeType" class="chat-attachment__file-mime">
            {{ att.size ? ' · ' : '' }}{{ att.mimeType }}
          </span>
        </div>
      </div>
      <div class="chat-attachment__file-actions">
        <button
          v-if="canPreviewInBrowser(att)"
          type="button"
          class="chat-attachment__file-action"
          :title="`查看 ${att.name}`"
          @click="handleView(att)"
        >
          <el-icon><View /></el-icon>
        </button>
        <button
          type="button"
          class="chat-attachment__file-action chat-attachment__file-action--primary"
          :title="`下载 ${att.name}`"
          @click="handleDownload(att)"
        >
          <el-icon><Download /></el-icon>
        </button>
        <button
          type="button"
          class="chat-attachment__file-action"
          title="复制链接"
          @click="handleCopyUrl(att)"
        >
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

/* ----- 图片附件：缩略图 + 操作条 ----- */
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

/* ----- 文件附件：横排卡片 ----- */
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
}

.chat-attachment__file-mime {
  font-family: monospace;
  opacity: 0.85;
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
