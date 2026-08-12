/**
 * 打字机节流器：把 SSE 的 delta 段（可能一次性灌进一坨）按固定节奏
 * 投递到 UI，呈现"逐字/逐段打字"效果，而不是瞬间满屏。
 *
 * 关键点：
 *  - SSE 在 `reader.read()` 里会把多条 `data:` 帧攒成一坨同步回调，
 *    因此 onChunk 在同一微任务里被连续触发 N 次，msg.content 会一帧内
 *    涨到终态。打字机的存在就是把这些 burst 平铺到时间轴上。
 *  - 现版本默认 **逐字打印**（charsPerTick=1，tickMs≈28），让用户看到
 *    "一格一格蹦字"的效果，而不是整段/多字一喷。
 *  - 单字符切片对 markdown 原子（如 `**bold**`）有一定切坏风险；切坏后
 *    会显示短暂原文/源码态，被下一帧 v-html 渲染覆盖——这里以视觉流畅
 *    度优先，因为闭合的标记会被立刻重新解析。
 *  - `stop(flush=true)` 是一次性 drain：在收到 done 帧 / 用户点停止 /
 *    网络错误时调用，丢弃节流立刻把剩余文字 push 出去，避免 UI 显示
 *    滞后于真实收尾。
 *  - 队列空 + 没事做 → 停止 timer，由下一次 push 唤醒（节能）。
 */

export interface TypewriterOptions {
  /** 每次 append 的字符上限。默认 1（真正逐字）。曾用 6（25ms 一拍≈200 字/秒）。 */
  charsPerTick?: number
  /** tick 间隔（毫秒）。默认 28。逐字时再小会让眼睛跟不上，再大会感觉"卡顿"。 */
  tickMs?: number
  /** 把节奏出来的字符追加到这里（一般直接 `msg.content += text`） */
  onAppend: (chunk: string) => void
  /** 队列清空 + timer 关闭时的回调（用于收起光标等收尾动作） */
  onIdle?: () => void
}

export interface TypewriterHandle {
  /** 把一段 delta 推进队列；第一次 push 会自动启动 timer。 */
  push: (chunk: string) => void
  /**
   * 停掉 timer。`flush=true` 时把队列里剩余的文字通过 `sink` 一次性输出。
   * 必须在 onDone / onError / 用户点停止时调用，保证 UI 与真实收尾同步。
   */
  stop: (flush?: boolean, sink?: (text: string) => void) => void
  /** 当前是否在打字（timer 活着 或 队列里有积压） */
  readonly isActive: boolean
}

export function createTypewriter(opts: TypewriterOptions): TypewriterHandle {
  const charsPerTick = Math.max(1, opts.charsPerTick ?? 1)
  const tickMs = Math.max(1, opts.tickMs ?? 28)
  const queue: string[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  function scheduleNext() {
    if (timer != null) return
    timer = setTimeout(tick, tickMs)
  }

  function tick() {
    timer = null
    if (queue.length === 0) {
      opts.onIdle?.()
      return
    }
    let head = queue.shift() as string
    // 超长段切片：剩余回灌队首，下一拍继续
    if (head.length > charsPerTick) {
      queue.unshift(head.slice(charsPerTick))
      head = head.slice(0, charsPerTick)
    }
    opts.onAppend(head)
    scheduleNext()
  }

  return {
    push(chunk: string) {
      if (!chunk) return
      queue.push(chunk)
      scheduleNext()
    },
    stop(flush = false, sink?: (text: string) => void) {
      if (timer != null) {
        clearTimeout(timer)
        timer = null
      }
      if (flush && queue.length > 0) {
        const rest = queue.join('')
        queue.length = 0
        sink?.(rest)
      } else {
        queue.length = 0
      }
      // 显式 flush 后认为彻底没活了；通知 onIdle 收起光标
      if (flush) opts.onIdle?.()
    },
    get isActive() {
      return timer != null || queue.length > 0
    },
  }
}
