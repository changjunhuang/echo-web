/**
 * 浏览器侧下载工具：URL → 触发浏览器下载。
 *
 * 统一聊天附件、记忆管理、记忆主题查看三条下载链路的核心逻辑：
 *   1. fetch(url, { mode: 'cors' })  → 成功 → blob → <a download> 触发原生下载
 *   2. 任意失败（CORS / DNS / 非 2xx / 抛错）→ 降级为 <a href=url target=_blank>
 *
 * 设计要点：
 *   - mode: 'cors' 让浏览器优先走 CORS 预检，CDN 配了正确的 CORS 头就能直接拉
 *   - 兜底锚点不抛错：浏览器在 target=_blank 下能渲染就渲染、不能就提示用户
 *   - 延迟 revokeObjectURL(1000ms)：给浏览器时间真正发起下载请求
 *   - 不在内部弹 toast / ElMessage，由调用方按场景反馈（避免抽象成"什么都管"）
 *   - 不抛错给调用方（兜底已经走 anchor），调用方按返回值判断即可
 *
 * 调用方负责 resolveUrl() 拼协议头 —— 本工具不做 URL 处理，专注下载触发。
 */

/**
 * 触发浏览器下载的统一入口。
 *
 * @param url        已规范化的资源 URL（调用方应先调 resolveUrl）
 * @param filename   用户期望保存的文件名
 * @returns          'blob'    = 走 blob 路径成功下载
 *                   'fallback' = 走 anchor 兜底（浏览器新窗口打开）
 *                   'noop'    = url 为空，什么也没做
 */
export async function downloadAsset(
  url: string,
  filename: string,
): Promise<'blob' | 'fallback' | 'noop'> {
  if (!url) return 'noop'

  // 主路径：fetch → blob → <a download>
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (res.ok) {
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // 给浏览器一点时间真正发出请求再回收 URL
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      return 'blob'
    }
    console.warn('[downloadAsset] fetch returned %d, fallback to anchor: name=%s', res.status, filename)
  } catch (err) {
    console.warn(
      '[downloadAsset] fetch failed (likely CORS), fallback to anchor: name=%s, err=%s',
      filename,
      (err as Error)?.message ?? String(err),
    )
  }

  // 兜底路径：直接挂锚点让浏览器处理（多数情况下会打开新标签；如服务端允许
  // Content-Disposition 则仍可能触发下载）
  const a = document.createElement('a')
  a.href = url
  // 仅当 URL 是绝对 http/https 时才设 download：协议相对 / 其它 scheme 下
  // 浏览器会忽略 a.download 并直接打开
  if (/^https?:\/\//i.test(url)) a.download = filename
  a.rel = 'noopener noreferrer'
  a.target = '_blank'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  return 'fallback'
}