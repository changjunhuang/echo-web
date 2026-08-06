// 端到端运行测试（vitest 模式）：用 vite 编译并实际渲染 Vue 组件到 DOM，
// 验证 SSE `resource` 帧到 store → ChatAttachment → 真实 <img src=https://...>。
//
// 跑：`npm run test:e2e` 或 `npx vitest run test/resource-render.test.mjs`

import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

import ChatAttachment from '../src/components/ChatAttachment.vue'
import { useChatStore } from '../src/stores/chat'
import { resolveUrl } from '../src/api/chat'

describe('完整管线：resource → store → ChatAttachment → DOM', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('图像资源：appendMessageResource → DOM 含 <img src=https://...>', async () => {
    const store = useChatStore()
    const sid = store.createSession().id
    store.addMessage(sid, { role: 'assistant', content: '给你找到啦' })

    // 模拟 onResource 回调
    store.appendMessageResource(sid, {
      id: 'img-1',
      name: '拉布拉多.jpg',
      displayName: '拉布拉多.jpg',
      url: 'cdn.example.com/lab.jpg',
      fileId: 'F-1024',
      modality: 'image',
      mimeType: 'image/jpeg',
      chunkIndex: 0,
      totalChunks: 1,
    })

    const last = store.currentSession.messages[store.currentSession.messages.length - 1]
    expect(last.attachments).toBeDefined()
    expect(last.attachments && last.attachments.length).toBe(1)
    expect(last.attachments && last.attachments[0].url).toBe('cdn.example.com/lab.jpg')

    expect(
      resolveUrl(last.attachments && last.attachments[0].url || ''),
    ).toBe('https://cdn.example.com/lab.jpg')

    const wrapper = mount(ChatAttachment, {
      props: { attachments: last.attachments || [] },
    })
    await nextTick()

    const html = wrapper.html()
    expect(html).toContain('https://cdn.example.com/lab.jpg')
    // 应该有 <img> 元素
    const imgs = wrapper.findAll('img')
    expect(imgs.length).toBeGreaterThanOrEqual(1)
    expect(imgs[0].attributes('src')).toBe('https://cdn.example.com/lab.jpg')
  })

  it('音频资源：<audio src=https://...> 出现', async () => {
    const store = useChatStore()
    const sid = store.createSession().id
    store.addMessage(sid, { role: 'assistant', content: '听一下' })
    store.appendMessageResource(sid, {
      id: 'aud-1',
      name: 'bark.m4a',
      displayName: 'bark.m4a',
      url: 'cdn.example.com/bark.m4a',
      fileId: 'F-A1',
      modality: 'audio',
      mimeType: 'audio/mp4',
      chunkIndex: 0,
      totalChunks: 1,
    })

    const last = store.currentSession.messages[store.currentSession.messages.length - 1]
    const wrapper = mount(ChatAttachment, {
      props: { attachments: last.attachments || [] },
    })
    await nextTick()
    const html = wrapper.html()
    expect(html).toContain('https://cdn.example.com/bark.m4a')
    expect(html).toContain('<audio')
  })

  it('视频资源：<video src=https://...> 出现', async () => {
    const store = useChatStore()
    const sid = store.createSession().id
    store.addMessage(sid, { role: 'assistant', content: '' })
    store.appendMessageResource(sid, {
      id: 'vid-1',
      name: 'intro.mp4',
      displayName: 'intro.mp4',
      url: 'cdn.example.com/intro.mp4',
      fileId: 'F-V1',
      modality: 'video',
      mimeType: 'video/mp4',
      chunkIndex: 0,
      totalChunks: 1,
    })

    const last = store.currentSession.messages[store.currentSession.messages.length - 1]
    const wrapper = mount(ChatAttachment, {
      props: { attachments: last.attachments || [] },
    })
    await nextTick()
    const html = wrapper.html()
    expect(html).toContain('https://cdn.example.com/intro.mp4')
    expect(html).toContain('<video')
  })

  it('文件资源：渲染文件卡片 + 文件名 + 查看/下载/复制按钮', async () => {
    const store = useChatStore()
    const sid = store.createSession().id
    store.addMessage(sid, { role: 'assistant', content: '' })
    store.appendMessageResource(sid, {
      id: 'f-1',
      name: 'report.pdf',
      displayName: '年度报告.pdf',
      url: 'cdn.example.com/report.pdf',
      fileId: 'F-1',
      modality: 'file',
      mimeType: 'application/pdf',
      chunkIndex: 0,
      totalChunks: 1,
    })

    const last = store.currentSession.messages[store.currentSession.messages.length - 1]
    const wrapper = mount(ChatAttachment, {
      props: { attachments: last.attachments || [] },
    })
    await nextTick()
    const html = wrapper.html()
    // 1. 文件名 / mime 应渲染
    expect(html).toContain('年度报告.pdf')
    expect(html).toContain('application/pdf')
    // 2. 查看 / 下载 / 复制 三个按钮都应存在
    expect(html).toContain('查看')
    expect(html).toContain('下载')
    expect(html).toContain('复制链接')
    // 3. 文件分支用的是 <button> + click handler 而不是 <a href>，DOM 中不应该
    //    出现未拼接的相对路径 cdn.example.com/report.pdf（避免被当成相对路径）
    expect(html).not.toContain('href="cdn.example.com/report.pdf"')
  })

  it('回归：resolveUrl(裸 URL) 在 jsdom (http://) 下仍返回 https://', () => {
    // 关键回归：在 dev 环境（页面是 http://localhost），如果 resolveUrl 跟随
    // window.location.protocol，CDN 资源会变成 http://cdn.example.com/...
    // 但 CDN 基本只支持 HTTPS，于是 <img src=http://...> 失败 → "图片不显示"
    //
    // 此测试断言：无论 window.location.protocol 是什么（这里 jsdom 是 http:），
    // 裸 URL 必须拼 https://
    //
    // 注：jsdom 默认 location.protocol = 'http:'，正是 dev 服务器的等价场景
    expect(window.location.protocol).toBe('http:')
    expect(resolveUrl('cdn.example.com/test.png')).toBe('https://cdn.example.com/test.png')
    expect(resolveUrl('tixapmuo5.hn-bkt.clouddn.com/x.jpg')).toBe(
      'https://tixapmuo5.hn-bkt.clouddn.com/x.jpg',
    )
    // 已带 scheme 的不动
    expect(resolveUrl('https://cdn.example.com/x.jpg')).toBe('https://cdn.example.com/x.jpg')
    // 协议相对：跟随当前页协议（http://）
    expect(resolveUrl('//cdn.example.com/x.jpg')).toBe('http://cdn.example.com/x.jpg')
  })
})
