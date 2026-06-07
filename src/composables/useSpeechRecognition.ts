/**
 * 语音识别 Composable（连续模式 + VAD 断句）
 * 封装浏览器原生 Web Speech API（SpeechRecognition）。
 *
 * 设计要点：
 *  - 自动适配 webkit / 标准前缀
 *  - 默认中文（zh-CN），continuous + interimResults，便于实时回显
 *  - 【连续模式】单次 start() 不会因为短暂静默就结束；
 *    浏览器在静默 ~1s 后会自动触发 onend，监听器在 onend 里立即
 *    重新拉起下一个识别实例，实现"长按听写"行为。
 *  - 【VAD 断句】维护"最后一次有效识别时间"，超过 silenceTimeoutMs
 *    视为用户说完一句，立即回调 onSentence(currentText)，但识别器
 *    不会停——继续监听下一句。同一个会话内可以连续吐多句。
 *  - 显式调用 stop() / abort() 才会彻底结束。
 *  - 所有异常 / 状态变化都通过 console 打点，便于排查。
 */

import { onBeforeUnmount, ref, type Ref } from 'vue'

/** 浏览器原生 SpeechRecognition 兼容类型（带 webkit 前缀） */
type SpeechRecognitionInstance = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

/** result 事件最小字段（不直接依赖 lib.dom 里的完整类型，避免版本飘移） */
interface SpeechRecognitionResultEvent {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    0: { transcript: string; confidence: number }
  }>
}

/** error 事件最小字段 */
interface SpeechRecognitionErrorEvent {
  error: string
  message?: string
}

