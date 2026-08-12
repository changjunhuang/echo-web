<script setup lang="ts">
/**
 * 聊天气泡内的 RAG / 检索上下文（event=context）。
 *
 * 字段：
 *   - persona_len / l0_count / l1_count：总数（兼容老协议）
 *   - persona：人格原文（DEFAULT_PERSONA 或用户自定义人格）
 *   - l0_items / l1_items：实际注入到 LLM 上下文的记忆条目
 *
 * UI：
 *   - 默认折叠：避免调试信息把消息区撑得很长
 *   - 头部显示总条数 + 「点开查看」提示
 *   - 展开后展示：
 *       1. 人格原文（带"已截断"提示如果超过展示限制）
 *       2. L0 核心记忆条目（带序号）
 *       3. L1 近期摘要条目（带序号）
 */
import { computed, ref } from 'vue'
import { ArrowDown, ArrowRight, Document, User, MagicStick, Collection } from '@element-plus/icons-vue'
import type { ChatContextInfo } from '@/types/chat'

const props = defineProps<{
  info: ChatContextInfo
}>()

const expanded = ref(false)

const total = computed(
  () => (props.info?.l0Count ?? 0) + (props.info?.l1Count ?? 0),
)

// L0 / L1 实际下发的条目数（可能小于计数，服务端做了截断）
const l0Actual = computed(() => props.info?.l0Items?.length ?? 0)
const l1Actual = computed(() => props.info?.l1Items?.length ?? 0)
const l0Truncated = computed(() => l0Actual.value < (props.info?.l0Count ?? 0))
const l1Truncated = computed(() => l1Actual.value < (props.info?.l1Count ?? 0))
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
      <span class="chat-context__hint">{{ expanded ? '收起' : '点开查看' }}</span>
    </button>
    <div v-if="expanded" class="chat-context__body">
      <!-- 人格原文 -->
      <section v-if="info.persona" class="chat-context__section">
        <header class="chat-context__section-head">
          <el-icon><User /></el-icon>
          <span class="chat-context__label">人格 prompt</span>
          <span class="chat-context__meta">{{ info.personaLen }} 字符</span>
        </header>
        <pre class="chat-context__persona">{{ info.persona }}</pre>
      </section>

      <!-- L0 核心记忆 -->
      <section v-if="(info.l0Items?.length ?? 0) > 0 || info.l0Count > 0" class="chat-context__section">
        <header class="chat-context__section-head">
          <el-icon><MagicStick /></el-icon>
          <span class="chat-context__label">L0 核心记忆</span>
          <span class="chat-context__meta">
            {{ l0Actual }} / {{ info.l0Count }} 条
            <span v-if="l0Truncated" class="chat-context__truncated">（已截断，仅展示前 {{ l0Actual }} 条）</span>
          </span>
        </header>
        <ol v-if="info.l0Items?.length" class="chat-context__list">
          <li v-for="(m, i) in info.l0Items" :key="`l0-${i}`" class="chat-context__list-item">
            <span class="chat-context__list-idx">{{ i + 1 }}</span>
            <span class="chat-context__list-text">{{ m }}</span>
          </li>
        </ol>
        <div v-else class="chat-context__empty">（无内容，计数值来自其他来源）</div>
      </section>

      <!-- L1 近期摘要 -->
      <section v-if="(info.l1Items?.length ?? 0) > 0 || info.l1Count > 0" class="chat-context__section">
        <header class="chat-context__section-head">
          <el-icon><Collection /></el-icon>
          <span class="chat-context__label">L1 近期摘要</span>
          <span class="chat-context__meta">
            {{ l1Actual }} / {{ info.l1Count }} 条
            <span v-if="l1Truncated" class="chat-context__truncated">（已截断，仅展示前 {{ l1Actual }} 条）</span>
          </span>
        </header>
        <ol v-if="info.l1Items?.length" class="chat-context__list">
          <li v-for="(m, i) in info.l1Items" :key="`l1-${i}`" class="chat-context__list-item">
            <span class="chat-context__list-idx">{{ i + 1 }}</span>
            <span class="chat-context__list-text">{{ m }}</span>
          </li>
        </ol>
        <div v-else class="chat-context__empty">（无内容，计数值来自其他来源）</div>
      </section>
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
  font-size: 0.75rem;
  color: var(--echo-text-muted, #6b7280);
}
.chat-context__hint {
  margin-left: auto;
  font-size: 0.72rem;
  color: var(--echo-text-muted, #9ca3af);
}
.chat-context__body {
  padding: 0 0.6rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  border-top: 1px dashed var(--echo-border, #e5e7eb);
}
.chat-context__section {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.chat-context__section-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  color: var(--echo-text, #1f2937);
}
.chat-context__label {
  font-weight: 500;
}
.chat-context__meta {
  margin-left: auto;
  font-size: 0.72rem;
  color: var(--echo-text-muted, #6b7280);
}
.chat-context__truncated {
  color: #d97706;
  margin-left: 0.3rem;
}
.chat-context__persona {
  margin: 0;
  padding: 0.5rem 0.6rem;
  background: var(--echo-surface, #ffffff);
  border: 1px dashed #c7d2fe;
  border-radius: 0.35rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--echo-text, #1f2937);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 180px;
  overflow-y: auto;
}
.chat-context__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.chat-context__list-item {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  border-left: 2px solid #165dff;
  padding: 0.25rem 0.5rem;
  background: var(--echo-surface, #ffffff);
  color: var(--echo-text, #1f2937);
  border-radius: 0 0.25rem 0.25rem 0;
  font-size: 0.82rem;
  line-height: 1.45;
}
.chat-context__list-idx {
  flex-shrink: 0;
  display: inline-block;
  min-width: 18px;
  text-align: center;
  background: #165dff;
  color: #ffffff;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 1px 0;
}
.chat-context__list-text {
  color: var(--echo-text, #1f2937);
  word-break: break-word;
  white-space: pre-wrap;
}
.chat-context__empty {
  font-size: 0.78rem;
  color: var(--echo-text-muted, #9ca3af);
  font-style: italic;
}
</style>
