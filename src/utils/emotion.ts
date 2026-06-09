/**
 * 情绪识别工具
 * 根据文本内容判断情绪倾向，用于驱动像素人物的动作切换。
 *
 * 设计原则：
 *  - 前端兜底：若后端未返回情绪字段，前端可基于关键词自检
 *  - 多分类：兴奋 / 高兴 / 悲伤 / 生气 / 平静 五类（满足需求中的"兴奋""低落"等）
 *  - 关键词优先匹配长串，避免短词误命中
 */

export type Emotion = 'excited' | 'happy' | 'sad' | 'angry' | 'neutral'

/** 情绪分类关键词（按优先级倒序匹配，长串在前） */
const KEYWORDS: ReadonlyArray<{ emotion: Emotion; patterns: string[] }> = [
  {
    emotion: 'excited',
    patterns: ['太棒了', '太好了', 'amazing', 'awesome', '太赞了', 'amazing!', 'wow', '哇', '不可思议', '惊喜', '开森', '超棒', '绝了', '牛逼', '666'],
  },
  {
    emotion: 'happy',
    patterns: ['开心', '高兴', '快乐', '哈哈', '嘿嘿', '嘻嘻', '好耶', 'yeah', 'nice', '不错', '可以的', '喜欢', '感谢', '谢谢', 'love', 'happy'],
  },
  {
    emotion: 'sad',
    patterns: ['难过', '伤心', '悲伤', '哭', '眼泪', '遗憾', '失望', '沮丧', '不开心', '忧郁', 'sad', 'sorry', '遗憾', '心疼', '可惜', '唉'],
  },
  {
    emotion: 'angry',
    patterns: ['生气', '愤怒', '气死', '讨厌', '烦死', '受不了', '愤怒', 'angry', 'mad', '无语', '滚'],
  },
]

/** 兜底：纯标点（"!"、"～"）也暗示兴奋 */
function isExcitedPunctuation(text: string): boolean {
  const matches = text.match(/[!！~～]+/g) ?? []
  return matches.some((m) => m.length >= 2)
}

/**
 * 分析文本情绪
 * @param text 输入文本
 * @returns 识别到的情绪
 */
export function detectEmotion(text: string): Emotion {
  if (!text) return 'neutral'
  const lower = text.toLowerCase()
  for (const { emotion, patterns } of KEYWORDS) {
    for (const pattern of patterns) {
      if (lower.includes(pattern.toLowerCase())) {
        return emotion
      }
    }
  }
  if (isExcitedPunctuation(text)) return 'excited'
  return 'neutral'
}

/** 情绪对应的中文标签 */
export const EMOTION_LABELS: Readonly<Record<Emotion, string>> = {
  excited: '兴奋',
  happy: '开心',
  sad: '低落',
  angry: '生气',
  neutral: '平静',
}
