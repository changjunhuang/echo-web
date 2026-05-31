<template>
  <div class="echo-layout">
    <!-- Sidebar: sessions list -->
    <aside class="echo-sidebar" :class="{ 'is-collapsed': sidebarCollapsed }">
      <div class="sidebar-header">
        <button class="new-chat-btn" @click="handleNewChat">
          <el-icon><Plus /></el-icon>
          <span v-if="!sidebarCollapsed">新对话</span>
        </button>
      </div>

      <div class="sessions-list" v-show="!sidebarCollapsed">
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
    </aside>

    <!-- Toggle sidebar button -->
    <button class="sidebar-toggle" @click="toggleSidebar" :title="sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'">
      <el-icon v-if="sidebarCollapsed"><DArrowRight /></el-icon>
      <el-icon v-else><DArrowLeft /></el-icon>
    </button>

    <!-- Main chat area -->
    <div class="chat-main">
      <!-- Back button -->
      <div class="chat-header" v-if="chatStore.currentSession">
        <button class="back-btn" @click="goHome">
          <el-icon><ArrowLeft /></el-icon>
          <span>返回</span>
        </button>
      </div>

      <!-- Empty state -->
      <div v-if="!chatStore.currentSession" class="chat-empty">
        <div class="empty-content">
          <h2 class="empty-title">ECHO</h2>
          <p class="empty-subtitle">即刻为你解答</p>
          <div class="empty-input-wrapper">
            <el-input
              v-model="emptyInputText"
              type="textarea"
              :rows="1"
              :autosize="{ minRows: 1, maxRows: 4 }"
              placeholder="输入消息，Shift+Enter 换行"
              class="empty-input"
              @keydown.enter.exact.prevent="handleEmptySend"
            />
            <button
              class="empty-send-btn"
              :disabled="!emptyInputText.trim()"
              @click="handleEmptySend"
            >
              <el-icon><Promotion /></el-icon>
            </button>
          </div>
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
                  <span class="ai-avatar">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                      <circle cx="10" cy="10" r="9" stroke="#165dff" stroke-width="1.5"/>
                      <path d="M6 10h8M10 6v8" stroke="#165dff" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                  </span>
                </template>
              </div>
              <div class="message-bubble" :class="`message-bubble--${msg.role}`">
                <div v-if="editingMessageId === msg.id" class="edit-wrapper">
                  <el-input
                    v-model="editingText"
                    type="textarea"
                    :rows="2"
                    placeholder="修改内容"
                    class="edit-input"
                    @keydown.enter.exact.prevent="handleSaveEdit(msg.id)"
                    @keydown.esc="handleCancelEdit"
                  />
                  <div class="edit-actions">
                    <button class="edit-btn edit-btn--cancel" @click="handleCancelEdit">取消</button>
                    <button class="edit-btn edit-btn--save" @click="handleSaveEdit(msg.id)">发送</button>
                  </div>
                </div>
                <div v-else class="message-content" v-html="renderMarkdown(msg.content)" />
                <div v-if="msg.role === 'assistant' && msg.imageUrl" class="message-image">
                  <el-image
                    :src="msg.imageUrl"
                    :preview-src-list="[msg.imageUrl]"
                    fit="contain"
                    class="chat-image"
                  />
                </div>
              </div>
              <div class="message-actions" v-if="msg.role === 'user' && !editingMessageId">
                <button class="action-btn" @click="handleCopy(msg.content)" title="复制">
                  <el-icon><CopyDocument /></el-icon>
                </button>
                <button class="action-btn" @click="handleEdit(msg)" title="编辑">
                  <el-icon><Edit /></el-icon>
                </button>
                <button class="action-btn action-btn--retry" @click="handleRetry(msg)" title="重试">
                  <el-icon><RefreshRight /></el-icon>
                </button>
              </div>
            </div>

            <!-- Streaming indicator -->
            <div v-if="chatStore.isStreaming" class="message-wrapper message-wrapper--assistant">
              <div class="message-avatar">
                <span class="ai-avatar">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="9" stroke="#165dff" stroke-width="1.5"/>
                    <path d="M6 10h8M10 6v8" stroke="#165dff" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </span>
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
              :autosize="{ minRows: 1, maxRows: 8 }"
              placeholder="输入消息，Shift+Enter 换行"
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
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Plus,
  Close,
  ChatDotRound,
  UserFilled,
  Promotion,
  VideoPause,
  CopyDocument,
  RefreshRight,
  Edit,
  DArrowLeft,
  DArrowRight,
  ArrowLeft,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@/stores/chat'
import type { ChatSession } from '@/types/chat'
import { sendChatMessageStream } from '@/api/chat'

const router = useRouter()
const chatStore = useChatStore()
const inputText = ref('')
const emptyInputText = ref('')
const messagesArea = ref<HTMLElement | null>(null)
let abortController: AbortController | null = null
const editingMessageId = ref<string | null>(null)
const editingText = ref('')
const sidebarCollapsed = ref(false)

