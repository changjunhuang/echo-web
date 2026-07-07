<script setup lang="ts">
/**
 * 聊天气泡内的 RAG / 检索上下文摘要（event=context 累积）。
 *
 * 新协议只给三个计数（persona_len / core_count / l1_count），不再带 chunk 正文。
 * UI 上以"参考资料"形式折叠展示，便于调试 RAG 命中情况。
 *
 * 设计要点：
 *   1. 默认折叠：避免调试信息把消息区撑得很长
 *   2. 头部显示总条数（core + l1）
 *   3. 展开后展示三段：人格 prompt / L0 核心记忆 / L1 近期摘要
 */
import { computed, ref } from 'vue'
import { ArrowDown, ArrowRight, Document } from '@element-plus/icons-vue'
import type { ChatContextInfo } from '@/types/chat'

const props = defineProps<{
  info: ChatContextInfo
}>()

const expanded = ref(false)

const total = computed(
  () => (props.info?.coreCount ?? 0) + (props.info?.l1Count ?? 0),
)
</script>

<template>
  <div v-if="info" class="chat-context">
    <button
      type="button"
      class="chat-context__head"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <el-icon class="chat-context__caret">
        <ArrowDown v-if="expanded" />
        <ArrowRight v-else />
      </el-icon>
      <el-icon class="chat-context__icon"><Document /></el-icon>
      <span class="chat-context__title">参考资料</span>
      <span class="chat-context__count">{{ total }} 条</span>
    </button>
    <div v-if="expanded" class="chat-context__body">
      <div class="chat-context__item">
        <div class="chat-context__label">人格 prompt</div>
        <div class="chat-context__value">{{ info.personaLen }} 字符</div>
      </div>
      <div class="chat-context__item">
        <div class="chat-context__label">L0 核心记忆</div>
        <div class="chat-context__value">{{ info.coreCount }} 条</div>
      </div>
      <div class="chat-context__item">
        <div class="chat-context__label">L1 近期摘要</div>
        <div class="chat-context__value">{{ info.l1Count }} 条</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-context {
  margin-top: 0.5rem;
  border: 1px solid var(--echo-border, #e5e7eb);
  border-radius: 0.5rem;
  background: var(--echo-surface-muted, #f8fafc);
  overflow: hidden;
}
.chat-context__head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4rem 0.6rem;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  font-size: 0.85rem;
  color: var(--echo-text, #1f2937);
}
.chat-context__head:hover {
  background: rgba(22, 93, 255, 0.04);
}
.chat-context__caret {
  color: var(--echo-text-muted, #6b7280);
}
.chat-context__icon {
  color: #165dff;
}
.chat-context__title {
  font-weight: 500;
}
.chat-context__count {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--echo-text-muted, #6b7280);
}
.chat-context__body {
  padding: 0 0.6rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.chat-context__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-left: 2px solid #165dff;
  padding-left: 0.5rem;
  font-size: 0.85rem;
}
.chat-context__label {
  color: var(--echo-text-muted, #6b7280);
}
.chat-context__value {
  color: var(--echo-text, #1f2937);
  font-weight: 500;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>