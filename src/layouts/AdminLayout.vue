<template>
  <div class="admin-layout">
    <AdminSidebar />
    <div class="admin-body">
      <header class="admin-header">
        <h1 class="admin-title">{{ pageTitle }}</h1>
        <div class="admin-header-actions">
          <RoleSwitcher v-if="authStore.isAuthenticated" />
        </div>
      </header>
      <main class="admin-main" :class="{ 'admin-main--full-bleed': isFullBleed }">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import AdminSidebar from '@/components/AdminSidebar.vue'
import RoleSwitcher from '@/components/RoleSwitcher.vue'
import { useAuthStore } from '@/stores/auth'
import { useRolesStore } from '@/stores/roles'

const route = useRoute()
const authStore = useAuthStore()
const rolesStore = useRolesStore()

/** 头部标题：取当前路由 meta.title，没有时回落到默认值 */
const pageTitle = computed(() => (route.meta?.title as string | undefined) || 'Echo Web')

/** 是否让主区域充满（取消内边距/滚动）：用于聊天页这种自带滚动的全屏页面 */
const isFullBleed = computed(() => Boolean(route.meta?.fullBleed))

/**
 * 进入后台时拉取一次角色列表。
 * - 若后端建好了"默认角色"，这里直接拿到并落地 currentRoleId
 * - 失败时静默吞掉（Store 已有兜底占位），不阻断页面渲染
 */
onMounted(async () => {
  if (!authStore.isAuthenticated) return
  if (rolesStore.bootstrapped) return
  try {
    await rolesStore.fetchRoles()
  } catch (err) {
    if (err instanceof Error) {
      console.warn('[admin-layout] fetch roles failed:', err.message)
    }
  }
})
</script>

<style scoped>
.admin-layout {
  display: flex;
  height: 100vh;
  background-color: #0a0a10;
  overflow: hidden;

  /* Element Plus 全局变量暗色覆盖
   * - 覆盖后 el-table / el-dialog / el-input / el-textarea / el-select / el-button 等
   *   默认白底会全部跟随这套调色，无需每个组件单独写 background 重置
   * - 仍兼容后续自定义深色样式（只在缺省时生效）
   */
  --el-bg-color: rgba(20, 22, 28, 0.96);
  --el-bg-color-overlay: rgba(20, 22, 28, 0.96);
  --el-bg-color-page: #0a0a10;
  --el-fill-color-blank: rgba(20, 22, 28, 0.96);
  --el-fill-color-light: rgba(255, 255, 255, 0.04);
  --el-fill-color-lighter: rgba(255, 255, 255, 0.02);
  --el-fill-color-extra-light: rgba(255, 255, 255, 0.02);

  --el-text-color-primary: rgba(255, 255, 255, 0.92);
  --el-text-color-regular: rgba(255, 255, 255, 0.85);
  --el-text-color-secondary: rgba(255, 255, 255, 0.65);
  --el-text-color-placeholder: rgba(255, 255, 255, 0.4);
  --el-text-color-disabled: rgba(255, 255, 255, 0.3);

  --el-border-color: rgba(255, 255, 255, 0.16);
  --el-border-color-light: rgba(255, 255, 255, 0.12);
  --el-border-color-lighter: rgba(255, 255, 255, 0.08);
  --el-border-color-extra-light: rgba(255, 255, 255, 0.04);
  --el-border-color-dark: rgba(255, 255, 255, 0.2);

  --el-mask-color: rgba(0, 0, 0, 0.6);
}

.admin-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.admin-header {
  height: clamp(3.25rem, 6vh, 4.5rem);
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  padding: 0 clamp(1rem, 2vw, 1.75rem);
  flex-shrink: 0;
  gap: 1rem;
}

.admin-title {
  font-size: clamp(1rem, 1.3vw, 1.2rem);
  font-weight: 600;
  color: #fff;
  margin: 0;
  flex: 1;
  min-width: 0;
}

.admin-header-actions {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.admin-main {
  flex: 1;
  padding: clamp(1rem, 2vw, 1.75rem);
  overflow-y: auto;
  min-height: 0;
}

/* 全屏模式：让内嵌页面自行控制滚动与留白（如聊天页有自己的会话侧栏与滚动消息区） */
.admin-main--full-bleed {
  padding: 0;
  overflow: hidden;
}
</style>
