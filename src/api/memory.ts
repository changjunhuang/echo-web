import request from './index'
import { useAuthStore } from '@/stores/auth'
import { useRolesStore } from '@/stores/roles'

/** 统一取登录 sessionId */
function sessionId(): string {
  try {
    return useAuthStore().sessionId || ''
  } catch {
    return ''
  }
}

/** 统一取当前角色 ID（兜底 'default' 与后端对齐） */
function roleId(): string {
  try {
    const id = useRolesStore().currentRoleId
    if (id) return id
  } catch {
    /* store 未就绪 */
  }
  return 'default'
}

export interface MemoryUploadTokenResponse {
  token: string
  uploadURL?: string
  key: string
  domain: string
}

/** 源文件项 */
export interface SourceFileItem {
  fileKey: string
  fileName: string
  fileType: number // 1文本 2图片 3视频 4音频
}

/** 记忆主题项（与 echo-core service.RecallMemoryItem 同构） */
export interface RecallMemoryItem {
  id: number
  memoryId: string
  userId: string
  roleId: string
  topic: string
  subjectiveDesc: string
  mdKey: string
  mdUrl?: string
  /** {memoryId}.md 内容（后端 DB 缓存，详情接口直接下发）。优先用它渲染，避免浏览器再拉对象存储 */
  mdContent?: string
  /** 0待解析 1解析中 2完成 3失败 */
  parseStatus: number
  /** 0空闲 1AI写入中（编辑锁） */
  editStatus: number
  status: number
  createdAt: string
  updatedAt: string
  sourceFiles?: RecallSourceFileDetail[]
}

export interface RecallSourceFileDetail {
  fileKey: string
  fileName: string
  fileType: number
  url?: string
}

interface PageEnvelope<T> {
  code: number
  message: string
  data: T
}

async function unwrap<T>(p: Promise<{ data: PageEnvelope<T> }>): Promise<T> {
  const env = (await p) as unknown as PageEnvelope<T>
  const ok = env.code === 0 || (env.code >= 200 && env.code < 300)
  if (!ok) throw new Error(env.message || '请求失败')
  return env.data
}

/** POST /api/memory/apply —— 申请 memoryId */
export function applyMemory(): Promise<{ memoryId: string }> {
  return unwrap<{ memoryId: string }>(
    request.post('/memory/apply', { sessionId: sessionId() }),
  )
}

/** POST /api/memory/check-topic —— 主题唯一性校验 */
export function checkTopic(topic: string): Promise<{ exists: boolean }> {
  return unwrap<{ exists: boolean }>(
    request.post('/memory/check-topic', {
      roleId: roleId(),
      topic,
      sessionId: sessionId(),
    }),
  )
}

/** POST /api/memory/upload-token —— 记忆目录内上传 token（isMd=true 用于 md 在线编辑覆盖） */
export function getMemoryUploadToken(
  memoryId: string,
  fileName: string,
  isMd: boolean = false,
): Promise<MemoryUploadTokenResponse> {
  return unwrap<MemoryUploadTokenResponse>(
    request.post('/memory/upload-token', {
      roleId: roleId(),
      memoryId,
      fileName,
      isMd,
      sessionId: sessionId(),
    }),
  )
}

/** POST /api/memory/save —— 保存记忆 */
export function saveMemory(payload: {
  memoryId: string
  topic: string
  subjectiveDesc: string
  sourceFiles: SourceFileItem[]
}): Promise<RecallMemoryItem> {
  return unwrap<RecallMemoryItem>(
    request.post('/memory/save', {
      ...payload,
      roleId: roleId(),
      sessionId: sessionId(),
    }),
  )
}

/** POST /api/memory/update —— 编辑已有记忆。
 *
 * 与 saveMemory 的关键差异：
 *  - 不校验主题唯一性（编辑是更新自身，不存在与自身冲突）。
 *  - 源文件按 delta 同步：前端传"当前期望的全量列表"，服务端 diff。
 *  - needReparse 由前端基于"源文件增删 OR 主观描述改动"算出；
 *    true 时服务端会异步触发 AI 重新解析（删向量 → 重建）。
 */
export function updateMemory(payload: {
  memoryId: string
  topic: string
  subjectiveDesc: string
  sourceFiles: SourceFileItem[]
  needReparse: boolean
}): Promise<RecallMemoryItem> {
  return unwrap<RecallMemoryItem>(
    request.post('/memory/update', {
      ...payload,
      roleId: roleId(),
      sessionId: sessionId(),
    }),
  )
}

/** GET /api/memory/list —— 记忆主题列表 */
export function listMemories(): Promise<RecallMemoryItem[]> {
  return unwrap<RecallMemoryItem[]>(
    request.get('/memory/list', {
      params: { roleId: roleId() },
      headers: { 'X-Session-Id': sessionId() },
    }),
  )
}

/** GET /api/memory/detail —— 记忆详情 */
export function getMemoryDetail(memoryId: string): Promise<RecallMemoryItem> {
  return unwrap<RecallMemoryItem>(
    request.get('/memory/detail', {
      params: { memoryId },
      headers: { 'X-Session-Id': sessionId() },
    }),
  )
}

/** DELETE /api/memory/file —— 删除单个源文件 */
export function deleteSourceFile(memoryId: string, fileKey: string): Promise<void> {
  return unwrap<void>(
    request.delete('/memory/file', {
      data: { memoryId, fileKey, sessionId: sessionId() },
    }),
  )
}

/** DELETE /api/memory/theme —— 删除整个主题 */
export function deleteMemoryTheme(memoryId: string): Promise<void> {
  return unwrap<void>(
    request.delete('/memory/theme', {
      data: { memoryId, sessionId: sessionId() },
    }),
  )
}