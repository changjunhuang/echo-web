<script setup lang="ts">
/**
 * 根应用
 * 全站采用"视口驱动的根字号 + 流体布局"实现响应式适配：
 *  - html 根字号随视口宽度平滑缩放（global.css 中通过 clamp 设置）
 *  - 关键尺寸使用 rem / clamp() / vw / vh 自适应不同比例屏幕
 *  - 页面布局使用 flex/grid，确保铺满浏览器可视区域
 *
 * 会话过期守卫：
 *  - 每秒检查一次 expiresAt；过期则自动登出并提示
 *  - 跨标签页同步：通过 storage 事件感知另一个标签的登出/登录
 */
import { onBeforeUnmount, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

let expiryTimer: number | null = null
let checkTimer: number | null = null

/** 每秒检查一次会话是否过期；过期则强制登出 */
function startExpiryWatcher() {
  stopExpiryWatcher()
  checkTimer = window.setInterval(() => {
    if (!authStore.sessionId) return
    if (authStore.isAuthenticated) return
    // 已登录态但剩余时间 ≤ 0 → 过期
    authStore.clearSession()
    ElMessage.warning('登录已过期，请重新登录')
  }, 1000)
}

function stopExpiryWatcher() {
  if (checkTimer !== null) {
    window.clearInterval(checkTimer)
    checkTimer = null
  }
  if (expiryTimer !== null) {
    window.clearTimeout(expiryTimer)
    expiryTimer = null
  }
}

function onStorage(e: StorageEvent) {
  if (e.key === 'echo_auth_session') {
    // 其它标签登出/登录/续期都同步本地状态
    authStore.bootstrap()
  }
}

onMounted(() => {
  window.addEventListener('storage', onStorage)
  startExpiryWatcher()
})

onBeforeUnmount(() => {
  window.removeEventListener('storage', onStorage)
  stopExpiryWatcher()
})
</script>

<template>
  <RouterView />
</template>
