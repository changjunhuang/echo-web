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
import { normalizeAssetUrl, resolveUrl } from '@/utils/url'
import { downloadAsset } from '@/utils/download'
import { copyToClipboard } from '@/utils/clipboard'
import { DocumentCopy } from '@element-plus/icons-vue'

const props = defineProps<{ target: RecallMemoryItem }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const detail = ref<RecallMemoryItem | null>(null)
const mdText = ref<string>('')

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

function downloadFile(fileName: string, url: string | undefined) {
  if (!url) {
    ElMessage.warning('该文件无可用下载链接')
    return
  }
  // 走统一的 downloadAsset：fetch → Blob → <a download>，失败降级 anchor
  downloadAsset(resolveUrl(url), fileName).then((result) => {
    if (result === 'fallback') {
      ElMessage.error('下载失败，已在新窗口打开')
    }
  })
}

function downloadMd() {
  if (!mdText.value) {
    ElMessage.warning('暂无 md')
    return
  }
  const blob = new Blob([mdText.value], { type: 'text/markdown;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${props.target.memoryId}.md`
  a.click()
  URL.revokeObjectURL(a.href)
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
            <el-button size="small" link type="primary" @click="downloadFile(f.fileName, f.url)">
              下载
            </el-button>
          </div>
          <p v-if="!detail.sourceFiles?.length" class="muted">（无源文件）</p>
        </div>
      </section>

      <section>
        <h4>
          记忆内容（md）
          <el-button size="small" link type="primary" @click="downloadMd">下载 md</el-button>
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
</style>