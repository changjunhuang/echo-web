<template>
  <div class="chat-page">
    <!-- Sidebar: sessions list -->
    <aside class="chat-sidebar">
      <div class="sidebar-header">
        <button class="new-chat-btn" @click="handleNewChat">
          <el-icon><Plus /></el-icon>
          <span>新对话</span>
        </button>
      </div>

      <div class="sessions-list">
        <div
          v-for="session in chatStore.sessions"
          :key="session.id"
          class="session-item"
          :class="{ 'session-item--active': chatStore.currentSessionId === session.id }"
          @click="chatStore.currentSessionId = session.id"
        >
          <el-icon class="session-icon"><ChatDotRound /></el-icon>
          <span class="session-title">{{ session.title }}</span>
          <button
            class="session-delete"
            @click.stop="chatStore.deleteSession(session.id)"
            title="删除"
          >
            <el-icon><Close /></el-icon>
          </button>
        </div>
        <div v-if="chatStore.sessions.length === 0" class="sessions-empty">
          <p>暂无对话记录</p>
        </div>
      </div>

      <div class="sidebar-footer">
        <div class="model-selector">
          <span class="model-label">当前模型</span>
          <el-select
            v-model="chatStore.selectedModel"
            class="model-select"
            size="small"
            :teleported="false"
          >
            <el-option
              v-for="m in availableModels"
              :key="m.value"
              :label="m.label"
              :value="m.value"
            />
          </el-select>
        </div>
      </div>
    </aside>

    <!-- Main chat area -->
    <div class="chat-main">
      <!-- Empty state -->
      <div v-if="!chatStore.currentSession" class="chat-empty">
        <div class="empty-content">
          <div class="empty-icon">⚡</div>
          <h2 class="empty-title">Echo Web AI 助手</h2>
          <p class="empty-subtitle">选择一个已有对话，或者点击左侧「新对话」按钮开始</p>
          <div class="quick-starts">
            <button
              v-for="q in quickStarts"
              :key="q"
              class="quick-start-btn"
              @click="handleQuickStart(q)"
            >
              {{ q }}
            </button>
          </div>
        </div>
      </div>

      <template v-else>
        <!-- Messages area -->
        <div class="messages-area" ref="messagesArea">
          <div class="messages-inner">
            <div
              v-for="msg in chatStore.currentSession.messages"
              :key="msg.id"
              class="message-wrapper"
              :class="`message-wrapper--${msg.role}`"
            >
              <div class="message-avatar">
                <template v-if="msg.role === 'user'">
                  <el-icon><UserFilled /></el-icon>
                </template>
                <template v-else>
                  <span class="ai-avatar">⚡</span>
                </template>
              </div>
              <div class="message-bubble" :class="`message-bubble--${msg.role}`">
                <div class="message-content" v-html="renderMarkdown(msg.content)" />
              </div>
            </div>

            <!-- Streaming indicator -->
            <div v-if="chatStore.isStreaming" class="message-wrapper message-wrapper--assistant">
              <div class="message-avatar">
                <span class="ai-avatar">⚡</span>
              </div>
              <div class="message-bubble message-bubble--assistant">
                <span class="streaming-dot" /><span class="streaming-dot" /><span
                  class="streaming-dot"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Input area -->
        <div class="input-area">
          <div class="input-wrapper">
            <el-input
              v-model="inputText"
              type="textarea"
              :rows="1"
              :autosize="{ minRows: 1, maxRows: 6 }"
              placeholder="输入消息，按 Enter 发送，Shift+Enter 换行"
              class="chat-input"
              @keydown.enter.exact.prevent="handleSend"
              :disabled="chatStore.isStreaming"
            />
            <div class="input-actions">
              <button
                v-if="chatStore.isStreaming"
                class="stop-btn"
                @click="handleStop"
                title="停止生成"
              >
                <el-icon><VideoPause /></el-icon>
              </button>
              <button
                v-else
                class="send-btn"
                :disabled="!inputText.trim()"
                @click="handleSend"
                title="发送"
              >
                <el-icon><Promotion /></el-icon>
              </button>
            </div>
          </div>
          <p class="input-hint">AI 可能犯错，请核实重要信息</p>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import {
  Plus,
  Close,
  ChatDotRound,
  UserFilled,
  Promotion,
  VideoPause,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@/stores/chat'
import { sendChatMessageStream } from '@/api/chat'

const chatStore = useChatStore()
const inputText = ref('')
const messagesArea = ref<HTMLElement | null>(null)
let abortController: AbortController | null = null

const availableModels = [
  { label: 'Echo Max 1', value: 'echo-max-1' },
  { label: 'Echo Pro 1', value: 'echo-pro-1' },
  { label: 'Echo Lite 1', value: 'echo-lite-1' },
]

const quickStarts = [
  '帮我写一首关于人工智能的诗',
  '解释一下量子计算的基本原理',
  '推荐一些提高工作效率的方法',
  '用 Python 实现一个快速排序算法',
]

function handleNewChat() {
  chatStore.createSession()
}

async function handleQuickStart(text: string) {
  if (!chatStore.currentSession) {
    chatStore.createSession()
  }
  inputText.value = text
  await handleSend()
}

async function scrollToBottom() {
  await nextTick()
  if (messagesArea.value) {
    messagesArea.value.scrollTop = messagesArea.value.scrollHeight
  }
}

function renderMarkdown(text: string): string {
  // Basic markdown-like rendering
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || chatStore.isStreaming) return

  const sessionId = chatStore.currentSessionId
  if (!sessionId) return

  inputText.value = ''
  chatStore.addMessage(sessionId, { role: 'user', content: text })
  await scrollToBottom()

  chatStore.isStreaming = true
  const assistantMsg = chatStore.addMessage(sessionId, { role: 'assistant', content: '' })

  // Replace last message with streaming content
  const session = chatStore.currentSession
  if (!session) return

  const lastMsg = session.messages[session.messages.length - 1]
  lastMsg.content = ''

  abortController = sendChatMessageStream(
    {
      model: chatStore.selectedModel,
      messages: session.messages
        .filter((m) => m.id !== assistantMsg.id)
        .map((m) => ({ role: m.role, content: m.content })),
    },
    async (chunk) => {
      chatStore.appendToLastAssistantMessage(sessionId, chunk)
      await scrollToBottom()
    },
    () => {
      chatStore.isStreaming = false
      abortController = null
    },
    (error) => {
      chatStore.isStreaming = false
      abortController = null
      ElMessage.error(`请求失败: ${error.message}`)
    },
  )
}

