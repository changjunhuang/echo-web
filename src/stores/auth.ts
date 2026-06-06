/**
 * 认证 Store
 * 职责：
 *  - 保存当前登录用户与 sessionId
 *  - 通过 localStorage 持久化会话，过期后自动失效（TTL 由后端 expireAt 决定）
 *  - 提供登录/注册/登出操作
 *  - 启动时若本地仍有有效 session，尝试向服务端校验一次
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
  checkSession,
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

  /** 登录 */
  async function login(payload: LoginRequest) {
    const data = await loginApi(payload)
    const expMs = parseExpireAt(data.expireAt)
    if (!expMs) {
      throw new Error('登录响应缺少有效的过期时间')
    }
    applySession({
      sessionId: data.sessionId,
      expiresAt: expMs,
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

  /** 应用启动时调用：恢复本地会话，并尝试与服务端校验 */
  async function bootstrap() {
    const snap = readSnapshot()
    if (!snap) return
    sessionId.value = snap.sessionId
    expiresAt.value = snap.expiresAt
    currentUser.value = snap.user

    // 异步向服务端确认一次；如果已失效则清理
    try {
      const res = await checkSession(snap.sessionId)
      const expMs = parseExpireAt(res.expireAt)
      if (!expMs) {
        clearSession()
        return
      }
      // 用服务端返回的更准确的过期时间刷新
      expiresAt.value = expMs
      currentUser.value = res.user
      writeSnapshot({
        sessionId: snap.sessionId,
        expiresAt: expMs,
        user: res.user,
      })
    } catch {
      clearSession()
    }
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
  }
})
