<script setup lang="ts">
/**
 * 记忆主题新增/编辑弹窗：
 *  - 新增：applyMemory → 上传所有源文件到七牛（并发5/分片/重试）→ saveMemory
 *  - 编辑：topic 一经填写不可编辑；可新增/删除源文件；主观描述可编辑；
 *         记忆内容（md）由 AI 生成，**不允许人工修改**，仅可复制。
 *  - 校验：新增时主题唯一性（checkTopic）、非空、主观描述 ≤1000；编辑时不校验主题
 *  - 编辑"保存"语义：
 *      · 源文件新增/删除或主观描述修改 → needReparse=true → 后端异步触发 AI 重建
 *      · 完全无改动点击"保存" → needReparse=false → 仅落库，不重复解析
 *
 * 视觉锁：editStatus=1 时禁用 md 与"保存"
 */
import { ref, computed, onMounted, reactive } from 'vue'
import type { FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  applyMemory,
  checkTopic,
  getMemoryUploadToken,
  saveMemory,
  updateMemory,
  getMemoryDetail,
  deleteSourceFile,
  type RecallMemoryItem,
  type SourceFileItem,
} from '@/api/memory'
import { UploadQueue, isLargeFile, type QueueItem } from '@/utils/qiniuUpload'
import { normalizeAssetUrl } from '@/utils/url'
import { resolveFileType } from '@/utils/fileType'
import { copyToClipboard } from '@/utils/clipboard'

const props = defineProps<{
  mode: 'create' | 'edit'
  target?: RecallMemoryItem | null
}>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved', item: RecallMemoryItem): void
}>()

const form = reactive({
  topic: '',
  subjectiveDesc: '',
})

interface PendingFile {
  id: string
  file: File
  /** 权威 fileType（保存时直接透传，避免按 File.type 二次推导时被空 File 占位降级成 1） */
  fileType: number
  fileKey?: string
  progress: number
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
}

const memoryId = ref<string>('')
const mdKey = ref<string>('')
const editStatus = ref(0)
const sourceFiles = ref<PendingFile[]>([])
const detail = ref<RecallMemoryItem | null>(null)
const mdText = ref('')
const saving = ref(false)

// ===== 编辑模式"是否有变更"判定 =====
//
// 进入编辑时由 loadDetail 记录一个快照；保存时与当前状态做严格 diff：
//   - 源文件 fileKey 集合变化（新加/删除） → filesChanged = true
//   - 主观描述 trim 后变化                   → descChanged = true
// 二者之一为 true → needReparse = true → 后端异步触发 AI 重建。
// 均为 false → 仅落库，不触发 LLM 重解析（"无改动保存"语义）。
const initialSubjectiveDesc = ref('')
const initialSourceFileKeys = ref<string[]>([])

function fileKeySet(): string[] {
  return sourceFiles.value
    .map((f) => f.fileKey)
    .filter((k): k is string => !!k)
    .slice()
    .sort()
}

/** 源文件增删判定：当前 fileKey 集合 vs 进入编辑时的初始集合。 */
function filesChanged(): boolean {
  const cur = fileKeySet()
  const init = initialSourceFileKeys.value
  if (cur.length !== init.length) return true
  for (let i = 0; i < cur.length; i++) if (cur[i] !== init[i]) return true
  return false
}

/** 主观描述改动判定：前后 trim 后做严格相等比较，避免"只敲了空格就触发了重解析"。 */
function descChanged(): boolean {
  return form.subjectiveDesc.trim() !== initialSubjectiveDesc.value.trim()
}

// 唯一性校验：编辑模式下 topic 已锁定，不做校验；新增模式做
const topicCheckLoading = ref(false)
const topicExists = ref(false)
async function validateTopic() {
  if (props.mode === 'edit') return
  if (!form.topic.trim()) {
    topicExists.value = false
    return
  }
  topicCheckLoading.value = true
  try {
    const { exists } = await checkTopic(form.topic.trim())
    topicExists.value = exists
  } catch {
    topicExists.value = false
  } finally {
    topicCheckLoading.value = false
  }
}

