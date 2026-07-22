import request from './index'
import type { UploadResponse } from '@/types/upload'
import { useAuthStore } from '@/stores/auth'
import { useRolesStore } from '@/stores/roles'

export interface UploadTokenResponse {
  token: string
  key: string
  domain: string
}

/** 从 authStore 读取当前登录态的 sessionId（统一来源） */
function getAuthSessionId(): string {
  try {
    return useAuthStore().sessionId || ''
  } catch {
    return ''
  }
}

/** 从 rolesStore 读取当前激活角色 ID（统一来源）。
 *  未登录 / 尚未加载角色列表时回退到 'default'，与后端无角色时的兜底一致。 */
function getCurrentRoleId(): string {
  try {
    const id = useRolesStore().currentRoleId
    if (id) return id
  } catch {
    /* store 还未就绪，兜底 'default' */
  }
  return 'default'
}

export function getUploadToken(fileName: string, fileSize: number, mimeType: string): Promise<UploadTokenResponse> {
  return request.post('/file/token', {
    fileName,
    fileSize,
    mimeType,
    bizType: 'default',
    // 关键：把登录返回的 sessionId 一起带过去，与 /api/chat 走同一份会话身份
    sessionId: getAuthSessionId(),
  })
}

export function uploadFile(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<UploadResponse> {
  const formData = new FormData()
  formData.append('file', file)
  // multipart 的 sessionId 用独立字段上传；form-data 里加一道就行
  formData.append('sessionId', getAuthSessionId())

  return request.post('/file/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (event.total) {
        const percent = Math.round((event.loaded * 100) / event.total)
        onProgress?.(percent)
      }
    },
  })
}

export function getFileType(mimeType: string): number {
  if (mimeType.startsWith('image/')) return 2
  if (mimeType.startsWith('video/')) return 3
  if (mimeType.startsWith('audio/')) return 4
  return 1
}

export function notifyUploadSuccess(
  key: string,
  fileName: string,
  mimeType: string,
  bizType: number = 1,
  // userId 参数保留为兼容旧调用方，但已不再发送；后端 userId 强制从
  // session 鉴权上下文取（middleware.MustUserID），避免前端伪造
  // 其他人 userId，也避免 authStore 还没就绪时 userId 空串触发 binding 校验
  _legacyUserId?: string,
  desc?: string,
  roleId?: string,
): Promise<RegisterFileResponse> {
  const fileType = getFileType(mimeType)
  return request.post('/file/register', {
    fileName,
    key,
    fileType,
    bizType,
    // 记忆管理：附带给后端的描述（可空）
    desc: desc ?? '',
    // 角色隔离：当前角色 ID，空串回退到 'default'（与后端默认角色对齐）
    roleId: roleId ?? getCurrentRoleId(),
    // 同上：把 auth sessionId 带上
    sessionId: getAuthSessionId(),
  })
}

export function deleteFile(id: string): Promise<void> {
  return request.delete(`/file/upload/${id}`)
}

export function listFiles(): Promise<UploadResponse[]> {
  return request.get('/file/upload')
}

/* /file/register 响应：后端 service.RegisterFileResult 的前端镜像
 *  - url 由后端 GetPublicURL 生成，前端直接复用，避免前端再拼一次公共域名
 *  - id 是后端入库后的主键
 *  - ingestion 字段存在表示已成功转发 Python 入库 RAG（异步） */
export interface RegisterFileResponse {
  id: number
  userId: string
  key: string
  status: number
  url?: string
  ingestion?: {
    ok: boolean
    queued: boolean
    [k: string]: unknown
  }
}

/* -------------------- 记忆管理 -------------------- */

/** 记忆管理页单条文件项（与后端 service.MemoryFileItem 同构） */
export interface MemoryFileItem {
  id: number
  /** 归属用户 ID（字符串形式） */
  userId: string
  /** 所属角色 ID（字符串） */
  roleId: string
  /** 1=文本 2=图片 3=视频 4=音频 */
  fileType: number
  fileName: string
  key: string
  url?: string
  desc: string
  /** 1=正常 2=已删除 */
  status: number
  /** ISO 8601 */
  createdAt: string
  /** ISO 8601 */
  updatedAt: string
}

interface PageEnvelope<T> {
  code: number
  message: string
  data: T
}

/** 解析 {code,message,data} 包络。
 *  与 auth/roles.ts 中 unwrap 同源：响应拦截器已 unwrap 一次，await 拿到的是 Envelope 本身。
 *  这里 cast 是为了对齐 TS 类型，运行时形态稳定。 */
async function unwrapPage<T>(promise: Promise<{ data: PageEnvelope<T> }>): Promise<T> {
  const env = (await promise) as unknown as PageEnvelope<T>
  const ok = env.code === 0 || (env.code >= 200 && env.code < 300)
  if (!ok) {
    throw new Error(env.message || '请求失败')
  }
  return env.data
}

/** GET /api/file/list —— 记忆管理：列出文件 */
export function listMemoryFiles(roleId?: string, fileType: number = 0): Promise<MemoryFileItem[]> {
  return unwrapPage<MemoryFileItem[]>(
    request.get('/file/list', {
      params: { roleId: roleId || '', fileType },
      headers: { 'X-Session-Id': getAuthSessionId() },
    }),
  )
}

/** PUT /api/file/:id/desc —— 修改文件描述（自动触发重新入库生成记忆） */
export function updateFileDesc(id: string | number, desc: string): Promise<{ ok: boolean }> {
  return unwrapPage<{ ok: boolean }>(
    request.put(`/file/${id}/desc`, { desc, sessionId: getAuthSessionId() }),
  )
}

/** POST /api/file/text —— 新建纯文本记忆（无 key/url，仅 desc 作为内容） */
export function createTextMemory(desc: string, roleId?: string): Promise<MemoryFileItem> {
  return unwrapPage<MemoryFileItem>(
    request.post('/file/text', {
      desc,
      roleId: roleId ?? getCurrentRoleId(),
      sessionId: getAuthSessionId(),
    }),
  )
}
