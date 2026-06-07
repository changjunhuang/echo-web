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
      <!-- Empty state -->
      <div v-if="!chatStore.currentSession" class="chat-empty">
        <div class="empty-content">
          <h2 class="empty-title">ECHO</h2>
          <p class="empty-subtitle">即刻为你解答</p>
          <div class="empty-input-wrapper" :class="{ 'empty-input-wrapper--recording': isListening }">
            <el-input
              v-model="emptyInputText"
              type="textarea"
              :rows="1"
              :autosize="{ minRows: 1, maxRows: 4 }"
              :placeholder="emptyInputPlaceholder"
              class="empty-input"
              @keydown.enter.exact.prevent="handleEmptySend"
              :disabled="isListening"
            />
            <div class="empty-input-actions">
              <button
                v-if="!speech.isSupported"
                class="empty-mic-btn empty-mic-btn--disabled"
                disabled
                title="当前浏览器不支持语音识别"
              >
                <el-icon><Microphone /></el-icon>
              </button>
              <button
                v-else-if="isListening"
                class="empty-mic-btn empty-mic-btn--recording"
                @click="handleToggleMic"
                title="停止录音"
              >
                <el-icon><VideoPause /></el-icon>
              </button>
              <button
                v-else
                class="empty-mic-btn"
                @click="handleToggleMic"
                title="开始语音输入"
              >
                <el-icon><Microphone /></el-icon>
              </button>
              <button
                class="empty-send-btn"
                :disabled="!emptyInputText.trim()"
                @click="handleEmptySend"
              >
                <el-icon><Promotion /></el-icon>
              </button>
            </div>
          </div>
          <div v-if="isListening" class="recording-hint recording-hint--empty">
            <span class="recording-dot" />
            <span class="recording-label">正在聆听…</span>
            <span v-if="displayInterim" class="recording-interim">{{ displayInterim }}</span>
            <span v-else class="recording-interim recording-interim--placeholder">请开始讲话</span>
            <button
              class="recording-abort-btn"
              type="button"
              @click="handleAbort"
              title="终止本次语音"
            >
              <el-icon><CircleClose /></el-icon>
              <span>终止</span>
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
                <template v-else>
                  <!-- 语音消息：播报按钮 + 识别文本框 -->
                  <div v-if="msg.source === 'voice'" class="voice-block">
                    <div class="voice-block__header">
                      <el-icon class="voice-block__icon"><Microphone /></el-icon>
                      <span class="voice-block__label">语音消息</span>
                    </div>
                    <button
                      class="voice-play-btn"
                      :class="{ 'voice-play-btn--playing': speakingId === msg.id }"
                      @click="handleTogglePlay(msg)"
                      :title="speakingId === msg.id ? '停止播报' : '语音播报'"
                    >
                      <el-icon>
                        <VideoPause v-if="speakingId === msg.id" />
                        <VideoPlay v-else />
                      </el-icon>
                      <span>{{ speakingId === msg.id ? '停止播报' : '语音播报' }}</span>
                    </button>
                    <div class="voice-text-box" :title="msg.content">
                      {{ msg.content || '(未识别到内容)' }}
                    </div>
                  </div>
                  <!-- 普通文本消息 -->
                  <div v-else class="message-content" v-html="renderMarkdown(msg.content)" />
                  <div v-if="msg.role === 'assistant' && msg.imageUrl" class="message-image">
                    <el-image
                      :src="msg.imageUrl"
                      :preview-src-list="[msg.imageUrl]"
                      fit="contain"
                      class="chat-image"
                    />
                  </div>
                </template>
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
          <div class="input-wrapper" :class="{ 'input-wrapper--recording': isListening }">
            <el-input
              v-model="inputText"
              type="textarea"
              :rows="1"
              :autosize="{ minRows: 1, maxRows: 8 }"
              :placeholder="inputPlaceholder"
              class="chat-input"
              @keydown.enter.exact.prevent="handleSend"
              :disabled="chatStore.isStreaming || isListening"
            />
            <div class="input-actions">
              <!-- 语音输入按钮（不支持的浏览器渲染为禁用态） -->
              <button
                v-if="!speech.isSupported"
                class="mic-btn mic-btn--disabled"
                disabled
                title="当前浏览器不支持语音识别"
              >
                <el-icon><Microphone /></el-icon>
              </button>
              <button
                v-else-if="isListening"
                class="mic-btn mic-btn--recording"
                @click="handleToggleMic"
                title="停止录音"
              >
                <el-icon><VideoPause /></el-icon>
              </button>
              <button
                v-else
                class="mic-btn"
                :disabled="chatStore.isStreaming"
                @click="handleToggleMic"
                title="开始语音输入"
              >
                <el-icon><Microphone /></el-icon>
              </button>
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
          <!-- 录音实时状态：显示在输入框正下方 -->
          <div v-if="isListening" class="recording-hint">
            <span class="recording-dot" />
            <span class="recording-label">正在聆听…</span>
            <span v-if="displayInterim" class="recording-interim">{{ displayInterim }}</span>
            <span v-else class="recording-interim recording-interim--placeholder">请开始讲话</span>
            <button
              class="recording-abort-btn"
              type="button"
              @click="handleAbort"
              title="终止本次语音"
            >
              <el-icon><CircleClose /></el-icon>
              <span>终止</span>
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, onMounted, computed } from 'vue'
import {
  Plus,
  Close,
  ChatDotRound,
  UserFilled,
  Promotion,
  VideoPause,
  VideoPlay,
  CopyDocument,
  RefreshRight,
  Edit,
  DArrowLeft,
  DArrowRight,
  Microphone,
  CircleClose,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@/stores/chat'
import type { ChatSession, Message } from '@/types/chat'
import { sendChatMessageStream } from '@/api/chat'
import { useSpeechRecognition } from '@/composables/useSpeechRecognition'
import { useSpeechSynthesis } from '@/composables/useSpeechSynthesis'

const chatStore = useChatStore()
const inputText = ref('')
const emptyInputText = ref('')
const messagesArea = ref<HTMLElement | null>(null)
let abortController: AbortController | null = null
const editingMessageId = ref<string | null>(null)
const editingText = ref('')
const sidebarCollapsed = ref(false)
/** 标记下一条待发送消息的来源（语音 / 文本），handleSend 消费后重置为 text */
const pendingSource = ref<'text' | 'voice'>('text')

/* ---- 语音识别（STT） ---- */
const speech = useSpeechRecognition({
  lang: 'zh-CN',
  continuous: true,
  interimResults: true,
  onError: (msg) => {
    // 不支持 / 没有权限 / 麦克风未授权等情况，提示用户
    if (msg === 'not-allowed' || msg === 'service-not-allowed') {
      ElMessage.error('麦克风权限被拒绝，请在浏览器设置中允许后重试')
    } else if (msg === 'no-speech') {
      // 静默超时，常见且无需打扰
      console.info('[chat] no speech detected, stopped silently')
    } else if (msg === 'aborted') {
      // 用户主动点击"终止"：不再弹"语音识别失败"这种带负面语义的提示，
      // 改用更优雅的 info 提示，让用户知道动作已被响应
      console.info('[chat] voice input aborted by user')
      ElMessage.info('已终止本次语音')
    } else {
      ElMessage.warning(`语音识别失败: ${msg}`)
    }
  },
})
const isListening = speech.isListening

/** 录音时给输入框的占位提示（静态计算一次） */
const inputPlaceholder = computed(() =>
  isListening.value ? '正在聆听… 松开或点击麦克风结束' : '输入消息，Shift+Enter 换行',
)

/** 空状态输入框的占位提示（与对话态共用同一个录音状态） */
const emptyInputPlaceholder = computed(() =>
  isListening.value ? '正在聆听… 点击麦克风结束' : '输入消息，Shift+Enter 换行',
)

/** 录音中展示的实时文字：已敲定 + 中间结果 */
const displayInterim = computed(() => {
  const finalized = speech.transcript.value.trim()
  const interim = speech.interimTranscript.value.trim()
  if (finalized && interim) return `${finalized} ${interim}`
  return finalized || interim
})

/* ---- 语音播报（TTS） ---- */
const tts = useSpeechSynthesis('zh-CN')
/** 正在播报的消息 id；同一时刻只播一条 */
const speakingId = ref<string | null>(null)

/** 切换录音状态 */
function handleToggleMic() {
  if (isListening.value) {
    speech.stop()
    return
  }
  // 若已有文字，保留；点击后新的内容会追加
  speech.reset()
  speech.start()
}

/**
 * 主动终止本次录音：说错了话或不想继续时调用。
 * abort() 会同步清空已收集的 transcript，避免 watch 把半句话自动发送出去。
 */
function handleAbort() {
  if (!isListening.value) return
  speech.abort()
  console.info('[chat] user aborted current voice input')
}

/** 切换语音播报 */
function handleTogglePlay(msg: Message) {
  if (speakingId.value === msg.id) {
    tts.stop()
    speakingId.value = null
    return
  }
  // 切换到新消息前先停掉上一条
  tts.stop()
  speakingId.value = msg.id
  tts.speak(msg.content)
  // 通过 setInterval 监测 isSpeaking 回落（speechSynthesis 没有 end 回调的可靠通道）
  const timer = setInterval(() => {
    if (!tts.isSpeaking.value) {
      speakingId.value = null
      clearInterval(timer)
    }
  }, 250)
}

onMounted(() => {
  chatStore.initDefaultSession()
  // 部分浏览器（Chromium 系）首次调用前 getVoices 列表为空，
  // 在这里注册一次 voiceschanged 以便后续 pickVoice 能拿到中文音色。
  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      console.info('[tts] voices loaded: %d', window.speechSynthesis.getVoices().length)
    }
  }
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
  // 由调用方决定消息来源（语音 / 键盘），默认 text
  const source = pendingSource.value
  pendingSource.value = 'text'
  chatStore.addMessage(sessionId, { role: 'user', content: text, source })
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

async function handleRetry(msg: Message) {
  const sessionId = chatStore.currentSessionId
  if (!sessionId || chatStore.isStreaming) return

  const session = chatStore.sessions.find((s) => s.id === sessionId)
  if (!session) return

  // 重试时若原消息是语音，保持来源标记
  pendingSource.value = msg.source ?? 'text'
  inputText.value = msg.content
  await handleSend()
}

function handleEdit(msg: Message) {
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

  const original = session.messages[msgIndex]
  // 编辑后保留原来源标记
  pendingSource.value = original.source ?? 'text'

  original.content = newContent
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

/**
 * 语音识别完成后，浏览器触发 onend。
 * 这里把最终文本灌进输入框，并自动发送给后端。
 * 失败/空文本则不发送。
 * 同时兼容空状态（未创建会话）与对话态两种场景。
 */
watch(
  () => speech.isListening.value,
  async (listening, prev) => {
    if (!prev || listening) return
    // 录音刚结束
    const finalText = speech.transcript.value.trim()
    if (!finalText) {
      // 没有识别到内容时（如长时间静默被自动结束），保留 input 原值
      speech.reset()
      return
    }
    speech.reset()

    if (!chatStore.currentSession) {
      // 空状态：把识别文本灌进 emptyInputText，触发首次发送（自动建会话）
      const prefix = emptyInputText.value.trim()
      emptyInputText.value = prefix ? `${prefix} ${finalText}` : finalText
      await handleEmptySend()
      return
    }

    // 对话态：追加到 inputText，标记为语音来源，自动发送
    const prefix = inputText.value.trim()
    inputText.value = prefix ? `${prefix} ${finalText}` : finalText
    pendingSource.value = 'voice'
    await handleSend()
  },
)

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
  height: 100%;
  background-color: #1a1a1a;
  color: #fff;
  position: relative;
}

/* Sidebar */
.echo-sidebar {
  width: clamp(15rem, 18vw, 18rem);
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
  padding: clamp(0.75rem, 1.2vw, 1rem);
}

.new-chat-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  border-radius: 0.5rem;
  border: none;
  background: #165dff;
  color: #fff;
  font-size: clamp(0.8rem, 1vw, 0.95rem);
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
  padding: 0.5rem;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.7rem 0.85rem;
  border-radius: 0.5rem;
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
  font-size: clamp(0.8rem, 1vw, 0.95rem);
  color: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}

