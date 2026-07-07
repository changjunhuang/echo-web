// 打字机节流器：vitest 用 fake timers 验证 burst 涌入时不会瞬间满屏。
//
// 目标：模拟 SSE 把一坨 delta 一次性灌进来，断言输出是按节奏出来的
// （不是"塞进去立刻全出来"），并在 stop(flush=true) 时强制 drain。

import { describe, it, expect, vi } from 'vitest'
import { createTypewriter } from '../src/composables/useTypewriter'

describe('createTypewriter（打字机节流器）', () => {
  it('50 个单字符 delta 一次性塞入：必须按节奏陆续输出，不是瞬间满屏', () => {
    vi.useFakeTimers()
    try {
      const out = []
      const tw = createTypewriter({
        charsPerTick: 6,
        tickMs: 25,
        onAppend: (s) => out.push(s),
      })
      // 模拟 SSE 一坨涌入：50 个单字符 chunk
      for (let i = 0; i < 50; i++) tw.push('a')
      // 关键回归：在第一次 timer fire 之前，**不能**有任何字符被 append
      // （之前没节流的时候，appendToLastAssistantMessage 是同步调用，UI 立刻满屏）
      expect(out.join('')).toBe('')
      // 第一拍 (25ms)：pop 一个 chunk（这里就是 'a'，长度 1 ≤ charsPerTick 6，完整输出）
      vi.advanceTimersByTime(25)
      expect(out.join('')).toBe('a')
      // 第二拍：又一个 'a'
      vi.advanceTimersByTime(25)
      expect(out.join('')).toBe('aa')
      // 跑到第 5 拍：累计 5 个 'a' —— 必须**远少于**塞入总数 50
      vi.advanceTimersByTime(75) // 共 150ms / 25ms
      expect(out.join('').length).toBe(5)
      expect(out.join('').length).toBeLessThan(50)
    } finally {
      vi.useRealTimers()
    }
  })

  it('超长 delta 段会被按 charsPerTick 切片（不破坏 markdown 原子）', () => {
    vi.useFakeTimers()
    try {
      const out = []
      const tw = createTypewriter({
        charsPerTick: 3,
        tickMs: 25,
        onAppend: (s) => out.push(s),
      })
      // 一段很长的 delta（> charsPerTick）：必须切成 ≤3 字符/段
      tw.push('abcdefghij') // 10 字符
      vi.advanceTimersByTime(25) // 第 1 拍
      expect(out[0]).toBe('abc')
      vi.advanceTimersByTime(25)
      expect(out[1]).toBe('def')
      vi.advanceTimersByTime(25)
      expect(out[2]).toBe('ghi')
      vi.advanceTimersByTime(25)
      expect(out[3]).toBe('j')
      // 共 4 拍输出 10 字符，每段 ≤ 3
      expect(out.join('')).toBe('abcdefghij')
      // 队列已空，自动停 timer
      vi.advanceTimersByTime(1000)
      expect(out.join('')).toBe('abcdefghij')
    } finally {
      vi.useRealTimers()
    }
  })

  it('stop(flush=true)：done/error/stop 时强制 drain 剩余，避免 UI 显示滞后', () => {
    vi.useFakeTimers()
    try {
      const out = []
      const tw = createTypewriter({
        charsPerTick: 6,
        tickMs: 25,
        onAppend: (s) => out.push(s),
      })
      // 灌入：30 段小 delta（每段 1 字符，但被一次性 push 进来）
      for (let i = 0; i < 30; i++) tw.push('a')
      // 一拍过去，只 drain 1 段（不 slicing，因为段长 1 ≤ charsPerTick 6）
      vi.advanceTimersByTime(25)
      expect(out.join('')).toBe('a')
      // 模拟 SSE done：UI 必须立刻收到全部 30 个字符，不能拖 29 拍才出来
      tw.stop(true, (rest) => out.push(rest))
      expect(out.join('')).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')
      // 后续不应再有 timer 输出（停后再前进 1 秒也不变）
      vi.advanceTimersByTime(1000)
      expect(out.join('').length).toBe(30)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stop(flush=false)：停止但不强制 drain，剩余全部丢弃', () => {
    const out = []
    const tw = createTypewriter({
      charsPerTick: 6,
      tickMs: 25,
      onAppend: (s) => out.push(s),
    })
    for (let i = 0; i < 30; i++) tw.push('a')
    tw.stop(false) // 不 flush
    expect(out.join('')).toBe('')
  })

  it('onIdle：队列清空 + timer 关闭时触发一次（用于收起光标）', () => {
    vi.useFakeTimers()
    try {
      let idleCount = 0
      const tw = createTypewriter({
        charsPerTick: 6,
        tickMs: 25,
        onAppend: () => {},
        onIdle: () => idleCount++,
      })
      tw.push('hi')
      vi.advanceTimersByTime(25) // drain
      vi.advanceTimersByTime(25) // 队列空 → 触发 idle
      // idle 只在"队列自然空"那一刻发一次；后续空跑不再发
      vi.advanceTimersByTime(1000)
      expect(idleCount).toBe(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('空 chunk 忽略（不做无意义 tick）', () => {
    vi.useFakeTimers()
    try {
      const out = []
      const tw = createTypewriter({
        onAppend: (s) => out.push(s),
      })
      tw.push('')
      tw.push('')
      vi.advanceTimersByTime(1000)
      expect(out.join('')).toBe('')
      expect(tw.isActive).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})
