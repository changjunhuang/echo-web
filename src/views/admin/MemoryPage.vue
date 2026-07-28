<template>
  <div class="memory-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">记忆管理</h2>
        <p class="page-desc">
          以"记忆主题"为单位组织多模态源文件与文字描述，AI 解析后生成专属文档（{memoryId}.md），
          摘要自动入库向量，供对话检索使用。
        </p>
      </div>
    </div>

    <MemoryThemeList />
  </div>
</template>

<script setup lang="ts">
import MemoryThemeList from './memory/MemoryThemeList.vue'
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
</style>