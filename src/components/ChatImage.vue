<script setup lang="ts">
/**
 * 聊天气泡内的图片展示组件
 *
 * 关键设计：
 * 1. 尺寸自适应
 *    - 宽度：跟随气泡宽度（CSS clamp + max-width: 100%），不再写死 28rem
 *    - 比例：用 `aspect-ratio` 锁住原图比例（避免 contain 留白），同时给一个 max-height
 *      防止超长图（截图、长图）把聊天框撑到需要滚动整页
 * 2. 加载 / 失败态
 *    - 骨架屏渐变背景，等 onload 完成后才把真图淡入（视觉更顺滑）
 *    - onerror 进入失败态：显示"图片加载失败 + 重试"按钮
 * 3. URL 可用性
 *    - 默认走浏览器原生 <img> 加载；额外提供 probe 开关，由父级在拿到 URL 时
 *      调一次 HEAD/GET 做可用性预检，能拦住 404/500、CORS 失败的图，避免空转
 * 4. 点击预览
 *    - 复用 el-image 的 preview-src-list，打开全屏大图
 */

import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElImageViewer } from 'element-plus'

const props = withDefaults(
  defineProps<{
    src: string
    /** 自定义替代文本（鼠标悬停 / 屏幕阅读器） */
    alt?: string
    /** 宽度上限（CSS 任意单位，默认 28rem 与气泡宽度匹配） */
    maxWidth?: string
    /** 高度上限（防止超长图霸屏，默认 24rem） */
    maxHeight?: string
    /** 是否在挂载时先用 fetch 探活 URL，不可达就不渲染 <img> */
    probe?: boolean
  }>(),
  {
    alt: '',
    maxWidth: '28rem',
    maxHeight: '24rem',
    probe: false,
  },
)

/** 'idle' | 'loading' | 'loaded' | 'failed' */
const status = ref<'idle' | 'loading' | 'loaded' | 'failed'>('idle')
const probeOk = ref<boolean | null>(null) // null = 还没探测过

let probeAbort: AbortController | null = null

const wrapperStyle = computed(() => ({
  maxWidth: props.maxWidth,
  maxHeight: props.maxHeight,
}))

const aspectStyle = ref<{ aspectRatio?: string }>({})

function reset() {
  status.value = 'idle'
  probeOk.value = null
  aspectStyle.value = {}
  probeAbort?.abort()
  probeAbort = null
}

/** 通过 fetch 探活：非 2xx / 抛错都视为不可用 */
async function probe() {
  if (!props.probe) {
    probeOk.value = true
    return
  }
  probeAbort?.abort()
  probeAbort = new AbortController()
  try {
    // 一些图床不支持 HEAD；用 GET + Range 拿首字节最稳
    const res = await fetch(props.src, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      signal: probeAbort.signal,
    })
    // 206 Partial Content（Range 命中）或 200 都视为 OK
    probeOk.value = res.ok || res.status === 206
    if (!probeOk.value) status.value = 'failed'
  } catch {
    probeOk.value = false
    status.value = 'failed'
  }
}

function onLoad(ev: Event) {
  const img = ev.target as HTMLImageElement
  // 用 naturalWidth/Height 锁定原图比例，避免 contain 留白
  if (img.naturalWidth && img.naturalHeight) {
    aspectStyle.value = {
      aspectRatio: `${img.naturalWidth} / ${img.naturalHeight}`,
    }
  }
  status.value = 'loaded'
}

function onError() {
  status.value = 'failed'
}

function retry() {
  status.value = 'idle'
  // 通过 toggle src 强制 <img> 重新加载
  imgKey.value++
}

const imgKey = ref(0)

// 监听 src 变化：换图就重置所有状态
watch(
  () => props.src,
  (_n, _o, onCleanup) => {
    reset()
    if (props.src) {
      void probe()
      status.value = 'loading'
    }
    onCleanup(() => probeAbort?.abort())
  },
  { immediate: true },
)

onBeforeUnmount(() => probeAbort?.abort())

/* ----- 预览（el-image 的全屏查看器）----- */
const previewVisible = ref(false)
const previewList = computed(() => [props.src])
function openPreview() {
  if (!props.src || status.value !== 'loaded') return
  previewVisible.value = true
}
function closePreview() {
  previewVisible.value = false
}
</script>