.session-title {
  flex: 1;
  font-size: clamp(0.8rem, 1vw, 0.95rem);
  color: rgba(255, 255, 255, 0.75);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-item--active .session-title {
  color: #fff;
}

.session-delete {
  width: clamp(1.2rem, 1.5vw, 1.5rem);
  height: clamp(1.2rem, 1.5vw, 1.5rem);
  border-radius: 0.4rem;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
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
  padding: clamp(1.25rem, 2vw, 2rem) 1rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  font-size: clamp(0.8rem, 1vw, 0.95rem);
}

/* Sidebar toggle */
.sidebar-toggle {
  position: absolute;
  left: clamp(15rem, 18vw, 18rem);
  top: 50%;
  transform: translateY(-50%);
  width: clamp(1.2rem, 1.6vw, 1.5rem);
  height: clamp(2.5rem, 3.2vw, 3rem);
  background: #333;
  border: none;
  border-radius: 0 0.4rem 0.4rem 0;
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

/* Empty state */
.chat-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(1rem, 2vw, 1.5rem);
}

.empty-content {
  text-align: center;
  max-width: 35rem;
}

.empty-title {
  font-size: clamp(1.75rem, 3.5vw, 2.6rem);
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.5rem;
  letter-spacing: 0.5em;
}

.empty-subtitle {
  font-size: clamp(0.85rem, 1.1vw, 1rem);
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 1.5rem;
}

.empty-input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  background: #333;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: clamp(1rem, 1.8vw, 1.5rem);
  padding: clamp(0.5rem, 1vw, 0.75rem) clamp(0.75rem, 1.4vw, 1rem) clamp(0.5rem, 1vw, 0.75rem) clamp(1rem, 1.8vw, 1.4rem);
  margin-bottom: 1rem;
  max-width: 45rem;
  margin-left: auto;
  margin-right: auto;
}

