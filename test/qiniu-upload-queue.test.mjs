// 回归测试：UploadQueue 上传成功时必须把七牛返回的 fileKey 回写到调用方。
//
// 背景：之前 UploadQueue.runOne 在 uploadOne 成功后只更新了 status/progress，
// 通过 `void res` 把 res.key 丢掉了。MemoryThemeFormDialog 在保存记忆时，
// collectSourceFileItems() 检查的是 PendingFile.fileKey，于是 items 永远是空数组，
// /api/memory/save 的 SourceFiles 触发 min=1 校验失败。
//
// 本测试用 vi.mock 把 qiniu-js 替换成可控的 fake observable，验证补丁后
// onItemUpdate 能拿到 { status: 'success', fileKey: '<七牛key>' }。

import { describe, it, expect, vi } from 'vitest'

// 用一个工厂函数生成假 observable：subscribe 立即给 next/progress 然后 complete
const fakeObservableFactory = vi.hoisted(() => {
  return (resolvedKey) => ({
    subscribe(observer) {
      // 模拟一次进度
      observer.next({ total: { percent: 100 } })
      // 模拟完成
      observer.complete({ key: resolvedKey, hash: 'h-' + resolvedKey })
      return { unsubscribe() {} }
    },
  })
})

vi.mock('qiniu-js', () => ({
  upload: vi.fn((_file, key, _token, _putExtra, _config) => fakeObservableFactory(key)),
}))

// 在 mock 之后再 import（vi.mock 提升）
const { UploadQueue } = await import('../src/utils/qiniuUpload.ts')

function makeBlob() {
  // 任意二进制都行，qiniu-js.upload 不会被真实调用
  return new Blob(['x'.repeat(8)], { type: 'image/png' })
}

function makeToken() {
  return { token: 'tk', uploadURL: 'https://up.qiniup.com', key: 'k', domain: 'cdn.example.com' }
}

function waitFor(predicate, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const tick = () => {
      if (predicate()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error('timeout'))
      setTimeout(tick, 10)
    }
    tick()
  })
}

describe('UploadQueue', () => {
  it('上传成功后 onItemUpdate 必须包含 fileKey（关键回归：SourceFiles.min 校验）', async () => {
    const updates = []
    const q = new UploadQueue({
      concurrency: 1,
      retries: 1,
      onItemUpdate: (id, patch) => updates.push({ id, patch }),
    })

    const fakeFile = makeBlob()
    fakeFile.name = 'cat.png'

    q.enqueue({
      id: 'file-1',
      token: makeToken(),
      file: fakeFile,
      key: 'memory/u1/default/m1/abc.png',
    })

    // 等待 success 状态出现
    await waitFor(() => updates.some((u) => u.patch.status === 'success'))

    const success = updates.find((u) => u.patch.status === 'success')
    expect(success).toBeDefined()
    expect(success.patch.progress).toBe(100)
    // 关键断言：fileKey 必须等于七牛返回的 key
    expect(success.patch.fileKey).toBe('memory/u1/default/m1/abc.png')

    // 不应再出现 error
    expect(updates.some((u) => u.patch.status === 'error')).toBe(false)
  })

  it('多次入队并发：每个文件都拿到独立的 fileKey', async () => {
    const updates = []
    const q = new UploadQueue({
      concurrency: 2,
      retries: 1,
      onItemUpdate: (id, patch) => updates.push({ id, patch }),
    })

    for (let i = 0; i < 3; i++) {
      const k = `memory/u1/default/m1/file-${i}.png`
      q.enqueue({
        id: 'file-' + i,
        token: { ...makeToken(), key: k },
        file: makeBlob(),
        key: k,
      })
    }

    await waitFor(() =>
      updates.filter((u) => u.patch.status === 'success').length === 3,
    )

    const successes = updates.filter((u) => u.patch.status === 'success')
    expect(successes.length).toBe(3)
    const keys = successes.map((u) => u.patch.fileKey).sort()
    expect(keys).toEqual([
      'memory/u1/default/m1/file-0.png',
      'memory/u1/default/m1/file-1.png',
      'memory/u1/default/m1/file-2.png',
    ])
  })
})