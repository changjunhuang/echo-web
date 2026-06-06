<template>
  <header class="app-header">
    <div class="header-inner">
      <RouterLink to="/" class="logo">
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
  { path: '/home', label: '首页' },
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
  max-width: 90rem;
  margin: 0 auto;
  height: clamp(3.25rem, 6vh, 4.5rem);
  display: flex;
  align-items: center;
  padding: 0 clamp(1rem, 2vw, 1.75rem);
  gap: clamp(1rem, 2.5vw, 2rem);
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  text-decoration: none;
  flex-shrink: 0;
}

.logo-text {
  font-size: clamp(1rem, 1.3vw, 1.2rem);
  font-weight: 700;
  color: #fff;
  letter-spacing: -0.02em;
}

.nav {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex: 1;
}

.nav-item {
  padding: 0.4rem 0.85rem;
  border-radius: 0.4rem;
  font-size: clamp(0.8rem, 1vw, 0.95rem);
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
  gap: 0.4rem;
  padding: 0.4rem 0.85rem;
  border-radius: 0.4rem;
  font-size: clamp(0.8rem, 1vw, 0.95rem);
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
