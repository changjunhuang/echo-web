/**
 * 规范化资源 URL。
 *
 * 背景：后端下发的 `file.url` 字段（如七牛云 CDN 地址）经常缺协议头，
 * 例如 `tixapmuo5.hn-bkt.clouddn.com/default/xxx.jpg`。
 * 浏览器会把这种 URL 当成相对路径，导致 `<img>` / `<video>` / `<audio>`
 * 加载失败，`fetch()` 也无法跨域请求。
 *
 * 策略：用「协议无关 URL」(`//host/path`) 兜底 —— 浏览器会自动选用
 * 当前页面的协议。
 *  - HTTP 页面 → 解析为 `http://...`，避免某些 CDN 的 HTTPS 证书
 *    配置不全（实测七牛 `*.clouddn.com` 子域 HTTPS 证书不匹配，但
 *    HTTP 正常返回 200）而走不通
 *  - HTTPS 页面 → 解析为 `https://...`，同源策略最稳
 *
 * 注：若部署在 HTTPS 页面但资源站不支持 HTTPS，会被浏览器按
 * 「混合内容」拦截 — 这是后端该修的问题（配置合法 HTTPS 证书
 * 或反向代理），不是前端能兜住的。
 */
export function normalizeAssetUrl(url: string | undefined | null): string {
  if (!url) return ''
  const trimmed = url.trim()
  if (!trimmed) return ''
  // 已有协议（http/https/ftp/...）直接放行
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed
  // data: / blob: 也放过（虽然不太可能出现）
  if (/^(data|blob):/i.test(trimmed)) return trimmed
  // 协议无关 URL：让浏览器跟随页面协议
  return `//${trimmed}`
}