<script setup lang="ts">
/**
 * 思考 / 回忆 / 操作过程面板（event=thinking + event=memory_recall）。
 *
 * 设计：
 *   - **model_reasoning**（大模型 `<think>...</think>` 内容）：作为"模型思考区"独立渲染，
 *     灰色斜体、即时刷新，DeepSeek 风格；回答开始后自动折叠为标题
 *   - **其它 stage 事件**（intent / context_build / recall_search / react_decision / cascade）：
 *     阶段标签 + 文本，作为"处理时间线"展示
 *   - **memory_recall 命中**：折叠列表展示每条 memoryId / topic / summary / similarity
 *
 * 折叠状态：
 *   - 流式进行中：默认展开，方便用户实时看
 *   - 流式结束后：默认折叠，只露标题（点开可看）
 */
import { computed, ref, watch } from 'vue'
import { ArrowDown, ArrowRight, MagicStick, DataAnalysis, Loading } from '@element-plus/icons-vue'
import type { ChatMemoryRecall, ChatThinkingEvent } from '@/types/chat'

const props = defineProps<{
  thinkings?: ChatThinkingEvent[]
  recall?: ChatMemoryRecall
  /** 当前消息是否仍在流式生成中（用于决定是否默认展开 + 显示加载图标） */
  isStreaming?: boolean
  /**
   * 流式中由 ChatPage 的"思考打字机"实时输出的 model_reasoning 文本。
   * 仅在当前消息正在流式生成时传入。流式结束后该值为空字符串，
   * 此时回退到 thinkings[] 中已累积的 model_reasoning 文本。
   */
  streamingReasoning?: string
}>()

const STAGE_LABELS: Record<string, string> = {
  start: '开始处理',
  intent: '意图识别',
  context_build: '构建上下文',
  recall_search: '回忆检索',
  react_decision: '工具决策',
  cascade: '生成回复',
  model_reasoning: '模型思考',
}

// model_reasoning 思考内容：按阶段分组累加（多轮 <think> 会拼成一个 list）
const reasoningParts = computed(() =>
  (props.thinkings ?? [])
    .filter((t) => t.stage === 'model_reasoning')
    .map((t) => t.text),
)
// 流式中优先用打字机实时输出（character-by-character），
// 流式结束后回退到 store 累积的完整文本
const reasoningText = computed(() => {
  if (props.isStreaming && props.streamingReasoning !== undefined) {
    return props.streamingReasoning
  }
  return reasoningParts.value.join('\n\n')
})

// 其它阶段事件：按 stage 去重展示
const stageEvents = computed(() => {
  const stages = ['start', 'intent', 'context_build', 'recall_search', 'react_decision', 'cascade']
  const out: ChatThinkingEvent[] = []
  const seen = new Set<string>()
  for (const t of props.thinkings ?? []) {
    if (!stages.includes(t.stage)) continue
    if (seen.has(t.stage)) continue
    seen.add(t.stage)
    out.push(t)
  }
  return out
})

const hasReasoning = computed(() => reasoningParts.value.length > 0)
const hasStageEvents = computed(() => stageEvents.value.length > 0)
const hasRecall = computed(
  () => !!props.recall && (props.recall.hits?.length ?? 0) > 0,
)

// 默认折叠态：流式中展开、结束后折叠（仅当有内容时才有意义）
const expanded = ref<boolean>(!!props.isStreaming)
watch(
  () => props.isStreaming,
  (val) => {
    // 流式开始 → 展开；流式结束 → 自动折叠（除非用户主动改过）
    if (val) expanded.value = true
  },
)

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage
}
</script>