const rules: FormRules = {
  topic: [
    { required: true, message: '请输入记忆主题', trigger: 'blur' },
    { min: 1, max: 255, message: '长度 1~255 字符', trigger: 'blur' },
  ],
  subjectiveDesc: [{ max: 1000, message: '描述最多 1000 字', trigger: 'blur' }],
}

const canEditTopic = computed(() => props.mode === 'create')
const isAILocked = computed(() => editStatus.value === 1)

// 队列（并发 5）
const queue = new UploadQueue({
  concurrency: 5,
  retries: 3,
  onItemUpdate(id, patch) {
    const f = sourceFiles.value.find((x) => x.id === id)
    if (!f) return
    if (patch.progress != null) f.progress = patch.progress
    if (patch.status != null) f.status = patch.status
    if (patch.error != null) f.error = patch.error
    // 上传成功时把七牛对象 key 回写到 PendingFile，save 接口要用它
    if (patch.fileKey != null) f.fileKey = patch.fileKey
  },
})

async function ensureMemoryId(): Promise<string> {
  if (memoryId.value) return memoryId.value
  const { memoryId: id } = await applyMemory()
  memoryId.value = id
  return id
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function fileTypeOf(f: File): number {
  return resolveFileType({ fileName: f.name, mimeType: f.type })
}

function pickFiles() {
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.onchange = () => {
    if (!input.files) return
    // 收集新加的文件 → 立即逐个启动异步上传（边加边传，避免"保存时才上传"的卡顿）
    const newFiles: PendingFile[] = []
    for (const f of Array.from(input.files)) {
      const pf: PendingFile = {
        id: genId(),
        file: f,
        // 入栈时一次性算好权威 fileType，后续保存不再二次推导
        fileType: fileTypeOf(f),
        progress: 0,
        status: 'pending',
      }
      sourceFiles.value.push(pf)
      newFiles.push(pf)
    }
    // 编辑模式下："是否需要重解析"在 handleSubmit 中通过 filesChanged() diff 决定，
    // 这里不立即标记 dirty（避免给用户"看起来一定变"的暗示）

    // 大文件二次确认（任一超大文件弹出一次）
    void confirmLargeFiles(newFiles)
    // 后台启动上传（不 await；UI 通过进度/状态反应）
    for (const pf of newFiles) {
      void startUpload(pf).catch(() => {
        /* 错误已写入 pf.status，无需再 toast */
      })
    }
  }
  input.click()
}

/** 大于阈值的文件二次确认（逐个弹窗，最多弹一次） */
async function confirmLargeFiles(files: PendingFile[]) {
  for (const f of files) {
    if (isLargeFile(f.file.size)) {
      try {
        await ElMessageBox.confirm(
          `「${f.file.name}」文件较大（${(f.file.size / 1024 / 1024).toFixed(1)} MB），是否继续上传？`,
          '大文件确认',
          { type: 'warning', confirmButtonText: '继续上传', cancelButtonText: '取消' },
        )
      } catch {
        // 用户取消：标记 error，让 UI 显示重试/移除
        f.status = 'error'
        f.error = '用户取消'
      }
    }
  }
}

/** 异步启动单个文件的上传（与 retryUpload 复用队列） */
async function startUpload(pf: PendingFile) {
  try {
    const memId = await ensureMemoryId()
    const token = await getMemoryUploadToken(memId, pf.file.name, false)
    pf.status = 'uploading'
    pf.progress = 0
    queue.enqueue({
      id: pf.id,
      file: pf.file,
      token,
      key: token.key,
      onProgress: (p) => (pf.progress = p),
    } as QueueItem)
  } catch (e) {
    pf.status = 'error'
    pf.error = e instanceof Error ? e.message : String(e)
  }
}

function removePendingFile(id: string) {
  const f = sourceFiles.value.find((x) => x.id === id)
  if (f?.status === 'uploading') {
    ElMessage.warning('文件正在上传中，请稍后再删')
    return
  }
  sourceFiles.value = sourceFiles.value.filter((x) => x.id !== id)
  // 编辑模式下："是否需要重解析"在 handleSubmit 时通过 filesChanged() diff 判定；
  // 这里不主动标记 dirty，避免前后端对 dirty 状态产生分歧。
}

async function retryUpload(id: string) {
  const f = sourceFiles.value.find((x) => x.id === id)
  if (!f) return
  f.status = 'pending'
  f.error = undefined
  f.fileKey = undefined
  void startUpload(f)
}

async function handleSubmit() {
  if (props.mode === 'create' && topicExists.value) {
    ElMessage.error('主题已存在，请换一个')
    return
  }
  if (props.mode === 'create' && sourceFiles.value.length === 0) {
    ElMessage.error('请至少添加一个源文件')
    return
  }
  // 校验所有源文件状态
  const uploading = sourceFiles.value.filter((f) => f.status === 'pending' || f.status === 'uploading')
  const failed = sourceFiles.value.filter((f) => f.status === 'error')
  if (failed.length > 0) {
    ElMessage.error(`${failed.length} 个文件上传失败，请重试或移除后再保存`)
    return
  }
  if (uploading.length > 0) {
    ElMessage.warning(`还有 ${uploading.length} 个文件正在上传，请稍候…`)
    // 等所有在途文件完成（最多等 5 分钟防止卡死）
    await waitForUploadsWithTimeout(5 * 60 * 1000)
    const stillUploading = sourceFiles.value.filter(
      (f) => f.status === 'pending' || f.status === 'uploading',
    )
    const stillFailed = sourceFiles.value.filter((f) => f.status === 'error')
    if (stillFailed.length > 0) {
      ElMessage.error(`${stillFailed.length} 个文件上传失败，请重试或移除`)
      return
    }
    if (stillUploading.length > 0) {
      ElMessage.error('文件上传超时，请重试或检查网络')
      return
    }
  }
  saving.value = true
  try {
    const items = await collectSourceFileItems()
    const id = await ensureMemoryId()
    if (props.mode === 'edit') {
      // 编辑模式：精打细算"是否需要重解析"，避免无谓的 LLM 调用与向量重建
      const rep = filesChanged() || descChanged()
      // 即使 needReparse 一直是 false，也允许把当前 desc 持久化（"无改动保存"场景）
      const saved = await updateMemory({
        memoryId: id,
        topic: form.topic.trim(),
        subjectiveDesc: form.subjectiveDesc.trim(),
        sourceFiles: items,
        needReparse: rep,
      })
      ElMessage.success(rep ? '已保存，AI 正在重新解析' : '已保存')
      emit('saved', saved)
    } else {
      // 新增模式：原有流程不变（save 接口自带 topic 唯一性校验、解析链路）
      const saved = await saveMemory({
        memoryId: id,
        topic: form.topic.trim(),
        subjectiveDesc: form.subjectiveDesc.trim(),
        sourceFiles: items,
      })
      ElMessage.success('保存成功')
      emit('saved', saved)
    }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : String(e))
  } finally {
    saving.value = false
  }
}