onMounted(() => {
  chatStore.initDefaultSession()
})

const quickStarts = [
  '帮我写一首关于人工智能的诗',
  '解释一下量子计算的基本原理',
  '推荐一些提高工作效率的方法',
  '用 Python 实现一个快速排序算法',
]

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

function goHome() {
  chatStore.currentSessionId = null
  router.push('/home')
}

function handleNewChat() {
  chatStore.createSession()
}

async function handleEmptySend() {
  const text = emptyInputText.value.trim()
  if (!text) return
  if (!chatStore.currentSession) {
    chatStore.createSession()
  }
  inputText.value = text
  emptyInputText.value = ''
  await handleSend()
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

  let sessionId = chatStore.currentSessionId
  if (!sessionId) {
    sessionId = chatStore.defaultSessionId
    if (sessionId && !chatStore.sessions.find((s) => s.id === sessionId)) {
      const defaultSession: ChatSession = {
        id: sessionId,
        title: '默认对话',
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      chatStore.sessions.unshift(defaultSession)
      chatStore.currentSessionId = sessionId
    }
  }
  if (!sessionId) {
    ElMessage.warning('会话初始化中，请稍后重试')
    return
  }

  inputText.value = ''
  chatStore.addMessage(sessionId, { role: 'user', content: text })
  await scrollToBottom()

  chatStore.isStreaming = true
  const assistantMsg = chatStore.addMessage(sessionId, { role: 'assistant', content: '' })

  const session = chatStore.sessions.find((s) => s.id === sessionId)
  if (!session) {
    chatStore.isStreaming = false
    return
  }

  const lastMsg = session.messages[session.messages.length - 1]
  lastMsg.content = ''

  const messageString = session.messages
    .filter((m) => m.id !== assistantMsg.id)
    .filter((m) => m.content && m.content.trim().length > 0)
    .map((m) => {
      const roleLabel = m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : 'system'
      return `${roleLabel}: ${m.content}`
    })
    .join('\n\n')

  abortController = sendChatMessageStream(
    {
      model: chatStore.selectedModel,
      userId: chatStore.userId,
      sessionId: sessionId,
      message: messageString,
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
    async (imageUrl) => {
      chatStore.setMessageImageUrl(sessionId, imageUrl)
      await scrollToBottom()
    },
  )
}

function handleStop() {
  abortController?.abort()
  chatStore.isStreaming = false
}

async function handleCopy(content: string) {
  try {
    await navigator.clipboard.writeText(content)
    ElMessage.success('复制成功')
  } catch {
    ElMessage.error('复制失败')
  }
}

async function handleRetry(msg: { id: string; content: string }) {
  const sessionId = chatStore.currentSessionId
  if (!sessionId || chatStore.isStreaming) return

  const session = chatStore.sessions.find((s) => s.id === sessionId)
  if (!session) return

  inputText.value = msg.content
  await handleSend()
}

function handleEdit(msg: { id: string; content: string }) {
  editingMessageId.value = msg.id
  editingText.value = msg.content
}

async function handleSaveEdit(msgId: string) {
  const newContent = editingText.value.trim()
  if (!newContent) return

  const sessionId = chatStore.currentSessionId
  if (!sessionId) return

  const session = chatStore.sessions.find((s) => s.id === sessionId)
  if (!session) return

  const msgIndex = session.messages.findIndex((m) => m.id === msgId)
  if (msgIndex === -1) return

  session.messages[msgIndex].content = newContent
  editingMessageId.value = null
  editingText.value = ''

  session.messages.splice(msgIndex, 1)
  if (msgIndex < session.messages.length && session.messages[msgIndex].role === 'assistant') {
    session.messages.splice(msgIndex, 1)
  }

  inputText.value = newContent
  await handleSend()
}

function handleCancelEdit() {
  editingMessageId.value = null
  editingText.value = ''
}

watch(
  () => chatStore.currentSessionId,
  async () => {
    await scrollToBottom()
  },
)
</script>

<style scoped>
.echo-layout {
  display: flex;
  height: 100vh;
  background-color: #1a1a1a;
  color: #fff;
}

/* Sidebar */
.echo-sidebar {
  width: 260px;
  flex-shrink: 0;
  background: #252525;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.3s ease;
}

.echo-sidebar.is-collapsed {
  width: 0;
  border-right: none;
}

.sidebar-header {
  padding: 16px;
}

.new-chat-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 8px;
  border: none;
  background: #165dff;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.new-chat-btn:hover {
  background: #3a7aff;
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s;
  position: relative;
}

.session-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.session-item--active {
  background: rgba(22, 93, 255, 0.15);
}

.session-icon {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}

.session-title {
  flex: 1;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.75);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-item--active .session-title {
  color: #fff;
}

.session-delete {
  width: 24px;
  height: 24px;
  border-radius: 6px;
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
  background: rgba(245, 63, 63, 0.2);
  color: #f56c6c;
}

.sessions-empty {
  padding: 32px 16px;
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  font-size: 14px;
}

/* Sidebar toggle */
.sidebar-toggle {
  position: fixed;
  left: 260px;
  top: 50%;
  transform: translateY(-50%);
  width: 24px;
  height: 48px;
  background: #333;
  border: none;
  border-radius: 0 6px 6px 0;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: left 0.3s ease, background-color 0.2s;
  z-index: 100;
}

.sidebar-toggle:hover {
  background: #444;
  color: #fff;
}

.echo-sidebar.is-collapsed + .sidebar-toggle {
  left: 0;
}

.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #1a1a1a;
}

