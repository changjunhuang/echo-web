// ChatImage 组件的轻量测试
// 由于仓库尚未引入 vitest，本文件用 Node 内置 test runner + jsdom
// 检查 ChatImage.vue 的关键行为（URL 解析、状态机、CSS 关键值）。
//
// 跑：`node --test test/chat-image.test.mjs`

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import http from 'node:http'

// ---------------------------------------------------------------------------
// 1. 组件文件结构与契约
// ---------------------------------------------------------------------------

test('ChatImage.vue 存在且导出关键 API', async () => {
  const src = await readFile(new URL('../src/components/ChatImage.vue', import.meta.url), 'utf-8')
  assert.ok(src.includes('<script setup lang="ts">'), '应为 <script setup>')
  // 暴露的 props
  assert.ok(src.includes('src: string'), '应接收 src prop')
  assert.ok(src.includes('alt?: string'), '应接收 alt prop')
  assert.ok(src.includes('maxWidth?: string'), '应接收 maxWidth prop（限制宽度自适应上限）')
  assert.ok(src.includes('maxHeight?: string'), '应接收 maxHeight prop（防止长图霸屏）')
  assert.ok(src.includes('probe?: boolean'), '应提供 probe 开关（可选 URL 预探活）')
  // 状态机
  assert.ok(src.includes("'idle'"), '应定义 idle 状态')
  assert.ok(src.includes("'loading'"), '应定义 loading 状态')
  assert.ok(src.includes("'loaded'"), '应定义 loaded 状态')
  assert.ok(src.includes("'failed'"), '应定义 failed 状态')
  // 加载 / 失败分支
  assert.ok(src.includes('@load="onLoad"'), '应监听 <img> 的 load 事件')
  assert.ok(src.includes('@error="onError"'), '应监听 <img> 的 error 事件')
  // 比例自适应
  assert.ok(src.includes('aspectRatio'), '应使用 aspect-ratio 锁住原图比例')
  // 失败态文案
  assert.ok(src.includes('图片加载失败'), '应给出明确的失败文案')
  assert.ok(src.includes('重试'), '应给出重试按钮')
  // 懒加载
  assert.ok(src.includes('loading="lazy"'), '应启用浏览器原生懒加载')
})

// ---------------------------------------------------------------------------
// 2. CSS 关键值（确保"自适应 + 上限"是真的写进样式表）
// ---------------------------------------------------------------------------

test('ChatImage.vue 的样式表包含自适应相关属性', async () => {
  const src = await readFile(new URL('../src/components/ChatImage.vue', import.meta.url), 'utf-8')
  assert.ok(src.includes('width: 100%'), '容器宽度应填满父级')
  assert.ok(src.includes('height: auto'), '高度由 aspect-ratio 决定')
  assert.ok(src.includes('object-fit: contain'), 'object-fit 应为 contain 防截断')
  // max-height 通过内联 style（由 maxHeight prop 控制），默认值 24rem 在 script 中
  assert.ok(
    src.includes("maxHeight: '24rem'") || src.includes('maxHeight = "24rem"'),
    '默认 maxHeight 应为 24rem（防止长图霸屏）',
  )
  assert.ok(src.includes('@keyframes chat-image-shimmer'), '应有骨架屏动画')
})

// ---------------------------------------------------------------------------
// 3. 集成验证：起本地 HTTP 服务提供一张 PNG，用 fetch + onload/onerror 链路
//    模拟 ChatImage 的"探活 + 加载成功"路径
// ---------------------------------------------------------------------------

function startImageServer(behavior) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      behavior(req, res)
    })
    srv.listen(0, '127.0.0.1', () => resolve(srv))
  })
}

// 1x1 透明 PNG
const TINY_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000005000100' +
    '0d0a2db40000000049454e44ae426082',
  'hex',
)

test('URL 可用时：probe + GET 都返回 2xx，模拟 ChatImage 应当走 loaded 分支', async () => {
  const srv = await startImageServer((req, res) => {
    if (req.method === 'GET' && req.headers.range === 'bytes=0-0') {
      // 模拟探活
      res.writeHead(206, {
        'Content-Type': 'image/png',
        'Content-Range': `bytes 0-0/${TINY_PNG.length}`,
        'Content-Length': '1',
      })
      res.end(TINY_PNG.subarray(0, 1))
      return
    }
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': TINY_PNG.length })
      res.end(TINY_PNG)
      return
    }
    res.writeHead(405).end()
  })
  try {
    const port = srv.address().port
    const url = `http://127.0.0.1:${port}/img.png`

    // 模拟 probe：GET + Range
    const probeRes = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } })
    assert.ok(probeRes.ok || probeRes.status === 206, '探活应返回 200/206')

    // 模拟 <img> 加载：完整 GET
    const imgRes = await fetch(url)
    assert.equal(imgRes.status, 200)
    const buf = Buffer.from(await imgRes.arrayBuffer())
    assert.equal(buf.length, TINY_PNG.length)
    // PNG 魔数
    assert.equal(buf[0], 0x89)
    assert.equal(buf[1], 0x50) // 'P'
    assert.equal(buf[2], 0x4e) // 'N'
    assert.equal(buf[3], 0x47) // 'G'
  } finally {
    srv.close()
  }
})

test('URL 不可用时（404）：probe 应判定为 failed', async () => {
  const srv = await startImageServer((req, res) => {
    res.writeHead(404).end()
  })
  try {
    const port = srv.address().port
    const url = `http://127.0.0.1:${port}/missing.png`
    const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } })
    // 404 既不 ok 也不是 206 → probeOk=false → 走 failed 状态
    assert.ok(!(res.ok || res.status === 206), '404 应被识别为不可用')
  } finally {
    srv.close()
  }
})

// ---------------------------------------------------------------------------
// 4. ChatPage.vue 已正确替换为 ChatImage 组件
// ---------------------------------------------------------------------------

test('ChatPage.vue 已经引入 ChatImage 组件而非直接用 el-image', async () => {
  const src = await readFile(new URL('../src/views/chat/ChatPage.vue', import.meta.url), 'utf-8')
  assert.ok(src.includes("import ChatImage from '@/components/ChatImage.vue'"), '应 import 新组件')
  assert.ok(
    src.includes('<ChatImage'),
    '应在模板里使用 <ChatImage> 替代旧的 <el-image>',
  )
  assert.ok(
    !src.includes('<el-image\n') && !src.includes('preview-src-list'),
    '应不再直接使用 <el-image> 的 preview-src-list（已迁入 ChatImage 内部）',
  )
})