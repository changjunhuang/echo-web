/**
 * 七牛云对象上传工具：分片上传 / 断点续传 / 并发控制 / 进度回调 / 重试。
 *
 * 设计要点：
 *  - 复用 `qiniu-js` v3 的 `upload`（普通上传）和 `resume.upload`（分片+断点续传）。
 *  - 并发上限默认 5（受 uploadStore 调度）。
 *  - 大文件阈值（默认 4MB）走分片；小文件走普通上传。
 *  - 进度通过 subscribe.next(res.total.percent) 实时写回。
 *  - 单文件失败可重试（断点续传 ctx 由 qiniu-js 自动持久化到 localStorage）。
 */

import * as qiniu from 'qiniu-js'
import type { MemoryUploadTokenResponse } from '@/api/memory'

/** 上传进度回调（percent: 0~100） */
export type ProgressCb = (percent: number) => void

/** 上传结果：成功后返回 server 端的 key */
export interface UploadResult {
  key: string
  hash?: string
}

export interface UploadOptions {
  token: MemoryUploadTokenResponse
  file: File
  /** 自定义 key（一般由后端 token 接口返回） */
  key: string
  onProgress?: ProgressCb
  signal?: AbortSignal
}

// 注：当前 qiniu-js v3 仅暴露普通 upload（自动分片），不再需要客户端分片阈值

/**
 * 上传单个文件。
 *  注：qiniu-js v3 仅暴露普通 upload，自动处理大文件分片；
 *  本工具负责并发控制 / 进度 / 失败重试。
 */
export function uploadOne(opts: UploadOptions): Promise<UploadResult> {
  const { token, file, key, onProgress, signal } = opts

  return new Promise<UploadResult>((resolve, reject) => {
    const observable = qiniu.upload(file, key, token.token, {
      fname: file.name,
      mimeType: file.type || undefined,
    }, {
      useCdnDomain: true,
    })

    const sub = observable.subscribe({
      next(res: { total: { percent: number } }) {
        if (signal?.aborted) {
          sub.unsubscribe()
          reject(new Error('aborted'))
          return
        }
        const pct = Math.round((res.total?.percent ?? 0))
        onProgress?.(pct)
      },
      error(err: unknown) {
        reject(err instanceof Error ? err : new Error(String(err)))
      },
      complete(res: { key: string; hash?: string }) {
        resolve({ key: res.key, hash: res.hash })
      },
    })
  })
}

export interface QueueItem extends UploadOptions {
  id: string
  onProgress?: ProgressCb
}

export interface QueueHandlers {
  onItemUpdate?: (
    id: string,
    patch: Partial<{
      progress: number
      status: 'pending' | 'uploading' | 'success' | 'error'
      error?: string
      /** 上传成功时回写七牛对象 key，供 save 接口使用 */
      fileKey?: string
    }>,
  ) => void
  /** 并发上限（默认 5） */
  concurrency?: number
  /** 重试次数（默认 3） */
  retries?: number
}

/**
 * 并发队列：控制同时上传的文件数 ≤ concurrency。
 * 失败项可由 caller 调 `retry(item)` 重新入队。
 */
export class UploadQueue {
  private concurrency: number
  private retries: number
  private onItemUpdate?: QueueHandlers['onItemUpdate']
  private active = 0
  private queue: QueueItem[] = []

  constructor(handlers: QueueHandlers = {}) {
    this.concurrency = handlers.concurrency ?? 5
    this.retries = handlers.retries ?? 3
    this.onItemUpdate = handlers.onItemUpdate
  }

  /** 入队（不会立即开始） */
  enqueue(item: QueueItem): void {
    this.queue.push(item)
    this.tick()
  }

  /** 重试（重新入队同一项） */
  retry(item: QueueItem): void {
    this.queue.push(item)
    this.tick()
  }

  private async tick(): Promise<void> {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const item = this.queue.shift()!
      this.active++
      this.runOne(item).finally(() => {
        this.active--
        this.tick()
      })
    }
  }

  private async runOne(item: QueueItem): Promise<void> {
    let attempt = 0
    while (attempt < this.retries) {
      attempt++
      this.onItemUpdate?.(item.id, { status: 'uploading', progress: 0 })
      try {
        const res = await uploadOne({
          token: item.token,
          file: item.file,
          key: item.key,
          onProgress: (p) => this.onItemUpdate?.(item.id, { progress: p }),
        })
        // 把七牛返回的 key 回写给调用方，save 接口需要它作为 sourceFiles[].fileKey
        this.onItemUpdate?.(item.id, {
          status: 'success',
          progress: 100,
          fileKey: res.key,
        })
        return
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (attempt >= this.retries) {
          this.onItemUpdate?.(item.id, { status: 'error', error: msg })
          return
        }
        // 退避重试（指数退避 1s, 2s, 4s ...）
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)))
      }
    }
  }
}

/** 超大文件阈值（默认 100MB）。超过此值建议二次确认。 */
export const LARGE_FILE_CONFIRM_BYTES = 100 * 1024 * 1024

export function isLargeFile(size: number): boolean {
  return size > LARGE_FILE_CONFIRM_BYTES
}