/* Chat header */
.chat-header {
  padding: 16px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* Empty state */
.chat-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.empty-content {
  text-align: center;
  max-width: 500px;
}

.empty-title {
  font-size: 42px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 8px;
  letter-spacing: 8px;
}

.empty-subtitle {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 24px;
}

.empty-input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  background: #333;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 36px 40px 36px 56px;
  margin-bottom: 16px;
  max-width: 667px;
  margin-left: auto;
  margin-right: auto;
}

.empty-input-wrapper:focus-within {
  border-color: rgba(22, 93, 255, 0.5);
}

.empty-input {
  flex: 1;
}

:deep(.empty-input .el-textarea__inner) {
  background: transparent;
  border: none;
  padding: 0;
  color: rgba(255, 255, 255, 0.95);
  font-size: 15px;
  line-height: 1.6;
  box-shadow: none;
  resize: none;
}

:deep(.empty-input .el-textarea__inner::placeholder) {
  color: rgba(255, 255, 255, 0.35);
}

.empty-send-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: #165dff;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: background-color 0.2s;
  flex-shrink: 0;
}

.empty-send-btn:disabled {
  background: rgba(22, 93, 255, 0.4);
  cursor: not-allowed;
}

.empty-send-btn:not(:disabled):hover {
  background: #3a7aff;
}

.quick-starts {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  align-items: center;
}

.quick-start-btn {
  padding: 8px 14px;
  border-radius: 16px;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.quick-start-btn:hover {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.8);
}

/* Messages */
.messages-area {
  flex: 1;
  overflow-y: auto;
  padding: 24px 0;
}

.messages-inner {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.message-wrapper {
  display: flex;
  gap: 16px;
  padding: 0 24px;
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
  background: #333;
  color: rgba(255, 255, 255, 0.7);
}

.message-bubble {
  max-width: 70%;
  padding: 14px 18px;
  border-radius: 16px;
  font-size: 15px;
  line-height: 1.7;
}

.message-bubble--user {
  background: #165dff;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.message-bubble--assistant {
  background: #2a2a2a;
  color: rgba(255, 255, 255, 0.9);
  border-bottom-left-radius: 4px;
}

.message-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.message-wrapper:hover .message-actions {
  opacity: 1;
}

.action-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.action-btn--retry {
  color: #e6a23c;
}

.action-btn--retry:hover {
  background: rgba(245, 108, 108, 0.2);
  color: #f56c6c;
}

.edit-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 200px;
}

.edit-input {
  width: 100%;
}

:deep(.edit-input .el-textarea__inner) {
  background: rgba(22, 93, 255, 0.2);
  border: 1px solid rgba(22, 93, 255, 0.4);
  color: #fff;
  border-radius: 8px;
  padding: 8px 12px;
}

.edit-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.edit-btn {
  padding: 4px 12px;
  border-radius: 6px;
  border: none;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.edit-btn--cancel {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
}

.edit-btn--cancel:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.edit-btn--save {
  background: #165dff;
  color: #fff;
}

.edit-btn--save:hover {
  background: #3a7aff;
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
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  animation: pulse 1.4s ease-in-out infinite;
  margin: 0 3px;
}

.streaming-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.streaming-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes pulse {
  0%, 80%, 100% {
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
  padding: 16px 24px 24px;
}

.input-wrapper {
  max-width: 800px;
  margin: 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 12px;
  background: #333;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 10px 12px 10px 18px;
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
  color: rgba(255, 255, 255, 0.95);
  font-size: 15px;
  line-height: 1.6;
  box-shadow: none;
  resize: none;
}

:deep(.chat-input .el-textarea__inner::placeholder) {
  color: rgba(255, 255, 255, 0.35);
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
  border-radius: 10px;
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
  background: rgba(22, 93, 255, 0.4);
  cursor: not-allowed;
}

.send-btn:not(:disabled):hover {
  background: #3a7aff;
}

.stop-btn {
  background: rgba(245, 63, 63, 0.2);
  color: #f56c6c;
}

.stop-btn:hover {
  background: rgba(245, 63, 63, 0.3);
}

.message-image {
  margin-top: 12px;
  border-radius: 12px;
  overflow: hidden;
  max-width: 400px;
}

.chat-image {
  width: 100%;
  border-radius: 12px;
}
</style>