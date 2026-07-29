<template>
  <div class="memory-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">记忆管理</h2>
        <p class="page-desc">
          上传新文件，或维护当前角色下的记忆文件与文本描述，描述变更会触发服务端重新生成记忆
        </p>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="memory-tabs">
      <el-tab-pane name="upload" label="上传新文件">
        <FileUploadView />
      </el-tab-pane>
      <el-tab-pane name="manage" label="我的记忆">
        <MemoryListView />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import FileUploadView from '@/views/admin/FileUploadView.vue'
import MemoryListView from '@/views/admin/MemoryListView.vue'

const activeTab = ref<string>('upload')
</script>

<style scoped>
.memory-page {
  max-width: 75rem;
  margin: 0 auto;
}

.page-header {
  margin-bottom: clamp(1rem, 2vw, 1.5rem);
}

.page-title {
  font-size: clamp(1.1rem, 1.6vw, 1.4rem);
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.4rem;
}

.page-desc {
  font-size: clamp(0.75rem, 0.95vw, 0.9rem);
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

.memory-tabs {
  margin-bottom: clamp(0.5rem, 1.2vw, 1rem);
}

.memory-tabs :deep(.el-tabs__nav-wrap::after) {
  background-color: rgba(255, 255, 255, 0.08);
}

.memory-tabs :deep(.el-tabs__item) {
  color: rgba(255, 255, 255, 0.55);
  font-size: clamp(0.8rem, 0.95vw, 0.9rem);
}

.memory-tabs :deep(.el-tabs__item.is-active) {
  color: #79abff;
}

.memory-tabs :deep(.el-tabs__content) {
  overflow: visible;
}
</style>