<template>
  <div
    class="chat-image"
    :class="{
      'chat-image--loading': status === 'loading' || status === 'idle',
      'chat-image--failed': status === 'failed',
    }"
    :style="wrapperStyle"
  >
    <!-- 探活失败：直接展示失败态，不再渲染 <img> -->
    <template v-if="status === 'failed' || probeOk === false">
      <div class="chat-image__error" role="alert">
        <el-icon class="chat-image__error-icon"><Picture /></el-icon>
        <div class="chat-image__error-text">图片加载失败</div>
        <button class="chat-image__retry" type="button" @click="retry">重试</button>
      </div>
    </template>

    <template v-else>
      <button
        v-if="status === 'loaded'"
        type="button"
        class="chat-image__zoom-btn"
        title="查看大图"
        @click="openPreview"
      >
        <el-icon><ZoomIn /></el-icon>
      </button>
      <img
        :key="imgKey"
        :src="src"
        :alt="alt"
        :style="aspectStyle"
        loading="lazy"
        decoding="async"
        class="chat-image__img"
        @load="onLoad"
        @error="onError"
      />
    </template>

    <el-image-viewer
      v-if="previewVisible"
      :url-list="previewList"
      :initial-index="0"
      teleported
      @close="closePreview"
    />
  </div>
</template>

<style scoped>
.chat-image {
  position: relative;
  display: block;
  margin-top: 0.75rem;
  border-radius: 0.75rem;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.04);
  /* 容器自身宽度跟随气泡，但不超过 props.maxWidth；移动端自动收缩 */
  width: 100%;
  /* 不显式给高度，由 <img> 的 aspect-ratio 决定 */
}

/* 加载态：渐变骨架屏 */
.chat-image--loading::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    100deg,
    rgba(255, 255, 255, 0.04) 30%,
    rgba(255, 255, 255, 0.12) 50%,
    rgba(255, 255, 255, 0.04) 70%
  );
  background-size: 200% 100%;
  animation: chat-image-shimmer 1.4s ease-in-out infinite;
  z-index: 0;
}

.chat-image__img {
  display: block;
  width: 100%;
  height: auto; /* 由 inline aspect-ratio 控制 */
  max-height: 100%;
  object-fit: contain; /* 即使比例不准也不会被截断 */
  border-radius: 0.75rem;
  opacity: 0;
  transition: opacity 0.25s ease;
  position: relative;
  z-index: 1;
}

.chat-image--loading .chat-image__img {
  /* loading 期间图片透明，露出骨架屏；onload 触发后切到不透明 */
  visibility: hidden;
}

/* 已加载态：让图片可见 */
.chat-image:not(.chat-image--loading):not(.chat-image--failed) .chat-image__img {
  opacity: 1;
}

/* 失败态：暗色卡片 + 重试按钮 */
.chat-image--failed {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  background: rgba(245, 63, 63, 0.08);
  border: 1px dashed rgba(245, 63, 63, 0.35);
  color: rgba(255, 255, 255, 0.85);
  min-height: 4rem;
}

.chat-image__error {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.85rem;
}

.chat-image__error-icon {
  font-size: 1.25rem;
  color: rgba(245, 63, 63, 0.85);
}

.chat-image__error-text {
  color: rgba(255, 255, 255, 0.75);
}

.chat-image__retry {
  padding: 0.3rem 0.7rem;
  border-radius: 0.4rem;
  background: rgba(245, 63, 63, 0.18);
  color: #fff;
  border: 1px solid rgba(245, 63, 63, 0.45);
  cursor: pointer;
  font-size: 0.8rem;
  transition: background 0.2s;
}
.chat-image__retry:hover {
  background: rgba(245, 63, 63, 0.32);
}

/* 放大镜按钮：浮在右上角 */
.chat-image__zoom-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 2;
  width: 1.85rem;
  height: 1.85rem;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s, background 0.2s;
  backdrop-filter: blur(4px);
}
.chat-image:hover .chat-image__zoom-btn {
  opacity: 1;
}
.chat-image__zoom-btn:hover {
  background: rgba(0, 0, 0, 0.75);
}

@keyframes chat-image-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>