<template>
  <div v-if="hasReasoning || hasStageEvents || hasRecall" class="chat-process">
    <button
      type="button"
      class="chat-process__head"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <el-icon class="chat-process__caret">
        <ArrowDown v-if="expanded" />
        <ArrowRight v-else />
      </el-icon>
      <el-icon v-if="isStreaming && hasReasoning" class="chat-process__icon chat-process__icon--spin">
        <Loading />
      </el-icon>
      <el-icon v-else class="chat-process__icon"><MagicStick /></el-icon>
      <span class="chat-process__title">
        {{ hasReasoning ? '已思考 / 思考中' : '思考过程' }}
      </span>
      <span v-if="hasRecall" class="chat-process__count">
        回忆 {{ props.recall?.count ?? 0 }} 条
      </span>
    </button>

    <div v-if="expanded" class="chat-process__body">
      <!-- 模型思考区：DeepSeek 风格（实时刷新 + 流式结束后保持） -->
      <div v-if="hasReasoning" class="chat-process__reasoning">
        <div class="chat-process__reasoning-label">
          <el-icon><MagicStick /></el-icon>
          <span>模型思考</span>
          <span v-if="isStreaming" class="chat-process__reasoning-status">思考中…</span>
        </div>
        <div class="chat-process__reasoning-text">
          {{ reasoningText }}<span
            v-if="isStreaming"
            class="chat-process__caret-inline"
            aria-hidden="true"
          >▍</span>
        </div>
      </div>

      <!-- 处理时间线：阶段事件 -->
      <div v-if="hasStageEvents" class="chat-process__section">
        <div class="chat-process__section-title">处理流程</div>
        <ol class="chat-process__timeline">
          <li v-for="t in stageEvents" :key="t.stage" class="chat-process__step">
            <span class="chat-process__step-tag">{{ stageLabel(t.stage) }}</span>
            <span class="chat-process__step-text">{{ t.text }}</span>
          </li>
        </ol>
      </div>

      <!-- 回忆命中 -->
      <div v-if="hasRecall" class="chat-process__section">
        <div class="chat-process__section-title">
          <el-icon><DataAnalysis /></el-icon>
          回忆命中（{{ props.recall?.count }}）
        </div>
        <ul class="chat-process__hits">
          <li
            v-for="(h, i) in props.recall?.hits"
            :key="`${h.memoryId}-${i}`"
            class="chat-process__hit"
          >
            <div class="chat-process__hit-head">
              <span class="chat-process__hit-topic">{{ h.topic || '（无主题）' }}</span>
              <span class="chat-process__hit-sim">{{ (h.similarity * 100).toFixed(1) }}%</span>
            </div>
            <div v-if="h.summary" class="chat-process__hit-summary">{{ h.summary }}</div>
            <div v-if="h.memoryId" class="chat-process__hit-mid">{{ h.memoryId }}</div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-process {
  margin-top: 0.6rem;
  border: 1px solid var(--echo-border, #e0e7ff);
  border-radius: 0.6rem;
  background: linear-gradient(180deg, #f5f3ff 0%, #fafbff 100%);
  overflow: hidden;
  font-size: 0.85rem;
}
.chat-process__head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.45rem 0.7rem;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
  color: var(--echo-text, #1f2937);
}
.chat-process__head:hover {
  background: rgba(99, 102, 241, 0.06);
}
.chat-process__caret {
  color: var(--echo-text-muted, #6b7280);
}
.chat-process__icon {
  color: #6366f1;
}
.chat-process__icon--spin {
  animation: spin 1.2s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.chat-process__title {
  font-weight: 500;
}
.chat-process__count {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--echo-text-muted, #6b7280);
}
.chat-process__body {
  padding: 0 0.7rem 0.7rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

/* ---- DeepSeek 风格思考区 ---- */
.chat-process__reasoning {
  border-left: 3px solid #6366f1;
  padding: 0.5rem 0.7rem;
  background: rgba(238, 242, 255, 0.5);
  border-radius: 0 0.35rem 0.35rem 0;
}
.chat-process__reasoning-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: #4f46e5;
  font-weight: 500;
  margin-bottom: 0.3rem;
}
.chat-process__reasoning-status {
  margin-left: auto;
  font-size: 0.72rem;
  color: #6366f1;
  font-weight: 400;
}
.chat-process__reasoning-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.84rem;
  line-height: 1.55;
  color: #4b5563;
  font-style: italic;
  max-height: 240px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.chat-process__caret-inline {
  display: inline-block;
  margin-left: 1px;
  color: #6366f1;
  font-style: normal;
  font-weight: 600;
  animation: chat-process-caret-blink 1s steps(2, start) infinite;
}
@keyframes chat-process-caret-blink {
  to {
    opacity: 0;
  }
}

/* ---- 处理流程时间线 ---- */
.chat-process__section-title {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: #4f46e5;
  margin-bottom: 0.3rem;
}
.chat-process__timeline {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.chat-process__step {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.82rem;
  line-height: 1.4;
}
.chat-process__step-tag {
  flex-shrink: 0;
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  background: #ede9fe;
  color: #5b21b6;
  font-size: 0.72rem;
  font-weight: 500;
}
.chat-process__step-text {
  color: var(--echo-text, #1f2937);
  word-break: break-word;
}

/* ---- 回忆命中 ---- */
.chat-process__hits {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.chat-process__hit {
  border-left: 2px solid #6366f1;
  padding: 0.3rem 0.5rem;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 0 0.25rem 0.25rem 0;
}
.chat-process__hit-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.chat-process__hit-topic {
  font-weight: 500;
  font-size: 0.85rem;
  color: var(--echo-text, #1f2937);
}
.chat-process__hit-sim {
  margin-left: auto;
  font-size: 0.72rem;
  color: #4f46e5;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.chat-process__hit-summary {
  margin-top: 0.2rem;
  font-size: 0.8rem;
  color: var(--echo-text-muted, #4b5563);
  line-height: 1.45;
  word-break: break-word;
  white-space: pre-wrap;
}
.chat-process__hit-mid {
  margin-top: 0.2rem;
  font-size: 0.7rem;
  color: var(--echo-text-muted, #6b7280);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  word-break: break-all;
}
</style>
