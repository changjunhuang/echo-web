<script setup lang="ts">
/**
 * 记忆主题查看弹窗（只读）：
 *  - 显示主题 + 主观描述 + 源文件下载按钮 + md 下载/预览
 *  - 仅取消按钮，无保存按钮
 */
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import type { RecallMemoryItem } from '@/api/memory'
import { getMemoryDetail } from '@/api/memory'
import { normalizeAssetUrl } from '@/utils/url'
import { copyToClipboard } from '@/utils/clipboard'
import { downloadWith } from '@/utils/download'
import { DocumentCopy } from '@element-plus/icons-vue'

const props = defineProps<{ target: RecallMemoryItem }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const detail = ref<RecallMemoryItem | null>(null)
const mdText = ref<string>('')
const downloadingFileKey = ref<string | null>(null)
const downloadingMd = ref(false)

async function load() {
  const d = await getMemoryDetail(props.target.memoryId)
  detail.value = d
  // 优先用后端下发的 md 正文（DB 缓存，权威且必达）；
  // 仅当缺失时才回退拉对象存储，且必须归一化 URL——否则无协议头的七牛地址会被
  // 当成相对路径请求到前端 dev server，拿回 index.html。
  if (d.mdContent) {
    mdText.value = d.mdContent
  } else if (d.mdUrl) {
    try {
      const r = await fetch(normalizeAssetUrl(d.mdUrl))
      mdText.value = await r.text()
    } catch {
      mdText.value = '（md 加载失败）'
    }
  }
}

/**
 * 源文件下载（托管式）。
 *
 * 通过 POST /api/file/authorize 走 memory_source 授权分支：
 *   - 后端校验 memoryId 归属 + fileKey 真在该记忆下
 *   - 签发 60s 短期 URL + HMAC(ip_sig) + 落 audit_log
 *   - 返回 url，前端 window.location.href 触发浏览器直连七牛
 */
async function downloadFile(fileName: string, fileKey: string | undefined) {
  if (!fileKey) {
    ElMessage.warning('该文件没有可下载的 key')
    return
  }
  if (downloadingFileKey.value !== null) return
  downloadingFileKey.value = fileKey
  const loadingRef = { set: (b: boolean) => { if (!b) downloadingFileKey.value = null } }
  try {
    await downloadWith({
      kind: 'authorized',
      req: {
        resourceType: 'memory_source',
        memoryId: props.target.memoryId,
        fileKey,
      },
      loading: loadingRef,
    })
  } finally {
    if (downloadingFileKey.value === fileKey) downloadingFileKey.value = null
  }
}

/**
 * md 下载（托管式）。
 *
 * 与源文件走同一套授权：POST /api/file/authorize(resourceType=memory_md) → 后端签发
 * HMAC ticket URL（/api/memory/:id/md-file?ticket=...）→ 浏览器跳转 → 后端代理层校验
 * ticket 后从 DB 读 md_content 流式返回 Content-Disposition: attachment。
 *
 * 优点：
 *   - 统一审计：所有下载都在 audit_log 落一条 ok
 *   - 统一安全：60s 过期 + IP 锁由 HMAC ticket 兜底（不依赖前端 JS）
 *   - 浏览器直链体验：与媒体文件一致，都是 window.location.href
 */
async function downloadMd() {
  if (downloadingMd.value) return
  if (!mdText.value) {
    ElMessage.warning('暂无 md（可能 AI 解析尚未完成）')
    return
  }
  await downloadWith({
    kind: 'authorized',
    req: {
      resourceType: 'memory_md',
      memoryId: props.target.memoryId,
    },
    loading: { set: (b: boolean) => { downloadingMd.value = b } },
  })
}

