/**
 * 语音识别 Composable
 * 封装浏览器原生 Web Speech API（SpeechRecognition），
 * 暴露响应式状态与启停方法。
 *
 * 设计要点：
 *  - 自动适配 webkit / 标准前缀
 *  - 默认中文（zh-CN），continuous + interimResults，便于实时回显
 *  - 内部使用 ref 维护状态，组件 unmount 时自动停止
 *  - 所有异常 / 状态变化都通过 console 打点，便于排查
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
  /** 是否持续识别（到静默后自动结束），默认 true */
  continuous?: boolean
  /** 是否返回中间结果，默认 true */
  interimResults?: boolean
  /** 识别结束回调（含异常结束） */
  onEnd?: (finalText: string) => void
  /** 识别出错回调 */
  onError?: (message: string) => void
}

export interface UseSpeechRecognitionReturn {
  /** 当前是否在听写中 */
  isListening: Ref<boolean>
  /** 已经"敲定"的最终文本（多次追加） */
  transcript: Ref<string>
  /** 实时中间结果（未敲定，会随识别更新） */
  interimTranscript: Ref<string>
  /** 最近的错误码（字符串） */
  error: Ref<string | null>
  /** 浏览器是否支持 Web Speech API */
  isSupported: Ref<boolean>
  /** 开始听写；若已在听写中则忽略 */
  start: () => void
  /** 主动结束听写（会等待浏览器触发 onend） */
  stop: () => void
  /** 立即中止（不等待结果） */
  abort: () => void
  /** 清空所有已收集的文本与错误 */
  reset: () => void
}

export function useSpeechRecognition(
  options: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionReturn {
  const {
    lang = 'zh-CN',
    continuous = true,
    interimResults = true,
    onEnd,
    onError,
  } = options

  const Ctor = getRecognitionConstructor()
  const isSupported = ref(Ctor !== null)
  const isListening = ref(false)
  const transcript = ref('')
  const interimTranscript = ref('')
  const error = ref<string | null>(null)

  let recognition: SpeechRecognitionInstance | null = null
  /** 用 ref 之外的"实例字段"避免响应式化（性能/可读性更好） */
  const callbacks = { onEnd, onError }

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
      console.info('[speech] recognition started, lang=%s', lang)
    }

    inst.onresult = (event) => {
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
        transcript.value = (transcript.value + finalChunk).trimStart()
      }
      interimTranscript.value = interimChunk
    }

    inst.onerror = (event) => {
      error.value = event.error
      console.warn('[speech] recognition error: %s', event.error, event.message ?? '')
      callbacks.onError?.(event.error)
    }

    inst.onend = () => {
      const finalText = (transcript.value + interimTranscript.value).trim()
      isListening.value = false
      interimTranscript.value = ''
      console.info('[speech] recognition ended, final length=%d', finalText.length)
      callbacks.onEnd?.(finalText)
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
    // 每次都重建实例：旧实例在 onend 后浏览器会把它标记为已结束，无法再次 start
    recognition = buildInstance()
    try {
      recognition?.start()
    } catch (err) {
      // 极少数情况下同步抛错（如 start 紧跟 stop），吞掉并记录
      console.warn('[speech] start threw synchronously:', err)
    }
  }

  function stop() {
    if (!recognition) return
    try {
      recognition.stop()
    } catch (err) {
      console.warn('[speech] stop failed:', err)
    }
  }

  function abort() {
    if (!recognition) return
    try {
      recognition.abort()
    } catch (err) {
      console.warn('[speech] abort failed:', err)
    }
    // 主动放弃：清空已收集的文本，避免 watch 把"说错的部分"当成正常结果自动发送
    transcript.value = ''
    interimTranscript.value = ''
  }

  function reset() {
    transcript.value = ''
    interimTranscript.value = ''
    error.value = null
  }

  onBeforeUnmount(() => {
    abort()
  })

  return {
    isListening,
    transcript,
    interimTranscript,
    error,
    isSupported,
    start,
    stop,
    abort,
    reset,
  }
}
