/**
 * 复制文本到剪贴板。
 *
 * 兼容处理：
 *  - 优先用 navigator.clipboard（要求 secure context：HTTPS / localhost）
 *  - 兜底用隐藏 textarea + execCommand('copy')，兼容 HTTP / 老浏览器
 *
 * 反馈：成功/失败/空文本都用 ElMessage 弹提示，让用户知道是否复制成功。
 *
 * @param text 要复制的文本
 * @param label 文本的语义标签，用于提示文案（如"主观描述"、"记忆内容"）
 * @returns 是否复制成功
 */
import { ElMessage } from 'element-plus'

export async function copyToClipboard(text: string, label: string): Promise<boolean> {
  if (!text) {
    ElMessage.warning(`${label}为空，无可复制内容`)
    return false
  }
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      // 非安全上下文（HTTP / 老浏览器）的兜底：用 textarea + execCommand
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      ta.style.pointerEvents = 'none'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    ElMessage.success(`已复制${label}`)
    return true
  } catch {
    ElMessage.error('复制失败，请手动选择复制')
    return false
  }
}