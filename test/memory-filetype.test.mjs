// 回归测试：记忆管理「编辑主观描述后保存」时，已有源文件的 fileType 必须原样保留。
//
// 背景（用户反馈的视频解析 bug）：
//   第一次上传视频解析出正确画面描述；修改主观描述再保存后，md 里的片段变成了
//   "MP4 容器文件的二进制元数据结构 …… ftyp/moov/avc1/mp4a/stts/stsc"。
//
// 根因就在本组件：loadDetail() 把详情接口返回的已有源文件用 `new File([], fileName)`
// 占位，而空 File 的 `type` 是空串；保存时 collectSourceFileItems() 又按 File.type
// 重新推导 fileType，于是 video(3) 退化成 text(1)。echo-core 透传给 echo-ai 后，
// registry 分派到 parse_text，把 mp4 原始字节 decode 成文本喂给了 LLM。
//
// 断言：编辑态提交时，updateMemory 收到的 sourceFiles[].fileType 必须是详情接口
// 给出的 3（视频），而不是 1（文本）。

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const updateMemory = vi.hoisted(() => vi.fn(async (p) => ({ ...p, memoryId: p.memoryId })))
const saveMemory = vi.hoisted(() => vi.fn(async (p) => ({ ...p })))
const getMemoryDetail = vi.hoisted(() =>
  vi.fn(async () => ({
    memoryId: 'mem-1',
    topic: '和拉师傅的欢乐时光',
    subjectiveDesc: '第一版描述',
    mdKey: 'memory/u/r/mem-1/mem-1.md',
    mdContent: '# 记忆\n',
    editStatus: 0,
    parseStatus: 2,
    sourceFiles: [
      { fileKey: 'memory/u/r/mem-1/a.mp4', fileName: '拉师傅的欢乐时光.mp4', fileType: 3 },
      { fileKey: 'memory/u/r/mem-1/b.jpg', fileName: '合影.jpg', fileType: 2 },
      { fileKey: 'memory/u/r/mem-1/c.txt', fileName: '随手记.txt', fileType: 1 },
    ],
  })),
)

vi.mock('@/api/memory', () => ({
  applyMemory: vi.fn(async () => ({ memoryId: 'mem-1' })),
  checkTopic: vi.fn(async () => ({ exists: false })),
  getMemoryUploadToken: vi.fn(async () => ({ token: 't', key: 'k', domain: 'd' })),
  saveMemory,
  updateMemory,
  getMemoryDetail,
  deleteSourceFile: vi.fn(async () => {}),
}))

vi.mock('element-plus', () => ({
  ElMessage: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
  ElMessageBox: { confirm: vi.fn(async () => true) },
}))

const MemoryThemeFormDialog = (
  await import('../src/views/admin/memory/MemoryThemeFormDialog.vue')
).default

/** el-* 组件全部打成透传桩，避免 jsdom 里跑 element-plus 真实实现 */
const stubs = new Proxy(
  {},
  {
    has: (_t, key) => typeof key === 'string' && key.startsWith('El'),
    get: (_t, key) => ({ name: key, template: '<div><slot /></div>' }),
  },
)

async function mountEditDialog() {
  const wrapper = mount(MemoryThemeFormDialog, {
    props: { mode: 'edit', target: { memoryId: 'mem-1' } },
    global: { stubs },
  })
  // 等 onMounted 里的 loadDetail 完成
  await new Promise((r) => setTimeout(r, 0))
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('MemoryThemeFormDialog 编辑态 fileType 保留', () => {
  beforeEach(() => {
    updateMemory.mockClear()
    saveMemory.mockClear()
  })

  it('修改主观描述后保存，视频源文件的 fileType 必须仍是 3', async () => {
    const wrapper = await mountEditDialog()

    // 用户改主观描述后点保存
    wrapper.vm.form.subjectiveDesc = '第二版描述：这天下午我们在江边散步'
    await wrapper.vm.handleSubmit()

    expect(updateMemory).toHaveBeenCalledTimes(1)
    const payload = updateMemory.mock.calls[0][0]

    const video = payload.sourceFiles.find((f) => f.fileName === '拉师傅的欢乐时光.mp4')
    expect(video, '视频源文件应被提交').toBeTruthy()
    expect(video.fileType, 'mp4 被降级成 1(文本) —— 即 MP4 元数据 bug 的根因').toBe(3)
  })

  it('图片与文本源文件的 fileType 同样不被降级', async () => {
    const wrapper = await mountEditDialog()
    wrapper.vm.form.subjectiveDesc = '换个描述'
    await wrapper.vm.handleSubmit()

    const payload = updateMemory.mock.calls[0][0]
    const byName = Object.fromEntries(payload.sourceFiles.map((f) => [f.fileName, f.fileType]))
    expect(byName['合影.jpg']).toBe(2)
    expect(byName['随手记.txt']).toBe(1)
  })

  it('needReparse 在仅改描述时为 true（源文件集合未变）', async () => {
    const wrapper = await mountEditDialog()
    wrapper.vm.form.subjectiveDesc = '只改描述'
    await wrapper.vm.handleSubmit()

    expect(updateMemory.mock.calls[0][0].needReparse).toBe(true)
  })

  it('完全无改动保存时 needReparse 为 false', async () => {
    const wrapper = await mountEditDialog()
    await wrapper.vm.handleSubmit()

    expect(updateMemory.mock.calls[0][0].needReparse).toBe(false)
  })
})
