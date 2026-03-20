<template>
  <div class="admin-layout">
    <AdminSidebar />
    <div class="admin-body">
      <header class="admin-header">
        <h1 class="admin-title">后台管理</h1>
      </header>
      <main class="admin-main">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import AdminSidebar from '@/components/AdminSidebar.vue'
</script>

<style scoped>
.admin-layout {
  display: flex;
  min-height: 100vh;
  background-color: #f4f6f8;
}

.admin-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.admin-header {
  height: 60px;
  background-color: #fff;
  border-bottom: 1px solid #e4e7ec;
  display: flex;
  align-items: center;
  padding: 0 24px;
  flex-shrink: 0;
}

.admin-title {
  font-size: 18px;
  font-weight: 600;
  color: #1d2129;
  margin: 0;
}

.admin-main {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}
</style>
