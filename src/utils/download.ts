/**
 * 统一下载工具（托管式下载）。
 *
 * 设计：所有下载入口（ChatAttachment / MemoryListView / MemoryThemeViewDialog）
 * 都通过本模块走后端授权 → 302 直连七牛。md 走本地 Blob（无授权）。
 *
 * 关键流程：
 *   1. requestDownloadAuth({resourceType, resourceId, ...}) → POST /api/file/authorize
 *   2. 后端鉴权 + 算 HMAC(ip_sig) + 落 audit_log
 *   3. 返回 {url, fileName, expiresIn:60}
 *   4. triggerBrowserDownload(url) → window.location.href 触发浏览器直连七牛
 *      （大文件切片下载 / 断点续传 / 进度条由浏览器原生处理）
 *
 * 已知局限：
 *   - Qiniu 不会校验 ip_sig，只校验 e + token；60s 过期是真正生效的回收手段
 *   - 用户在 60s 内切换网络（WiFi → 4G）IP 会变，URL 失效需重新申请
 *   - "下载完成"事件无法在七牛侧观测，审计只记录"已授权"
 */

import request from '@/api'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

/** 资源类型 */
export type ResourceType = 'file' | 'memory_source' | 'memory_md'

/** 授权请求 */
export interface AuthorizeReq {
  resourceType: ResourceType
  /** file.id（resourceType=file 必填） */
  resourceId?: string | number
  /** 对象存储 key（resourceType=memory_source 必填） */
  fileKey?: string
  /** 记忆 ID（resourceType=memory_source 必填） */
  memoryId?: string
}

/** 授权响应 */
export interface AuthorizeResp {
  url: string
  fileName: string
  expiresIn: number
}

/** 响应包络 */
interface Envelope<T> {
  code: number
  message: string
  data: T
}

/**
 * 从 authStore 取当前登录态的 sessionId（与 src/api/upload.ts 的 getAuthSessionId 同源）。
 *
 * 这里不复用 upload.ts 的内部 helper，避免 utils 跨包耦合；
 * Pinia 未注入时静默回退空串——后端 middleware 此时会回 401，触发登录流（正确行为）。
 */
function currentSessionId(): string {
  try {
    return useAuthStore().sessionId || ''
  } catch {
    return ''
  }
}

/**
 * POST /api/file/authorize — 向后端申请 60s 短期下载 URL。
 *
 * 返回的 url 不带 scheme 前缀（沿用既有 MakePrivateURL 行为），
 * 调用方在 triggerBrowserDownload 触发时会由 ensureAbsoluteURL 补 https://。
 *
 * 注意：项目里的 axios request 拦截器是 no-op，sessionId 需调用方手动塞到 header。
 * 这一点与 src/api/upload.ts 的 listMemoryFiles / getUploadToken 一致。
 */
export async function requestDownloadAuth(req: AuthorizeReq): Promise<AuthorizeResp> {
  const sid = currentSessionId()
  const env = (await request.post('/file/authorize', req, {
    headers: { 'X-Session-Id': sid },
  })) as unknown as Envelope<AuthorizeResp>
  if (env.code !== 200 && env.code !== 0) {
    // 错误消息直接抛给 UI 层（axios 拦截器已经会弹过一条，这里再抛一次让上层可识别）
    throw new Error(env.message || '下载授权失败')
  }
  return env.data
}

/**
 * 为 URL 补齐 scheme，让 window.location.href / fetch 能用。
 *
 * 背景：authorize 返回的 URL 有两种形态：
 *   1. 七牛 CDN 裸主机名（"tixapmuo5.hn-bkt.clouddn.com/..."）→ 拼 http://
 *   2. 后端代理相对路径（"/api/memory/.../md-file?..."）→ 原样，浏览器自动用当前 origin
 *
 * 直接 `window.location.href = "host.example.com/path"` 浏览器会当相对路径处理，
 * 解析成 `<当前 origin>/host.example.com/path`，导致 dev 环境 SPA fallback 回首页。
 * 而裸主机名 + http:// 才是 CDN 的实际可访问入口（用户配置的是 HTTP CDN）。
 *
 * 已带 scheme / 协议相对 / 路径开头 / data: / blob: 原样放行。
 */
function ensureAbsoluteURL(url: string): string {
  if (!url) return url
  const trimmed = url.trim()
  if (!trimmed) return trimmed
  // 已有 scheme：http:// https:// ftp:// 等
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed
  // 协议相对：//host/path 浏览器跟随当前页面协议
  if (trimmed.startsWith('//')) return trimmed
  // 同源路径：/api/... /xxx.html 浏览器自动用当前 origin（http://localhost:5173）
  // 这条必须放在 bare hostname 分支前面，否则会拼出 http:///api/... 这种三斜杠错 URL
  if (trimmed.startsWith('/')) return trimmed
  // data: / blob:
  if (/^(data|blob):/i.test(trimmed)) return trimmed
  // 裸主机名：拼 http://（用户配置的 CDN 是 *.clouddn.com，HTTPS 会触发 mixed-content）
  return `http://${trimmed}`
}

/**
 * 触发浏览器下载：302 直连 Qiniu。
 *
 * 选择 window.location.href 的原因：
 *   - <a download> 在跨域（CORS 不可控）资源上会被浏览器忽略，filename 无法生效
 *   - 大文件切片 / 断点续传 / 进度条交给浏览器原生 fetch 处理
 *   - 七牛 CDN 会在响应头 Content-Disposition 携带文件名（如果有的话）
 */
export function triggerBrowserDownload(url: string): void {
  window.location.href = ensureAbsoluteURL(url)
}

/**
 * 本地 Blob 下载：md / 纯文本记忆（无需后端授权，文本已在 DB 缓存或前端内存）。
 *
 * 与既有 triggerBlobDownload 等价行为，集中维护避免每个组件重复实现。
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objUrl
  a.download = fileName
  // 某些浏览器即使 a.download 仍会新窗口打开，再加 rel=noopener 兜底
  a.rel = 'noopener noreferrer'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 给浏览器一点时间真正发出请求再回收 URL
  setTimeout(() => URL.revokeObjectURL(objUrl), 1500)
}

/**
 * 通用下载入口（推荐）：自动判定走授权还是 Blob。
 *
 *   - `kind: 'authorized'`：调用 requestDownloadAuth + triggerBrowserDownload
 *   - `kind: 'blob'`：直接 downloadBlob
 *
 * 同时统一处理：toast 提示、loading 状态（可选）、错误展示。
 */
export async function downloadWith(
  plan:
    | { kind: 'authorized'; req: AuthorizeReq; loading?: { set: (b: boolean) => void } }
    | { kind: 'blob'; blob: Blob; fileName: string; loading?: { set: (b: boolean) => void } },
): Promise<{ ok: boolean; fileName?: string }> {
  plan.loading?.set(true)
  try {
    if (plan.kind === 'authorized') {
      const { url, fileName } = await requestDownloadAuth(plan.req)
      triggerBrowserDownload(url)
      ElMessage.success(`已开始下载「${fileName}」`)
      return { ok: true, fileName }
    } else {
      downloadBlob(plan.blob, plan.fileName)
      ElMessage.success(`已开始下载「${plan.fileName}」`)
      return { ok: true, fileName: plan.fileName }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '未知错误'
    ElMessage.error(`下载失败：${msg}`)
    return { ok: false }
  } finally {
    plan.loading?.set(false)
  }
}
