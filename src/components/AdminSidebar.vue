<template>
  <aside class="admin-sidebar">
    <div class="sidebar-logo">
      <RouterLink to="/" class="sidebar-logo-link">
        <span class="logo-icon">⚡</span>
        <span class="logo-text">Echo Web</span>
      </RouterLink>
    </div>
    <nav class="sidebar-nav">
      <RouterLink
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="sidebar-nav-item"
        active-class="sidebar-nav-item--active"
      >
        <el-icon class="nav-icon">
          <component :is="item.icon" />
        </el-icon>
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
  </aside>
</template>

<script setup lang="ts">
import { Upload, ChatDotRound, HomeFilled } from '@element-plus/icons-vue'

const navItems = [
  { path: '/home', label: '首页', icon: HomeFilled },
  { path: '/chat', label: '智能对话', icon: ChatDotRound },
  { path: '/admin/upload', label: '文件管理', icon: Upload },
]
</script>

<style scoped>
.admin-sidebar {
  width: 220px;
  background: rgba(255, 255, 255, 0.03);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  overflow-y: hidden;
}

.sidebar-logo {
  height: 60px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.sidebar-logo-link {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
}

.logo-icon {
  font-size: 20px;
}

.logo-text {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}

.sidebar-nav {
  padding: 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.65);
  text-decoration: none;
  transition: color 0.2s, background-color 0.2s;
}

.sidebar-nav-item:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.sidebar-nav-item--active {
  color: #fff;
  background: rgba(22, 93, 255, 0.2);
}

.nav-icon {
  font-size: 16px;
}
</style>
