import axios from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
})

request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    return config
  },
  (error) => {
    return Promise.reject(error)
  },
)

request.interceptors.response.use(
  (response) => {
    // 任何 2xx 都视为"成功与后端交互"：把会话过期时间往前续。
    // 由 store 内部判断是否已登录以及是否需要写回，避免无谓写盘。
    try {
      const authStore = useAuthStore()
      authStore.touchSession()
    } catch {
      // pinia 还未注入（极早的请求）时静默忽略
    }
    return response.data
  },
  (error) => {
    // 401 表示后端判定 sessionId 已失效：清理本地会话，让上层走登录流
    if (error.response?.status === 401) {
      try {
        const authStore = useAuthStore()
        authStore.clearSession()
      } catch {
        /* ignore */
      }
    }
    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message ||
      '请求失败，请稍后重试'
    ElMessage.error(message)
    return Promise.reject(error)
  },
)

export default request