function handleStop() {
  abortController?.abort()
  chatStore.isStreaming = false
}

watch(
  () => chatStore.currentSessionId,
  async () => {
    await scrollToBottom()
  },
)
</script>

<style scoped>
.chat-page {
  display: flex;
  height: calc(100vh - 60px);
  background-color: #0a0a10;
  color: #fff;
}

/* Sidebar */
.chat-sidebar {
  width: 260px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.03);
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.new-chat-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 10px;
  border: 1px solid rgba(22, 93, 255, 0.4);
  background: rgba(22, 93, 255, 0.1);
  color: #79abff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.new-chat-btn:hover {
  background: rgba(22, 93, 255, 0.2);
  border-color: rgba(22, 93, 255, 0.6);
  color: #fff;
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s;
  position: relative;
}

.session-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.session-item--active {
  background: rgba(22, 93, 255, 0.12);
}

.session-icon {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
  flex-shrink: 0;
}

.session-title {
  flex: 1;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-item--active .session-title {
  color: #fff;
}

.session-delete {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  opacity: 0;
  transition: all 0.2s;
  flex-shrink: 0;
}

.session-item:hover .session-delete {
  opacity: 1;
}

.session-delete:hover {
  background: rgba(245, 63, 63, 0.15);
  color: #f56c6c;
}

.sessions-empty {
  padding: 32px 16px;
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  font-size: 13px;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.model-selector {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.model-select {
  width: 100%;
}

/* Main chat */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.empty-content {
  text-align: center;
  max-width: 480px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-title {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 12px;
  letter-spacing: -0.5px;
}

.empty-subtitle {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.6;
  margin: 0 0 28px;
}

.quick-starts {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quick-start-btn {
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.65);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-start-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
}

/* Messages */
.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.messages-inner {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.message-wrapper {
  display: flex;
  gap: 12px;
}

.message-wrapper--user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
}

.ai-avatar {
  font-size: 18px;
}

.message-bubble {
  max-width: 75%;
  padding: 14px 18px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.7;
}

.message-bubble--user {
  background: rgba(22, 93, 255, 0.2);
  border: 1px solid rgba(22, 93, 255, 0.3);
  border-radius: 14px 4px 14px 14px;
  color: rgba(255, 255, 255, 0.9);
}

.message-bubble--assistant {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px 14px 14px 14px;
  color: rgba(255, 255, 255, 0.85);
}

.message-content :deep(code) {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  font-family: monospace;
}

.message-content :deep(pre) {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 12px 16px;
  overflow-x: auto;
  margin: 8px 0;
}

.message-content :deep(pre code) {
  background: none;
  padding: 0;
}

/* Streaming dots */
.streaming-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  animation: pulse 1.4s ease-in-out infinite;
  margin: 0 2px;
}

.streaming-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.streaming-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes pulse {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: scale(0.8);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
}

/* Input */
.input-area {
  padding: 16px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.2);
}

.input-wrapper {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  padding: 8px 8px 8px 16px;
  transition: border-color 0.2s;
}

.input-wrapper:focus-within {
  border-color: rgba(22, 93, 255, 0.5);
}

.chat-input {
  flex: 1;
}

:deep(.chat-input .el-textarea__inner) {
  background: transparent;
  border: none;
  padding: 6px 0;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  line-height: 1.6;
  box-shadow: none;
  resize: none;
}

:deep(.chat-input .el-textarea__inner::placeholder) {
  color: rgba(255, 255, 255, 0.3);
}

.input-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.send-btn,
.stop-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: all 0.2s;
}

.send-btn {
  background: #165dff;
  color: #fff;
}

.send-btn:disabled {
  background: rgba(22, 93, 255, 0.3);
  cursor: not-allowed;
}

.send-btn:not(:disabled):hover {
  background: #3a7aff;
}

.stop-btn {
  background: rgba(245, 63, 63, 0.15);
  color: #f56c6c;
  border: 1px solid rgba(245, 63, 63, 0.3);
}

.stop-btn:hover {
  background: rgba(245, 63, 63, 0.25);
}

.input-hint {
  max-width: 800px;
  margin: 8px auto 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.25);
  text-align: center;
}
</style>