async function copyText(text: string, label: string) {
  await copyToClipboard(text, label)
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

onMounted(load)
</script>

<template>
  <el-dialog
    :model-value="true"
    title="查看记忆"
    width="min(880px, 92vw)"
    :close-on-click-modal="false"
    destroy-on-close
    class="memory-dialog"
    @close="emit('close')"
  >
    <div v-if="detail" class="view-block">
      <section>
        <h4>主题</h4>
        <p class="topic">{{ detail.topic }}</p>
      </section>

      <section v-if="detail.subjectiveDesc">
        <h4>
          主观描述
          <el-tooltip content="复制主观描述" placement="top">
            <el-icon
              class="copy-icon"
              @click="copyText(detail.subjectiveDesc, '主观描述')"
            >
              <DocumentCopy />
            </el-icon>
          </el-tooltip>
        </h4>
        <p class="desc">{{ detail.subjectiveDesc }}</p>
      </section>

      <section>
        <h4>源文件</h4>
        <div class="files">
          <div v-for="f in detail.sourceFiles" :key="f.fileKey" class="file-item">
            <el-tag size="small">{{ fileTypeLabel(f.fileType) }}</el-tag>
            <span class="fname">{{ f.fileName }}</span>
            <el-button
              size="small"
              link
              type="primary"
              :class="{ 'dl-btn--busy': downloadingFileKey === f.fileKey }"
              :disabled="downloadingFileKey !== null"
              @click="downloadFile(f.fileName, f.fileKey)"
            >
              <span class="dl-btn__label" :class="{ 'is-busy': downloadingFileKey === f.fileKey }">
                {{ downloadingFileKey === f.fileKey ? '准备中' : '下载' }}
              </span>
            </el-button>
          </div>
          <p v-if="!detail.sourceFiles?.length" class="muted">（无源文件）</p>
        </div>
      </section>

      <section>
        <h4>
          记忆内容（md）
          <el-button
            size="small"
            link
            type="primary"
            :class="{ 'dl-btn--busy': downloadingMd }"
            :disabled="downloadingMd"
            @click="downloadMd"
          >
            <span class="dl-btn__label" :class="{ 'is-busy': downloadingMd }">
              {{ downloadingMd ? '准备中' : '下载 md' }}
            </span>
          </el-button>
          <el-tooltip v-if="mdText" content="复制记忆内容" placement="top">
            <el-icon class="copy-icon" @click="copyText(mdText, '记忆内容')">
              <DocumentCopy />
            </el-icon>
          </el-tooltip>
        </h4>
        <pre v-if="mdText" class="md-preview">{{ mdText }}</pre>
        <p v-else class="muted">（暂无 md，可能 AI 解析尚未完成）</p>
      </section>

      <section class="meta-row">
        <span class="muted">解析状态：{{ parseStatusLabel(detail.parseStatus) }}</span>
        <span class="muted">创建：{{ formatDate(detail.createdAt) }}</span>
      </section>
    </div>

    <template #footer>
      <el-button @click="emit('close')">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script lang="ts">
function fileTypeLabel(t: number): string {
  return ['文本', '图片', '视频', '音频'][t - 1] || '未知'
}
function parseStatusLabel(s: number): string {
  return ['待解析', '解析中', '已完成', '解析失败'][s] || '未知'
}
export default { methods: { fileTypeLabel, parseStatusLabel } }
</script>

<style scoped>
.view-block {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.view-block section h4 {
  margin: 0 0 6px;
  font-size: 0.9em;
  color: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  gap: 12px;
}
.copy-icon {
  cursor: pointer;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.55);
  padding: 2px;
  border-radius: 4px;
  transition: color 0.15s, background 0.15s;
}
.copy-icon:hover {
  color: #409eff;
  background: rgba(64, 158, 255, 0.12);
}
.topic {
  font-size: 1.05em;
  font-weight: 600;
  margin: 0;
}
.desc {
  white-space: pre-wrap;
  color: rgba(255, 255, 255, 0.85);
  margin: 0;
}
.files {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.file-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
}
.fname {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.md-preview {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 10px 12px;
  max-height: 360px;
  overflow: auto;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 0.85em;
  white-space: pre-wrap;
  word-break: break-word;
}
.meta-row {
  display: flex;
  gap: 16px;
  font-size: 0.85em;
}
.muted {
  color: rgba(255, 255, 255, 0.5);
}

/* ====== 下载按钮准备中态：脉冲小圆点替代 Element Plus 默认 spinner ======= */
.dl-btn--busy {
  cursor: progress;
}
.dl-btn__label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.dl-btn__label.is-busy {
  color: rgba(22, 93, 255, 0.55);
  font-weight: 500;
}
.dl-btn__label.is-busy::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: dlPulse 1.2s ease-in-out infinite;
}
@keyframes dlPulse {
  0%, 100% {
    transform: scale(0.6);
    opacity: 0.4;
  }
  50% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>