/** 取浏览器实现（标准 > webkit 前缀） */
function getRecognitionConstructor(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export interface UseSpeechRecognitionOptions {
  /** 识别语言，默认 zh-CN */
  lang?: string
  /** 是否持续识别（true 时会在 onend 后自动重启，直到显式 stop） */
  continuous?: boolean
  /** 是否返回中间结果，默认 true */
  interimResults?: boolean
  /**
   * 静默超过多少毫秒视为本句结束（VAD 断句）。
   * 仅在 continuous=true 时生效。
   * 默认 1200ms。
   */
  silenceTimeoutMs?: number
  /**
   * 断句回调：拿到一整句 finalText 后触发。
   * 触发后内部会自动清空已敲定文本，开始听下一句。
   * 多次触发可累积成多句话。
   */
  onSentence?: (finalText: string) => void
  /**
   * 识别彻底结束回调（用户主动 stop / abort）。
   * 收到这个回调时本轮听写结束，不会再自动重启。
   */
  onEnd?: () => void
  /**
   * 识别出错回调。
   * 'no-speech' / 'aborted' 等常见错误已内置成静默处理，
   * 只对真正异常的情况提示。
   */
  onError?: (message: string) => void
}

export interface UseSpeechRecognitionReturn {
  /** 当前是否在听写中（含重启间隙的短暂空档） */
  isListening: Ref<boolean>
  /** 正在"敲定"中的句子（最近一次断句后清空） */
  currentSentence: Ref<string>
  /** 实时中间结果（未敲定，会随识别更新） */
  interimTranscript: Ref<string>
  /** 最近的错误码（字符串） */
  error: Ref<string | null>
  /** 浏览器是否支持 Web Speech API */
  isSupported: Ref<boolean>
  /** 开始连续听写 */
  start: () => void
  /** 主动结束听写（彻底结束，不会再重启） */
  stop: () => void
  /** 立即中止（不等待结果） */
  abort: () => void
  /** 清空当前已收集的句子与错误（不清 isListening） */
  reset: () => void
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionReturn {
  const {
    lang = 'zh-CN',
    continuous = true,
    interimResults = true,
    silenceTimeoutMs = 1200,
    onSentence,
    onEnd,
    onError,
  } = options

  const Ctor = getRecognitionConstructor()
  const isSupported = ref(Ctor !== null)
  const isListening = ref(false)
  const currentSentence = ref('')
  const interimTranscript = ref('')
  const error = ref<string | null>(null)

  let recognition: SpeechRecognitionInstance | null = null
  /** 用 ref 之外的"实例字段"避免响应式化（性能/可读性更好） */
  const callbacks = { onSentence, onEnd, onError }

  /** 上一次拿到任何识别结果的时刻（VAD 用） */
  let lastSpeechAt = 0
  /** 静默检测定时器句柄 */
  let silenceTimer: ReturnType<typeof setTimeout> | null = null
  /** 用户是否已请求彻底结束（区分"自然 onend"与"主动 stop"） */
  let userStopped = false
  /**
   * 静默超时回调已经被排队但还没执行；此时用户说了新内容就清掉。
   * 用 flag 而不是直接清 timer，方便在 onresult 里判断"刚提交过"。
   */
  let sentenceCommitted = false

  function clearSilenceTimer() {
    if (silenceTimer) {
      clearTimeout(silenceTimer)
      silenceTimer = null
    }
  }

  /**
   * 把当前已敲定 + 中间结果合并成一个句子，触发 onSentence 回调，
   * 并清空本句缓存，开始听下一句。
   */
  function commitCurrentSentence() {
    if (sentenceCommitted) return
    const finalText = (currentSentence.value + interimTranscript.value)
      .replace(/\s+/g, ' ')
      .trim()
    sentenceCommitted = true
    currentSentence.value = ''
    interimTranscript.value = ''
    clearSilenceTimer()
    if (finalText) {
      console.info('[speech] sentence committed, length=%d', finalText.length)
      callbacks.onSentence?.(finalText)
    }
    // 下一次 onresult 进来时再重置 flag，允许再次断句
    setTimeout(() => {
      sentenceCommitted = false
    }, 0)
  }

  function armSilenceTimer() {
    if (!continuous) return
    clearSilenceTimer()
    silenceTimer = setTimeout(() => {
      silenceTimer = null
      // 到了静默阈值：把当前已敲定部分（不算中间结果）作为一句提交。
      // 不把中间结果合并进来，是因为中间结果不稳定，可能导致同一段话被说两遍。
      const finalized = currentSentence.value.trim()
      if (finalized) commitCurrentSentence()
    }, silenceTimeoutMs)
  }

  function buildInstance(): SpeechRecognitionInstance | null {
    if (!Ctor) return null
    const inst = new Ctor()
    inst.lang = lang
    inst.continuous = continuous
    inst.interimResults = interimResults
    inst.maxAlternatives = 1

    inst.onstart = () => {
      isListening.value = true
      error.value = null
      lastSpeechAt = Date.now()
      armSilenceTimer()
      console.info('[speech] recognition started, lang=%s', lang)
    }

    inst.onresult = (event) => {
      lastSpeechAt = Date.now()
      let finalChunk = ''
      let interimChunk = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) {
          finalChunk += text
        } else {
          interimChunk += text
        }
      }
      if (finalChunk) {
        currentSentence.value = (currentSentence.value + finalChunk).trimStart()
      }
      interimTranscript.value = interimChunk
      // 拿到新结果，重新计时静默
      armSilenceTimer()
    }

    inst.onerror = (event) => {
      error.value = event.error
      console.warn('[speech] recognition error: %s', event.error, event.message ?? '')
      // no-speech 在 continuous 模式下很常见（用户闭嘴），不当作错误弹窗
      callbacks.onError?.(event.error)
    }

    inst.onend = () => {
      // 浏览器在静默一段时间后会自动结束识别。
      // continuous=true 时我们要在这里立即重启，保持长听写。
      if (continuous && !userStopped) {
        // 防止同一 onend 被多次处理（极端情况：start() 里抛错后浏览器又触发一次）
        if (recognition !== inst) return
        console.info('[speech] auto-restart (continuous mode)')
        // 关键：先把 isListening 置为 false，
        // 否则 start() 里的"已在听写"检查会直接 return，新的实例就建不起来 —— 这是修复的核心。
        isListening.value = false
        // 旧实例已废弃，引用清空避免 stop() 误操作到它
        recognition = null
        // 提交残余文本（如果有），并清理旧的 silence timer / 文本缓存
        // —— 避免在跨实例时把旧句子的尾巴接到新句子上
        commitCurrentSentence()
        try {
          start()
        } catch (err) {
          console.warn('[speech] auto-restart failed:', err)
        }
        return
      }
      // 真正结束（用户主动 stop / abort）
      clearSilenceTimer()
      isListening.value = false
      // 把残余的一句也提交出去，避免丢字
      commitCurrentSentence()
      console.info('[speech] recognition ended (user stop)')
      callbacks.onEnd?.()
    }

    return inst
  }

  function start() {
    if (!Ctor) {
      const msg = '当前浏览器不支持 Web Speech API'
      error.value = 'unsupported'
      console.warn('[speech] %s', msg)
      callbacks.onError?.(msg)
      return
    }
    if (isListening.value) {
      console.info('[speech] start ignored, already listening')
      return
    }
    userStopped = false
    sentenceCommitted = false
    recognition = buildInstance()
    try {
      recognition?.start()
    } catch (err) {
      // 极少数情况下同步抛错（如 start 紧跟 stop），吞掉并记录
      console.warn('[speech] start threw synchronously:', err)
    }
  }

  function stop() {
    userStopped = true
    clearSilenceTimer()
    if (!recognition) {
      isListening.value = false
      return
    }
    try {
      recognition.stop()
    } catch (err) {
      console.warn('[speech] stop failed:', err)
    }
  }

  function abort() {
    userStopped = true
    clearSilenceTimer()
    if (!recognition) {
      isListening.value = false
      return
    }
    try {
      recognition.abort()
    } catch (err) {
      console.warn('[speech] abort failed:', err)
    }
    // 主动放弃：清空已收集的文本，避免 watch 把"说错的部分"当成正常结果自动发送
    currentSentence.value = ''
    interimTranscript.value = ''
  }

  function reset() {
    currentSentence.value = ''
    interimTranscript.value = ''
    error.value = null
  }

  onBeforeUnmount(() => {
    userStopped = true
    clearSilenceTimer()
    if (recognition) {
      try {
        recognition.abort()
      } catch {
        /* ignore */
      }
      recognition = null
    }
  })

  return {
    isListening,
    currentSentence,
    interimTranscript,
    error,
    isSupported,
    start,
    stop,
    abort,
    reset,
  }
}
