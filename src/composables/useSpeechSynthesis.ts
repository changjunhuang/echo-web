/**
 * 语音播报 Composable
 * 封装浏览器原生 Web Speech API（speechSynthesis），
 * 用于把后端返回的文本 / 用户自己说过的话"读"出来。
 *
 * 设计要点：
 *  - 自动选择中文语音（zh-CN）优先；浏览器加载异步，必要时回退到默认语音
 *  - 暴露 isSpeaking 响应式状态，方便按钮态切换
 *  - 切换文本前先 cancel 上一段，避免排队
 *  - 提供 onStart / onEnd 回调，组件侧可以同步"正在播报的是哪条消息"
 *  - unmount 时自动 cancel，避免在已卸载的页面继续朗读
 */

import { onBeforeUnmount, ref, type Ref } from 'vue'

export interface UseSpeechSynthesisOptions {
  /** 播报语言，默认 zh-CN */
  lang?: string
  /** 语速，默认 1 */
  rate?: number
  /** 音调，默认 1 */
  pitch?: number
  /** 音量，默认 1 */
  volume?: number
  /** 开始朗读回调 */
  onStart?: () => void
  /** 朗读结束回调（成功 / 主动 cancel 都算） */
  onEnd?: () => void
  /** 朗读出错回调（interrupted / canceled 不算错误） */
  onError?: (message: string) => void
}

export interface UseSpeechSynthesisReturn {
  /** 是否正在朗读 */
  isSpeaking: Ref<boolean>
  /** 朗读指定文本；若正在朗读会先取消上一段 */
  speak: (text: string) => void
  /** 停止朗读 */
  stop: () => void
  /** 浏览器是否支持 speechSynthesis */
  isSupported: Ref<boolean>
}

/** 选一个匹配 lang 的语音；找不到则用 voices[0] */
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  const exact = voices.find((v) => v.lang?.toLowerCase() === lang.toLowerCase())
  if (exact) return exact
  const prefix = voices.find((v) => v.lang?.toLowerCase().startsWith(lang.split('-')[0].toLowerCase()))
  return prefix ?? voices[0] ?? null
}

export function useSpeechSynthesis(options: UseSpeechSynthesisOptions = {}): UseSpeechSynthesisReturn {
  const { lang = 'zh-CN', rate = 1, pitch = 1, volume = 1, onStart, onEnd, onError } = options
  const callbacks = { onStart, onEnd, onError }

  const isSupported = ref(
    typeof window !== 'undefined' && 'speechSynthesis' in window,
  )
  const isSpeaking = ref(false)

  function speak(text: string) {
    const trimmed = text?.trim()
    if (!isSupported.value || !trimmed) return
    // 先停掉上一次，避免多个 utterance 串台
    try {
      window.speechSynthesis.cancel()
    } catch {
      /* ignore */
    }

    const utter = new SpeechSynthesisUtterance(trimmed)
    utter.lang = lang
    utter.rate = rate
    utter.pitch = pitch
    utter.volume = volume
    const voice = pickVoice(lang)
    if (voice) utter.voice = voice

    utter.onstart = () => {
      isSpeaking.value = true
      console.info('[tts] speak started, length=%d', trimmed.length)
      callbacks.onStart?.()
    }
    utter.onend = () => {
      isSpeaking.value = false
      console.info('[tts] speak ended')
      callbacks.onEnd?.()
    }
    utter.onerror = (event) => {
      isSpeaking.value = false
      // 'interrupted' / 'canceled' 是我们主动 stop 触发的，不当作错误
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        console.warn('[tts] speak error: %s', event.error)
        callbacks.onError?.(event.error)
      } else {
        // 主动打断也通知一次 onEnd，让上层可以继续后续动作（如恢复录音）
        callbacks.onEnd?.()
      }
    }

    try {
      window.speechSynthesis.speak(utter)
    } catch (err) {
      isSpeaking.value = false
      console.warn('[tts] speak threw synchronously:', err)
    }
  }

  function stop() {
    if (!isSupported.value) return
    try {
      window.speechSynthesis.cancel()
    } catch (err) {
      console.warn('[tts] stop failed:', err)
    }
    // cancel 之后 onerror 才会触发，把 isSpeaking 拉回 false
    // 但某些浏览器 cancel 不会触发任何回调，所以这里再保险设一次
    isSpeaking.value = false
  }

  onBeforeUnmount(() => {
    stop()
  })

  return { isSpeaking, speak, stop, isSupported }
}
