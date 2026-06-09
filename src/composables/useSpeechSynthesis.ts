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

/** 选一个匹配 lang 的语音；找不到则返回 null，让浏览器走默认音色。
 *
 * 评分规则（高分优先）：
 *  - 语言精确匹配（zh-CN === zh-CN）：+50；仅同前缀（zh === zh-CN）：+20；完全不匹配：直接淘汰
 *  - 神经/在线/自然合成（Natural / Neural / Online / Premium / WaveNet / Enhanced）：+100
 *    这是声音"不机器感"的最大来源
 *  - 顶级甜美少女音名单（Microsoft Xiaoxiao / Xiaoyi / Xiaomeng / Xiaohan / Xiaozhen…）：+120
 *  - 经典 Windows / macOS 女声（Yaoyao / Huihui / Tracy / Tingting / Sinji / Hanhan / Mei-Jia）：+60
 *  - 通用女性关键词（female / woman / girl / "女"）：+50
 *  - Google 中文音色（Chrome 自带，多为女声）：+70
 *  - 男声黑名单（Yun* / Kangkang / male / man / boy / "男"）：-200
 *  - 老旧合成器（eSpeak / Flite / Pico）：-80
 */
function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null

  let best: SpeechSynthesisVoice | null = null
  let bestScore = -Infinity
  for (const v of voices) {
    const s = scoreVoice(v, lang)
    if (s > bestScore) {
      best = v
      bestScore = s
    }
  }

  if (best) {
    console.info('[tts] picked voice: "%s" lang=%s score=%d', best.name, best.lang, bestScore)
  } else {
    console.warn('[tts] no voice matched lang=%s, fallback to default', lang)
  }
  return best
}

/** 评分一个候选语音；返回 -Infinity 表示完全不可用（语言不匹配）。 */
function scoreVoice(v: SpeechSynthesisVoice, lang: string): number {
  const name = (v.name ?? '').toLowerCase()
  const voiceLang = (v.lang ?? '').toLowerCase()
  const targetLang = lang.toLowerCase()
  const targetPrefix = targetLang.split('-')[0]

  // 语言必须至少前缀匹配，否则直接淘汰
  if (voiceLang !== targetLang && !voiceLang.startsWith(targetPrefix)) {
    return -Infinity
  }

  let score = voiceLang === targetLang ? 50 : 20

  // 神经合成 / 自然语音：去机器感的关键
  if (/(natural|neural|online|premium|enhanced|wavenet)/.test(name)) score += 100

  // 顶级甜美少女音（Microsoft Edge 神经合成的年轻女声序列）
  // Xiaoxiao 是国内主流"甜美少女音"代表；Xiaoyi 略青春；Xiaomeng/Xiaohan/Xiaozhen 偏温柔
  if (/(xiaoxiao|xiaoyi|xiaomeng|xiaohan|xiaozhen|xiaoxuan|xiaomo|xiaochen)/.test(name)) {
    score += 120
  }

  // 经典 Windows / macOS / iOS 中文女声（Natural 不可用时的次优解）
  if (/(yaoyao|huihui|tracy|tingting|sinji|hanhan|mei-?jia)/.test(name)) score += 60

  // Google Chrome 自带中文音色（普通话/中文，通常是女声）
  if (name.startsWith('google') && voiceLang.startsWith('zh')) score += 70

  // 通用女性关键词（用 \b 边界避免把 "female" 中的 "male" 错认为男）
  if (/\b(female|woman|girl)\b/.test(name) || name.includes('女')) score += 50

  // 明确男声：Yun* 是 Microsoft 男性序列、Kangkang 是经典 Windows 男声
  if (/(yunxi|yunyang|yunjian|yunxia|yunfeng|yunhao|kangkang)/.test(name)) score -= 200
  if (/\b(male|man|boy)\b/.test(name) || name.includes('男')) score -= 200

  // 老旧 / 开源合成器（机器感最重）
  if (/(espeak|flite|pico)/.test(name)) score -= 80

  return score
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