.empty-input-wrapper:focus-within {
  border-color: rgba(22, 93, 255, 0.5);
}

.empty-input-wrapper--recording {
  border-color: rgba(245, 63, 63, 0.5);
}

.empty-input {
  flex: 1;
}

:deep(.empty-input .el-textarea__inner) {
  background: transparent;
  border: none;
  padding: 0;
  color: rgba(255, 255, 255, 0.95);
  font-size: clamp(0.85rem, 1.1vw, 1rem);
  line-height: 1.6;
  box-shadow: none;
  resize: none;
}

:deep(.empty-input .el-textarea__inner::placeholder) {
  color: rgba(255, 255, 255, 0.35);
}

.empty-input-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.empty-mic-btn {
  width: clamp(2rem, 2.5vw, 2.4rem);
  height: clamp(2rem, 2.5vw, 2.4rem);
  border-radius: 0.6rem;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(0.9rem, 1.1vw, 1.05rem);
  transition: all 0.2s;
  margin-right: 0.4rem;
  flex-shrink: 0;
}

.empty-mic-btn:not(.empty-mic-btn--disabled):hover {
  background: rgba(22, 93, 255, 0.3);
  color: #fff;
}

.empty-mic-btn--recording {
  background: rgba(245, 63, 63, 0.25);
  color: #f56c6c;
  animation: mic-pulse 1.4s ease-in-out infinite;
}

