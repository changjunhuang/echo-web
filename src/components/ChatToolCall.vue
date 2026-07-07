<script setup lang="ts">
/**
 * 聊天气泡内的工具调用卡片（event=tool 累积）。
 *
 * 新协议 payload：{name, iter, ok, summary}。
 * 不再带 args / result 全文，只展示 ≤200 字摘要。
 *
 * 设计要点：
 *   1. 默认折叠：summary 用 <pre> 保留原始换行
 *   2. ok 决定左边竖条颜色：success=绿 / error=红
 *   3. iter 显示在右上角，方便排错时定位 ReAct 第几轮
 *   4. name 缺省时回退到 'tool'（与 parseToolCall 兜底保持一致）
 */
import { computed } from 'vue'
import { Tools } from '@element-plus/icons-vue'
import type { ChatToolCall } from '@/types/chat'

const props = defineProps<{
  toolCalls: ChatToolCall[]
}>()

function statusClass(tc: ChatToolCall): string {
  return tc.ok ? 'chat-tool-call--success' : 'chat-tool-call--error'
}

function statusLabel(tc: ChatToolCall): string {
  return tc.ok ? '成功' : '失败'
}

const hasAny = computed(() => props.toolCalls?.length > 0)
</script>

<template>
  <div v-if="hasAny" class="chat-tool-call-list">
    <div
      v-for="(tc, i) in toolCalls"
      :key="`${tc.name}-${tc.iter}-${i}`"
      class="chat-tool-call"
      :class="statusClass(tc)"
    >
      <div class="chat-tool-call__head">
        <el-icon class="chat-tool-call__icon"><Tools /></el-icon>
        <span class="chat-tool-call__name">{{ tc.name || 'tool' }}</span>
        <span class="chat-tool-call__iter">iter {{ tc.iter }}</span>
        <span class="chat-tool-call__status">{{ statusLabel(tc) }}</span>
      </div>
      <pre v-if="tc.summary" class="chat-tool-call__summary">{{ tc.summary }}</pre>
    </div>
  </div>
</template>

<style scoped>
.chat-tool-call-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.5rem;
}
.chat-tool-call {
  border: 1px solid var(--echo-border, #e5e7eb);
  border-left-width: 3px;
  border-radius: 0.5rem;
  background: var(--echo-surface-muted, #f8fafc);
  overflow: hidden;
  padding: 0.4rem 0.6rem;
}
.chat-tool-call--success {
  border-left-color: #10b981;
}
.chat-tool-call--error {
  border-left-color: #ef4444;
}
.chat-tool-call__head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: var(--echo-text, #1f2937);
}
.chat-tool-call__icon {
  color: #165dff;
}
.chat-tool-call__name {
  font-weight: 500;
}
.chat-tool-call__iter {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 0.3rem;
  background: rgba(22, 93, 255, 0.12);
  color: #165dff;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.chat-tool-call__status {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--echo-text-muted, #6b7280);
}
.chat-tool-call__summary {
  margin: 0.4rem 0 0;
  padding: 0.4rem 0.6rem;
  background: var(--echo-surface, #ffffff);
  border: 1px solid var(--echo-border, #e5e7eb);
  border-radius: 0.4rem;
  font-size: 0.8rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 12rem;
  overflow: auto;
  color: var(--echo-text-muted, #6b7280);
}
</style>