/** 等所有上传完成，带超时（防止 queue 死循环卡死） */
function waitForUploadsWithTimeout(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs
    const tick = () => {
      const allDone = sourceFiles.value.every(
        (f) => f.status === 'success' || f.status === 'error',
      )
      if (allDone) return resolve()
      if (Date.now() > deadline) return resolve()
      setTimeout(tick, 200)
    }
    tick()
  })
}

/** 把已成功的源文件收集成 save 接口要的 SourceFileItem（不再触发上传） */
async function collectSourceFileItems(): Promise<SourceFileItem[]> {
  const items: SourceFileItem[] = []
  for (const f of sourceFiles.value) {
    if (f.fileKey) {
      items.push({
        fileKey: f.fileKey,
        fileName: f.file.name,
        // 用入栈时算好的 fileType；编辑场景的空 File 占位也无影响（已带 fileType）。
        // 二次推导已被证明不可靠：new File([], name) 的 type 为空，会被算成 1(文本)。
        fileType: f.fileType,
      })
    }
  }
  return items
}

// 编辑模式：加载详情
async function loadDetail() {
  if (props.mode !== 'edit' || !props.target) return
  const d = await getMemoryDetail(props.target.memoryId)
  detail.value = d
  memoryId.value = d.memoryId
  mdKey.value = d.mdKey
  editStatus.value = d.editStatus
  form.topic = d.topic
  form.subjectiveDesc = d.subjectiveDesc
  // 快照：进入编辑时的初始状态，用于 save 阶段判定"是否有改动"
  initialSubjectiveDesc.value = d.subjectiveDesc || ''
  initialSourceFileKeys.value = (d.sourceFiles || [])
    .map((sf) => sf.fileKey)
    .filter((k): k is string => !!k)
    .sort()
  // 已存在的源文件用占位表示（URL 已在 detail.sourceFiles）。
  // fileType 直接用详情接口给的值，绝不二次推导（new File 占位的 type="" 会导致错算）。
  for (const sf of d.sourceFiles || []) {
    sourceFiles.value.push({
      id: genId(),
      // 用最小空 file 占位，仅显示；删除走 deleteSourceFile
      file: new File([], sf.fileName),
      fileType: resolveFileType({ fileName: sf.fileName, declared: sf.fileType }),
      fileKey: sf.fileKey,
      progress: 100,
      status: 'success',
    })
  }
  // md 文本：优先用后端下发的 md 正文（DB 缓存），缺失才回退拉对象存储（需归一化 URL）
  if (d.mdContent) {
    mdText.value = d.mdContent
  } else if (d.mdUrl) {
    try {
      const r = await fetch(normalizeAssetUrl(d.mdUrl))
      mdText.value = await r.text()
    } catch {
      mdText.value = ''
    }
  }
}