.empty-mic-btn--recording:hover {
  background: rgba(245, 63, 63, 0.4);
}

.empty-mic-btn--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.empty-send-btn {
  width: clamp(2rem, 2.5vw, 2.4rem);
  height: clamp(2rem, 2.5vw, 2.4rem);
  border-radius: 0.6rem;
  border: none;
  background: #165dff;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(0.9rem, 1.1vw, 1.05rem);
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
  gap: 0.6rem;
  justify-content: center;
  align-items: center;
}

.quick-start-btn {
  padding: 0.5rem 0.85rem;
  border-radius: 1rem;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.5);
  font-size: clamp(0.7rem, 0.85vw, 0.8rem);
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
  padding: clamp(0.85rem, 1.8vw, 1.5rem) 0;
}

.messages-inner {
  max-width: 55rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: clamp(0.85rem, 1.8vw, 1.5rem);
}

.message-wrapper {
  display: flex;
  gap: clamp(0.6rem, 1.2vw, 1rem);
  padding: 0 clamp(0.85rem, 1.8vw, 1.5rem);
}

.message-wrapper--user {
  flex-direction: row-reverse;
}

.message-avatar {
  width: clamp(1.8rem, 2.5vw, 2.3rem);
  height: clamp(1.8rem, 2.5vw, 2.3rem);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(0.85rem, 1.05vw, 1rem);
  flex-shrink: 0;
  background: #333;
  color: rgba(255, 255, 255, 0.7);
}

