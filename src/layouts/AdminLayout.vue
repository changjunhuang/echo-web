<template>
  <div class="admin-layout">
    <AdminSidebar />
    <div class="admin-body">
      <header class="admin-header">
        <h1 class="admin-title">{{ pageTitle }}</h1>
      </header>
      <main class="admin-main" :class="{ 'admin-main--full-bleed': isFullBleed }">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AdminSidebar from '@/components/AdminSidebar.vue'

const route = useRoute()

/** 头部标题：取当前路由 meta.title，没有时回落到默认值 */
const pageTitle = computed(() => (route.meta?.title as string | undefined) || 'Echo Web')

/** 是否让主区域充满（取消内边距/滚动）：用于聊天页这种自带滚动的全屏页面 */
const isFullBleed = computed(() => Boolean(route.meta?.fullBleed))
</script>

<style scoped>
.admin-layout {
  display: flex;
  height: 100vh;
  background-color: #0a0a10;
  overflow: hidden;
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
}

.admin-title {
  font-size: clamp(1rem, 1.3vw, 1.2rem);
  font-weight: 600;
  color: #fff;
  margin: 0;
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
