/**
 * 认证 Store
 * 职责：
 *  - 保存当前登录用户与 sessionId
 *  - 通过 localStorage 持久化会话，过期后自动失效（TTL 由后端 expireAt 决定）
 *  - 提供登录/注册/登出操作
 *  - 启动时若本地仍有有效 session，尝试向服务端校验一次
 *  - 滑动过期：每次与后端成功交互时把 expiresAt 续期 SESSION_TTL_MS
 *
 * 设计要点：
 *  - 业务接口统一在 stores 层调用，组件只与 store 交互
 *  - 失败抛出原始 Error，由调用方决定如何提示
 *  - 后端返回的 expireAt 是 ISO 8601 字符串，store 内部统一转换为毫秒时间戳
 *  - 持久化 key 集中管理，便于将来调整
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  login as loginApi,
  logout as logoutApi,
  register as registerApi,
} from '@/api/auth'
import type {
  LoginRequest,
  RegisterRequest,
  UserInfo,
} from '@/types/auth'

const STORAGE_KEY = 'echo_auth_session'

/**
 * 前端会话有效期：登录后/每次成功与后端交互时，把 expiresAt 续到这里。
 * 1 小时 = 60 * 60 * 1000ms
 */
export const SESSION_TTL_MS = 60 * 60 * 1000

/** localStorage 中存储的会话快照（内部统一使用毫秒时间戳） */
interface SessionSnapshot {
  sessionId: string
  expiresAt: number
  user: UserInfo
}

/** 将后端的 ISO 8601 字符串转换为毫秒时间戳；解析失败返回 0 */
function parseExpireAt(iso: string | undefined | null): number {
  if (!iso) return 0
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : 0
}

function readSnapshot(): SessionSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const snap = JSON.parse(raw) as SessionSnapshot
    if (!snap.sessionId || !snap.expiresAt || !snap.user) return null
    if (Date.now() >= snap.expiresAt) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return snap
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return null
  }
}

function writeSnapshot(snap: SessionSnapshot | null) {
  if (snap === null) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snap))
}

export const useAuthStore = defineStore('auth', () => {
  const sessionId = ref<string>('')
  const expiresAt = ref<number>(0)
  const currentUser = ref<UserInfo | null>(null)

  const isAuthenticated = computed(() => Boolean(sessionId.value) && Date.now() < expiresAt.value)
  const remainingMs = computed(() => Math.max(0, expiresAt.value - Date.now()))

  function applySession(payload: { sessionId: string; expiresAt: number; user: UserInfo }) {
    sessionId.value = payload.sessionId
    expiresAt.value = payload.expiresAt
    currentUser.value = payload.user
    writeSnapshot({
      sessionId: payload.sessionId,
      expiresAt: payload.expiresAt,
      user: payload.user,
    })
  }

  function clearSession() {
    sessionId.value = ''
    expiresAt.value = 0
    currentUser.value = null
    writeSnapshot(null)
  }

  /**
   * 把过期时间续为 now + SESSION_TTL_MS。
   * - 仅在已登录态下生效（没有 sessionId 时不动）
   * - 写入 localStorage，让跨标签页 / 刷新后仍能拿到一致的过期时间
   * - 由 axios 响应拦截器在每次与后端成功交互时调用
   */
  function touchSession(): void {
    if (!sessionId.value) return
    const newExpires = Date.now() + SESSION_TTL_MS
    // 仅当新过期时间确实更大时刷新，避免高频调用写回造成抖动
    if (newExpires <= expiresAt.value) return
    expiresAt.value = newExpires
    if (currentUser.value) {
      writeSnapshot({
        sessionId: sessionId.value,
        expiresAt: newExpires,
        user: currentUser.value,
      })
    }
  }

  /** 登录 */
  async function login(payload: LoginRequest) {
    const data = await loginApi(payload)
    const expMs = parseExpireAt(data.expireAt)
    if (!expMs) {
      throw new Error('登录响应缺少有效的过期时间')
    }
    // 登录成功后，把过期时间对齐到"登录时刻 + SESSION_TTL_MS"，
    // 避免后端返回的过期时间与前端策略不一致。
    applySession({
      sessionId: data.sessionId,
      expiresAt: Date.now() + SESSION_TTL_MS,
      user: data.user,
    })
    ElMessage.success(`欢迎回来，${data.user.nickname}`)
    return data
  }

  /** 注册（注册成功后不自动登录，由调用方决定后续动作） */
  async function register(payload: RegisterRequest) {
    const data = await registerApi(payload)
    ElMessage.success('注册成功，请登录')
    return data
  }

  /** 登出：通知服务端销毁 sessionId，并清理本地状态 */
  async function logout() {
    const sid = sessionId.value
    clearSession()
    if (sid) {
      try {
        await logoutApi(sid)
      } catch (err) {
        // 登出失败不影响本地清理，记录日志即可
        console.warn('[auth] remote logout failed:', err)
      }
    }
    ElMessage.success('已退出登录')
  }

  /**
   * 应用启动时调用：仅从 localStorage 恢复本地会话。
   *
   * 重要：这里不再向服务端发起 checkSession，原因有二：
   *  1. F5 刷新时，如果服务端 session 因任何原因（重启 / 过期 / 网络抖动）
   *     返回 401，响应拦截器会调用 clearSession 把用户踢下线——这违反了
   *     "1 小时无后端交互才自动退出"的产品规则。
   *  2. 本地 expiresAt 已经按 SESSION_TTL_MS 滑动续期，本身就是权威。
   *     服务端 session 是否还活着，留给用户下一次真实请求来验证（若失效会
   *     自然拿到 401，再走拦截器清理即可）。
   *
   * 所以这里只做"读 localStorage → 写到内存"，不做任何远端校验。
   */
  async function bootstrap() {
    const snap = readSnapshot()
    if (!snap) return
    sessionId.value = snap.sessionId
    expiresAt.value = snap.expiresAt
    currentUser.value = snap.user
  }

  return {
    sessionId,
    expiresAt,
    currentUser,
    isAuthenticated,
    remainingMs,
    login,
    register,
    logout,
    bootstrap,
    clearSession,
    touchSession,
  }
})