.message-bubble {
  max-width: 70%;
  padding: clamp(0.6rem, 1.1vw, 0.9rem) clamp(0.85rem, 1.3vw, 1.15rem);
  border-radius: clamp(0.6rem, 1.2vw, 1rem);
  font-size: clamp(0.8rem, 1.05vw, 0.95rem);
  line-height: 1.7;
}

.message-bubble--user {
  background: #165dff;
  color: #fff;
  border-bottom-right-radius: 0.25rem;
}

.message-bubble--assistant {
  background: #2a2a2a;
  color: rgba(255, 255, 255, 0.9);
  border-bottom-left-radius: 0.25rem;
}

.message-actions {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.5rem;
  opacity: 0;
  transition: opacity 0.2s;
}

.message-wrapper:hover .message-actions {
  opacity: 1;
}

.action-btn {
  width: clamp(1.5rem, 1.9vw, 1.85rem);
  height: clamp(1.5rem, 1.9vw, 1.85rem);
  border-radius: 0.4rem;
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
  gap: 0.5rem;
  min-width: 12rem;
}

.edit-input {
  width: 100%;
}

:deep(.edit-input .el-textarea__inner) {
  background: rgba(22, 93, 255, 0.2);
  border: 1px solid rgba(22, 93, 255, 0.4);
  color: #fff;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.edit-btn {
  padding: 0.25rem 0.75rem;
  border-radius: 0.4rem;
  border: none;
  font-size: clamp(0.7rem, 0.85vw, 0.8rem);
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
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
  font-size: clamp(0.75rem, 0.95vw, 0.85rem);
  font-family: monospace;
}

.message-content :deep(pre) {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  margin: 0.5rem 0;
}

.message-content :deep(pre code) {
  background: none;
  padding: 0;
}

/* Streaming dots */
.streaming-dot {
  display: inline-block;
  width: 0.4rem;
  height: 0.4rem;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.5);
  animation: pulse 1.4s ease-in-out infinite;
  margin: 0 0.2rem;
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
  padding: clamp(0.6rem, 1.2vw, 1rem) clamp(0.85rem, 1.8vw, 1.5rem) clamp(0.85rem, 1.8vw, 1.5rem);
}

.input-wrapper {
  max-width: 55rem;
  margin: 0 auto;
  display: flex;
  align-items: flex-end;
  gap: 0.75rem;
  background: #333;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: clamp(0.6rem, 1.2vw, 1rem);
  padding: 0.6rem 0.75rem 0.6rem 1.1rem;
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
  padding: 0.4rem 0;
  color: rgba(255, 255, 255, 0.95);
  font-size: clamp(0.85rem, 1.1vw, 1rem);
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
  width: clamp(2rem, 2.5vw, 2.4rem);
  height: clamp(2rem, 2.5vw, 2.4rem);
  border-radius: 0.6rem;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(0.9rem, 1.1vw, 1.05rem);
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
  margin-top: 0.75rem;
  border-radius: 0.75rem;
  overflow: hidden;
  max-width: 28rem;
}

.chat-image {
  width: 100%;
  border-radius: 0.75rem;
}

