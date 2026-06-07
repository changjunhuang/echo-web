/**
 * 语音播报 Composable
 * 封装浏览器原生 Web Speech API（speechSynthesis），
 * 用于把已识别的文本再"读"出来，模拟回放用户说过的话。
 *
 * 设计要点：
 *  - 自动选择中文语音（zh-CN）优先；浏览器加载异步，必要时回退到默认语音
 *  - 暴露 isSpeaking 响应式状态，方便按钮态切换
 *  - 切换文本前先 cancel 上一段，避免排队
 *  - unmount 时自动 cancel，避免在已卸载的页面继续朗读
 */

import { onBeforeUnmount, ref, type Ref } from 'vue'

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

export function useSpeechSynthesis(lang = 'zh-CN'): UseSpeechSynthesisReturn {
  const isSupported = ref(
    typeof window !== 'undefined' && 'speechSynthesis' in window,
  )
  const isSpeaking = ref(false)

  function speak(text: string) {
    const trimmed = text?.trim()
    if (!isSupported.value || !trimmed) return
    // 先停掉上一次，避免多个 utterance 串台
    window.speechSynthesis.cancel()

    const utter = new SpeechSynthesisUtterance(trimmed)
    utter.lang = lang
    const voice = pickVoice(lang)
    if (voice) utter.voice = voice
    utter.rate = 1
    utter.pitch = 1
    utter.volume = 1

    utter.onstart = () => {
      isSpeaking.value = true
      console.info('[tts] speak started, length=%d', trimmed.length)
    }
    utter.onend = () => {
      isSpeaking.value = false
      console.info('[tts] speak ended')
    }
    utter.onerror = (event) => {
      isSpeaking.value = false
      // 'interrupted' / 'canceled' 是我们主动 stop 触发的，不当作错误
      if (event.error !== 'interrupted' && event.error !== 'canceled') {
        console.warn('[tts] speak error: %s', event.error)
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
    isSpeaking.value = false
  }

  onBeforeUnmount(() => {
    stop()
  })

  return { isSpeaking, speak, stop, isSupported }
}
