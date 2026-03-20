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
import { Upload } from '@element-plus/icons-vue'

const navItems = [{ path: '/admin/upload', label: '文件管理', icon: Upload }]
</script>

<style scoped>
.admin-sidebar {
  width: 220px;
  background-color: #fff;
  border-right: 1px solid #e4e7ec;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.sidebar-logo {
  height: 60px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid #e4e7ec;
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
  color: #1d2129;
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
  color: #4e5969;
  text-decoration: none;
  transition: color 0.2s, background-color 0.2s;
}

.sidebar-nav-item:hover {
  color: #165dff;
  background-color: #e8f3ff;
}

.sidebar-nav-item--active {
  color: #165dff;
  background-color: #e8f3ff;
}

.nav-icon {
  font-size: 16px;
}
</style>