/* ===================== 语音相关样式 ===================== */

/* 输入框左下角：录音中提示 */
.recording-hint {
  max-width: 55rem;
  margin: 0.4rem auto 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  border-radius: 0.5rem;
  background: rgba(245, 63, 63, 0.08);
  border: 1px solid rgba(245, 63, 63, 0.35);
  color: rgba(255, 255, 255, 0.85);
  font-size: clamp(0.75rem, 0.95vw, 0.85rem);
  overflow: hidden;
}

/* 空状态下的录音提示：紧贴输入框下方，宽度跟随 .empty-input-wrapper */
.recording-hint--empty {
  max-width: 45rem;
  margin: 0.5rem auto 0.75rem;
}

.recording-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  background: #f56c6c;
  flex-shrink: 0;
  animation: pulse 1.2s ease-in-out infinite;
}

.recording-label {
  color: #f56c6c;
  font-weight: 500;
  flex-shrink: 0;
}

.recording-interim {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.75);
}

.recording-interim--placeholder {
  color: rgba(255, 255, 255, 0.35);
  font-style: italic;
}

.recording-abort-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-left: auto;
  flex-shrink: 0;
  padding: 0.25rem 0.6rem;
  border-radius: 0.4rem;
  border: 1px solid rgba(245, 63, 63, 0.45);
  background: rgba(245, 63, 63, 0.12);
  color: #ffb3b3;
  font-size: clamp(0.7rem, 0.85vw, 0.8rem);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.recording-abort-btn:hover {
  background: rgba(245, 63, 63, 0.25);
  border-color: rgba(245, 63, 63, 0.7);
  color: #fff;
}

.recording-abort-btn .el-icon {
  font-size: 0.95rem;
}

.input-wrapper--recording {
  border-color: rgba(245, 63, 63, 0.5);
}

/* 麦克风按钮 */
.mic-btn {
  width: clamp(2rem, 2.5vw, 2.4rem);
  height: clamp(2rem, 2.5vw, 2.4rem);
  border-radius: 0.6rem;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: clamp(0.9rem, 1.1vw, 1.05rem);
  transition: all 0.2s;
  margin-right: 0.4rem;
  flex-shrink: 0;
}

.mic-btn:not(.mic-btn--disabled):not(:disabled):hover {
  background: rgba(22, 93, 255, 0.3);
  color: #fff;
}

.mic-btn--recording {
  background: rgba(245, 63, 63, 0.25);
  color: #f56c6c;
  animation: mic-pulse 1.4s ease-in-out infinite;
}

.mic-btn--recording:hover {
  background: rgba(245, 63, 63, 0.4);
}

.mic-btn--disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.mic-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@keyframes mic-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(245, 63, 63, 0.55);
  }
  50% {
    box-shadow: 0 0 0 0.5rem rgba(245, 63, 63, 0);
  }
}

/* 用户消息内的语音块：播报按钮 + 文本框 */
.voice-block {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.5rem;
  min-width: 12rem;
  max-width: 100%;
}

.voice-block__header {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: clamp(0.7rem, 0.85vw, 0.78rem);
  color: rgba(255, 255, 255, 0.75);
  opacity: 0.85;
}

.voice-block__icon {
  font-size: 0.9rem;
}

.voice-block__label {
  font-weight: 500;
  letter-spacing: 0.02em;
}

.voice-play-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.85rem;
  border-radius: 0.5rem;
  border: 1px solid rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: clamp(0.75rem, 0.9vw, 0.85rem);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.voice-play-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.55);
}

.voice-play-btn--playing {
  background: rgba(245, 63, 63, 0.25);
  border-color: rgba(245, 63, 63, 0.55);
  color: #ffd5d5;
}

.voice-play-btn--playing:hover {
  background: rgba(245, 63, 63, 0.35);
}

.voice-text-box {
  width: 100%;
  min-width: 12rem;
  max-width: 28rem;
  padding: 0.5rem 0.7rem;
  border-radius: 0.4rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.92);
  font-size: clamp(0.8rem, 1vw, 0.92rem);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
}
</style>