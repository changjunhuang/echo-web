<template>
  <header class="app-header">
    <div class="header-inner">
      <RouterLink to="/" class="logo">
        <span class="logo-icon">⚡</span>
        <span class="logo-text">Echo Web</span>
      </RouterLink>
      <nav class="nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          active-class="nav-item--active"
        >
          {{ item.label }}
        </RouterLink>
      </nav>
      <div class="header-actions">
        <RouterLink to="/admin/upload" class="admin-btn">
          <el-icon><Setting /></el-icon>
          <span>后台管理</span>
        </RouterLink>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { Setting } from '@element-plus/icons-vue'

const navItems = [
  { path: '/models', label: '模型广场' },
  { path: '/chat', label: '智能对话' },
]
</script>

<style scoped>
.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background-color: rgba(10, 10, 16, 0.9);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.header-inner {
  max-width: 1280px;
  margin: 0 auto;
  height: 60px;
  display: flex;
  align-items: center;
  padding: 0 24px;
  gap: 32px;
}

.logo {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  flex-shrink: 0;
}

.logo-icon {
  font-size: 22px;
}

.logo-text {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.3px;
}

.nav {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.nav-item {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.65);
  text-decoration: none;
  transition: color 0.2s, background-color 0.2s;
}

.nav-item:hover {
  color: #fff;
  background-color: rgba(255, 255, 255, 0.08);
}

.nav-item--active {
  color: #fff;
  background-color: rgba(255, 255, 255, 0.12);
}

.header-actions {
  flex-shrink: 0;
}

.admin-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.65);
  text-decoration: none;
  transition: color 0.2s, background-color 0.2s;
}

.admin-btn:hover {
  color: #fff;
  background-color: rgba(255, 255, 255, 0.08);
}
</style>