async function deleteExistingFile(fileKey: string) {
  try {
    await ElMessageBox.confirm('确认删除该源文件？\n将级联更新 md 与向量库。', '删除源文件', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteSourceFile(memoryId.value, fileKey)
    sourceFiles.value = sourceFiles.value.filter((x) => x.fileKey !== fileKey)
    ElMessage.success('源文件已删除')
      // 刷新 md（优先 DB 缓存正文，回退归一化后的对象存储 URL）
      if (props.target) {
        const d = await getMemoryDetail(props.target.memoryId)
        detail.value = d
        if (d.mdContent) {
          mdText.value = d.mdContent
        } else if (d.mdUrl) {
          try {
            const r = await fetch(normalizeAssetUrl(d.mdUrl))
            mdText.value = await r.text()
          } catch {
            /* ignore */
          }
        }
      }
  } catch (e) {
    ElMessage.error(e instanceof Error ? e.message : String(e))
  }
}

async function copyText(text: string, label: string) {
  await copyToClipboard(text, label)
}

onMounted(loadDetail)
</script>

<template>
  <el-dialog
    :model-value="true"
    :title="mode === 'create' ? '新增记忆' : '编辑记忆'"
    width="min(880px, 92vw)"
    :close-on-click-modal="false"
    destroy-on-close
    @close="emit('close')"
    class="memory-dialog"
  >
    <el-form :model="form" :rules="rules" label-width="84px" @submit.prevent>
      <el-form-item label="记忆主题" prop="topic">
        <el-input
          v-model="form.topic"
          :disabled="!canEditTopic"
          maxlength="255"
          show-word-limit
          placeholder="尽可能完整填写：时间 + 地点 + 人物 + 事件"
          @blur="validateTopic"
        />
        <div v-if="mode === 'create'" class="form-hint">
          主题一经保存将不可再次编辑；同角色下唯一。
          <el-tag v-if="topicExists" type="danger" size="small" class="ml">
            主题已存在
          </el-tag>
        </div>
      </el-form-item>

      <el-form-item label="主观描述" prop="subjectiveDesc">
        <div class="input-with-copy">
          <el-input
            v-model="form.subjectiveDesc"
            type="textarea"
            :rows="3"
            maxlength="1000"
            show-word-limit
            placeholder="可选：用户对该记忆的主观描述，≤1000 字"
          />
          <el-tooltip v-if="form.subjectiveDesc" content="复制主观描述" placement="top">
            <el-icon
              class="copy-icon"
              @click="copyText(form.subjectiveDesc, '主观描述')"
            >
              <DocumentCopy />
            </el-icon>
          </el-tooltip>
        </div>
      </el-form-item>

      <el-form-item label="源文件" required>
        <div class="files-block">
          <div v-for="f in sourceFiles" :key="f.id" class="file-row">
            <span class="file-name">{{ f.file.name }}</span>
            <el-tag v-if="f.fileKey && f.file.size > 0 === false" size="small">已上传</el-tag>
            <el-progress
              v-if="f.status === 'uploading'"
              :percentage="f.progress"
              :stroke-width="6"
              class="prog"
            />
            <el-tag v-if="f.status === 'success'" type="success" size="small">完成</el-tag>
            <el-tag v-else-if="f.status === 'error'" type="danger" size="small">
              失败
            </el-tag>
            <el-button
              v-if="f.status === 'error'"
              size="small"
              link
              type="primary"
              @click="retryUpload(f.id)"
            >
              重试
            </el-button>
            <el-button
              size="small"
              link
              type="danger"
              @click="f.fileKey ? deleteExistingFile(f.fileKey) : removePendingFile(f.id)"
            >
              删除
            </el-button>
          </div>
          <el-button :icon="Plus" @click="pickFiles" v-if="mode === 'create' || true">
            添加文件
          </el-button>
        </div>
        <div class="form-hint files-hint">
          <el-icon class="hint-icon"><InfoFilled /></el-icon>
          <span>
            建议上传较短时长（建议 <strong>1 分钟以内</strong>）的音视频：时长越短，AI 能抽取到的画面/语义细节越精细，生成的记忆内容越完整。
          </span>
        </div>
      </el-form-item>

      <el-form-item v-if="mode === 'edit'" label="记忆内容">
        <div class="md-block">
          <el-input
            v-model="mdText"
            type="textarea"
            :rows="10"
            readonly
            resize="none"
            placeholder="AI 解析完成后会在此显示 md 内容"
          />
          <div class="md-hint">
            <el-tag v-if="isAILocked" type="warning" size="small">
              AI 正在写入
            </el-tag>
            <span class="muted">记忆内容由 AI 生成，不允许人工修改</span>
            <el-tooltip v-if="mdText" content="复制记忆内容" placement="top">
              <el-icon
                class="copy-icon"
                @click="copyText(mdText, '记忆内容')"
              >
                <DocumentCopy />
              </el-icon>
            </el-tooltip>
          </div>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('close')" :disabled="saving">取消</el-button>
      <el-button
        type="primary"
        :disabled="saving || (mode === 'create' && topicExists)"
        @click="handleSubmit"
      >
        {{
          saving
            ? '保存中…'
            : (mode === 'create' ? '保存' : '保存编辑')
        }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form-hint {
  font-size: 0.78em;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 4px;
}
.files-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 8px;
  padding: 6px 10px;
  border-left: 3px solid #67c23a;
  background: rgba(103, 194, 58, 0.08);
  border-radius: 4px;
}
.files-hint .hint-icon {
  color: #67c23a;
  font-size: 1.1em;
  margin-top: 1px;
  flex-shrink: 0;
}
.ml {
  margin-left: 8px;
}
.files-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.file-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
}
.file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prog {
  width: 200px;
}
.md-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}
.md-hint {
  display: flex;
  align-items: center;
  gap: 12px;
}
.input-with-copy {
  position: relative;
  width: 100%;
}
.input-with-copy .copy-icon {
  position: absolute;
  top: 6px;
  right: 8px;
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
.muted {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.85em;
}
:deep(.el-dialog__body) {
  padding-top: 16px;
}
</style>

<script lang="ts">
import { Plus, InfoFilled, DocumentCopy } from '@element-plus/icons-vue'
export default {}
</script>