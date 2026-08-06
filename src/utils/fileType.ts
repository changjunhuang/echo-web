// fileType 工具：与后端约定一致（1文本 2图片 3视频 4音频）
//
// 背景：编辑记忆弹窗把已有源文件用 `new File([], fileName)` 占位（type=""），
// 保存时按 File.type 重新推导 fileType，导致 video(3) 被退化成 text(1)。
// 解决：
//   1) PendingFile 自带显式 fileType 字段，由"File.type 优先 / 扩展名兜底"算一次后写入；
//   2) 加载已有源文件时直接用详情接口返回的 fileType，不再二次推导。

export type FileTypeNum = 1 | 2 | 3 | 4

const EXT_TO_FILE_TYPE: Record<string, FileTypeNum> = {
  // video
  mp4: 3, mov: 3, m4v: 3, mkv: 3, webm: 3, avi: 3, flv: 3, wmv: 3, '3gp': 3,
  // image
  jpg: 2, jpeg: 2, png: 2, gif: 2, webp: 2, bmp: 2, heic: 2, heif: 2, tiff: 2, tif: 2,
  // audio
  mp3: 4, wav: 4, m4a: 4, aac: 4, flac: 4, ogg: 4, opus: 4, wma: 4, amr: 4,
  // text / document
  txt: 1, md: 1, markdown: 1, log: 1, csv: 1, json: 1, xml: 1, html: 1, htm: 1, yaml: 1, yml: 1,
}

/** 从 MIME 推断 fileType，未命中返回 null。 */
export function fileTypeFromMime(mime: string | undefined | null): FileTypeNum | null {
  if (!mime) return null
  const m = mime.toLowerCase()
  if (m.startsWith('image/')) return 2
  if (m.startsWith('video/')) return 3
  if (m.startsWith('audio/')) return 4
  if (m.startsWith('text/') || m === 'application/json' || m === 'application/xml') return 1
  return null
}

/** 从文件名（扩展名）推断 fileType，未命中返回 null。 */
export function fileTypeFromName(name: string | undefined | null): FileTypeNum | null {
  if (!name) return null
  const dot = name.lastIndexOf('.')
  if (dot < 0 || dot === name.length - 1) return null
  const ext = name.slice(dot + 1).toLowerCase()
  return EXT_TO_FILE_TYPE[ext] ?? null
}

/**
 * 权威 fileType 解析：MIME > 扩展名。两者冲突时按 MIME 优先（浏览器能识别 MIME
 * 就以 MIME 为准，避免用户把 mp4 改后缀成 .txt 时被文本解析）。
 * 解析结果应直接落库 / 透传，不在保存前再二次推导。
 */
export function resolveFileType(opts: {
  fileName?: string | null
  mimeType?: string | null
  declared?: number | null
}): FileTypeNum {
  const fromMime = fileTypeFromMime(opts.mimeType)
  if (fromMime) return fromMime
  const fromExt = fileTypeFromName(opts.fileName)
  if (fromExt) return fromExt
  // 兜底：尊重上游声明的合法值（用于编辑场景，从详情接口读出来的 fileType）
  if (opts.declared === 1 || opts.declared === 2 || opts.declared === 3 || opts.declared === 4) {
    return opts.declared
  }
  return 1
}
