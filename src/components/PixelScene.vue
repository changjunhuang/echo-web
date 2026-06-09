<template>
  <div class="pixel-scene" :class="`pixel-scene--${activeScene.id}`" :data-scene="activeScene.id">
    <!-- 背景渐变层（覆盖整个画面） -->
    <div class="pixel-scene__gradient" :style="{ background: activeScene.gradient }" />

    <!-- 场景层：使用 SVG 绘制像素风背景元素（viewBox 200×120：更细的像素粒度） -->
    <svg
      class="pixel-scene__svg"
      viewBox="0 0 200 120"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      shape-rendering="crispEdges"
      aria-hidden="true"
    >
      <!-- 户外天体：太阳 / 月亮 / 星 / 云 -->
      <g v-if="activeScene.outdoor" class="scene-celestial">
        <!-- 太阳 -->
        <g v-if="activeScene.sun">
          <circle
            :cx="activeScene.sun.x"
            :cy="activeScene.sun.y"
            :r="activeScene.sun.r"
            :fill="activeScene.sun.color"
            :class="['scene-sun', activeScene.sun.glow ? 'scene-sun--glow' : '']"
          />
          <!-- 太阳光晕外圈（更柔和） -->
          <circle
            v-if="activeScene.sun.glow"
            :cx="activeScene.sun.x"
            :cy="activeScene.sun.y"
            :r="activeScene.sun.r + 2"
            fill="none"
            :stroke="activeScene.sun.color"
            stroke-width="0.4"
            opacity="0.45"
          />
        </g>
        <!-- 月亮 -->
        <g v-if="activeScene.moon">
          <circle
            :cx="activeScene.moon.x"
            :cy="activeScene.moon.y"
            :r="activeScene.moon.r"
            fill="#fef6d8"
            class="scene-moon"
          />
          <!-- 月相阴影斑 -->
          <circle
            :cx="activeScene.moon.x - 1.2"
            :cy="activeScene.moon.y - 0.6"
            :r="0.8"
            fill="#d8c8a0"
            opacity="0.5"
          />
          <circle
            :cx="activeScene.moon.x + 0.6"
            :cy="activeScene.moon.y + 0.8"
            :r="0.5"
            fill="#d8c8a0"
            opacity="0.4"
          />
        </g>
        <!-- 星星 -->
        <rect
          v-for="(star, i) in stars"
          :key="`star-${i}`"
          :x="star.x"
          :y="star.y"
          :width="star.size"
          :height="star.size"
          fill="#fff"
          :style="{ animationDelay: `${star.delay}s` }"
          class="scene-star"
        />
        <!-- 云朵：分两层（高光 + 主体） -->
        <g
          v-for="(cloud, i) in activeScene.clouds"
          :key="`cloud-${i}`"
          :style="{ animationDelay: `${cloud.delay}s`, animationDuration: `${cloud.dur ?? 80}s` }"
          class="scene-cloud"
        >
          <rect :x="cloud.x" :y="cloud.y" :width="cloud.w" :height="cloud.h" :fill="cloud.color" />
          <rect :x="cloud.x + 1" :y="cloud.y - 1" :width="cloud.w - 2" :height="1" :fill="cloud.color" />
          <rect :x="cloud.x - 1" :y="cloud.y + cloud.h - 1" :width="cloud.w + 2" :height="1" :fill="cloud.color" opacity="0.7" />
        </g>
      </g>

      <!-- 远景层：远山 / 城市轮廓 / 远景树 -->
      <g v-if="activeScene.farLayer" class="scene-far">
        <rect
          v-for="(m, i) in activeScene.farLayer"
          :key="`far-${i}`"
          :x="m.x"
          :y="m.y"
          :width="m.w"
          :height="m.h"
          :fill="m.color"
          :opacity="m.opacity ?? 1"
        />
      </g>

      <!-- 中景层：建筑 / 树 / 室内家具 -->
      <g v-if="activeScene.midLayer" class="scene-mid">
        <rect
          v-for="(m, i) in activeScene.midLayer"
          :key="`mid-${i}`"
          :x="m.x"
          :y="m.y"
          :width="m.w"
          :height="m.h"
          :fill="m.color"
          :opacity="m.opacity ?? 1"
        />
      </g>

      <!-- 地面 -->
      <rect x="0" :y="activeScene.groundY" width="200" :height="120 - activeScene.groundY" :fill="activeScene.groundColor" />

      <!-- 地面装饰 -->
      <g v-if="activeScene.groundDecor" class="scene-ground-decor">
        <rect
          v-for="(m, i) in activeScene.groundDecor"
          :key="`gd-${i}`"
          :x="m.x"
          :y="m.y"
          :width="m.w"
          :height="m.h"
          :fill="m.color"
          :opacity="m.opacity ?? 1"
        />
      </g>
    </svg>

    <!-- 粒子层：浮云 / 室内光斑 / 雪花 / 萤火 -->
    <div class="pixel-scene__particles">
      <span
        v-for="(p, i) in particles"
        :key="`p-${i}`"
        class="pixel-scene__particle"
        :class="`pixel-scene__particle--${p.kind}`"
        :style="{
          left: `${p.x}%`,
          top: `${p.y}%`,
          width: `${p.size}px`,
          height: `${p.size}px`,
          background: p.color,
          opacity: p.opacity,
          animationDuration: `${p.dur}s`,
          animationDelay: `${p.delay}s`,
        }"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * PixelScene 背景组件（高分辨率 200×120 · 按小时切换）
 *
 * 与上一版对比：
 *  - viewBox 由 100×60 升级到 200×120，像素粒度变小一倍 → 细节更精致
 *  - 场景元素更丰富：远山 / 海平面反光 / 多层树木 / 萤火 / 飘雪 / 路灯…
 *  - 切换策略改为"按小时为单位"：
 *      · 初始场景按当前小时所在时段（早 / 午 / 黄昏 / 夜）随机挑选
 *      · 下一次切换对齐到下一个整点（HH:00:00），之后每整点切一次
 *      · 同时段内随机不重复挑选，给同一时间段每小时一点新鲜感
 *  - 多类粒子：dust 室内尘埃 / firefly 萤火 / snow 雪花 / cloud 漂浮云
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/** 通用像素矩形（带颜色） */
export interface PixelRect {
  x: number
  y: number
  w: number
  h: number
  color: string
  /** 可选透明度（0~1）；不传按 1 处理 */
  opacity?: number
}

/** 云朵参数 */
interface Cloud {
  x: number
  y: number
  w: number
  h: number
  color: string
  delay: number
  /** 横向飘动周期（秒），不传走默认 80s */
  dur?: number
}

/** 太阳 / 月亮 */
interface Celestial {
  x: number
  y: number
  r: number
  color?: string
  glow?: boolean
}

/** 时段标记：早晨 / 白天 / 黄昏 / 夜晚 */
type DayPart = 'morning' | 'day' | 'sunset' | 'night'

/** 粒子类型 */
type ParticleKind = 'none' | 'cloud' | 'dust' | 'firefly' | 'snow'

/** 场景定义 */
interface Scene {
  id: string
  label: string
  /** 所属时段：用于按小时挑选 */
  dayParts: ReadonlyArray<DayPart>
  gradient: string
  outdoor: boolean
  groundY: number
  groundColor: string
  groundDecor?: PixelRect[]
  farLayer?: PixelRect[]
  midLayer?: PixelRect[]
  clouds?: Cloud[]
  sun?: Celestial
  moon?: Celestial
  /** 星星数量；为 0 / undefined 时不绘制 */
  stars?: number
  particleKind: ParticleKind
}

/* ---------- 场景库 ---------- */

const PARK_DAY: Scene = {
  id: 'park-day',
  label: '日间公园',
  dayParts: ['morning', 'day'],
  gradient: 'linear-gradient(180deg, #87ceeb 0%, #b4e0ff 55%, #d6f0ff 100%)',
  outdoor: true,
  groundY: 96,
  groundColor: '#7cb86b',
  groundDecor: [
    // 草地条纹
    { x: 0, y: 100, w: 200, h: 0.8, color: '#5fa14f' },
    { x: 0, y: 108, w: 200, h: 0.6, color: '#5fa14f' },
    // 散落小花
    { x: 12, y: 104, w: 2, h: 2, color: '#ffeb6b' },
    { x: 28, y: 110, w: 2, h: 2, color: '#f48fb1' },
    { x: 46, y: 106, w: 2, h: 2, color: '#ba68c8' },
    { x: 64, y: 112, w: 2, h: 2, color: '#ffeb6b' },
    { x: 82, y: 105, w: 2, h: 2, color: '#fff' },
    { x: 102, y: 109, w: 2, h: 2, color: '#f48fb1' },
    { x: 124, y: 104, w: 2, h: 2, color: '#ba68c8' },
    { x: 144, y: 110, w: 2, h: 2, color: '#ffeb6b' },
    { x: 162, y: 106, w: 2, h: 2, color: '#fff' },
    { x: 180, y: 108, w: 2, h: 2, color: '#f48fb1' },
    // 路径（浅黄）
    { x: 70, y: 100, w: 60, h: 2, color: '#e7d49b' },
    { x: 64, y: 102, w: 72, h: 2, color: '#e7d49b' },
    { x: 60, y: 104, w: 80, h: 2, color: '#e7d49b' },
  ],
  farLayer: [
    // 远山 3 层
    { x: 0, y: 72, w: 56, h: 24, color: '#7da3c4' },
    { x: 50, y: 76, w: 50, h: 20, color: '#8aafcc' },
    { x: 92, y: 70, w: 60, h: 26, color: '#7597b8' },
    { x: 144, y: 78, w: 56, h: 18, color: '#8aafcc' },
    // 远树轮廓
    { x: 20, y: 86, w: 8, h: 10, color: '#6a8e94' },
    { x: 168, y: 84, w: 10, h: 12, color: '#6a8e94' },
  ],
  midLayer: [
    // 大树 1（左）
    { x: 14, y: 60, w: 16, h: 18, color: '#3b6b2e' },
    { x: 16, y: 56, w: 12, h: 6, color: '#4a8540' },
    { x: 20, y: 54, w: 6, h: 4, color: '#5fa14f' },
    { x: 20, y: 78, w: 4, h: 18, color: '#5a3a22' },
    // 大树 2（右）
    { x: 156, y: 58, w: 20, h: 20, color: '#3b6b2e' },
    { x: 160, y: 54, w: 12, h: 5, color: '#4a8540' },
    { x: 162, y: 52, w: 8, h: 3, color: '#5fa14f' },
    { x: 164, y: 78, w: 4, h: 18, color: '#5a3a22' },
    // 灌木
    { x: 96, y: 88, w: 10, h: 8, color: '#4a8540' },
    { x: 100, y: 84, w: 4, h: 5, color: '#5fa14f' },
    // 长椅
    { x: 116, y: 90, w: 18, h: 1.5, color: '#7a4a2a' },
    { x: 118, y: 91.5, w: 1.5, h: 5, color: '#7a4a2a' },
    { x: 130, y: 91.5, w: 1.5, h: 5, color: '#7a4a2a' },
  ],
  clouds: [
    { x: 16, y: 14, w: 18, h: 3.5, color: '#fff', delay: 0, dur: 110 },
    { x: 80, y: 8, w: 26, h: 4, color: '#fff', delay: -22, dur: 90 },
    { x: 150, y: 20, w: 22, h: 3, color: '#fff', delay: -50, dur: 100 },
  ],
  sun: { x: 168, y: 20, r: 8, color: '#ffe066', glow: true },
  particleKind: 'cloud',
}

const SUNSET_BEACH: Scene = {
  id: 'sunset-beach',
  label: '黄昏海滩',
  dayParts: ['sunset'],
  gradient:
    'linear-gradient(180deg, #ff6b6b 0%, #ff9472 24%, #ffb88a 50%, #ffd6a5 80%, #ffe6c7 100%)',
  outdoor: true,
  groundY: 90,
  groundColor: '#f4d29c',
  groundDecor: [
    { x: 0, y: 96, w: 200, h: 1, color: '#d9a86a' },
    // 海面反光
    { x: 0, y: 84, w: 200, h: 1, color: '#ffb88a', },
    { x: 0, y: 82, w: 200, h: 0.5, color: '#ffd6a5' },
    // 沙滩贝壳
    { x: 20, y: 104, w: 1.2, h: 1.2, color: '#fff' },
    { x: 50, y: 110, w: 1.2, h: 1.2, color: '#fff' },
    { x: 100, y: 106, w: 1.2, h: 1.2, color: '#fff' },
    { x: 140, y: 112, w: 1.2, h: 1.2, color: '#fff' },
    { x: 176, y: 105, w: 1.2, h: 1.2, color: '#fff' },
    // 太阳水中倒影
    { x: 96, y: 86, w: 12, h: 1, color: '#ffd166' },
    { x: 92, y: 88, w: 20, h: 0.6, color: '#ffd166' },
  ],
  farLayer: [
    // 海平面
    { x: 0, y: 84, w: 200, h: 8, color: '#5a7da0' },
    { x: 0, y: 80, w: 200, h: 4, color: '#7a9abc' },
    // 远帆船 1
    { x: 32, y: 78, w: 2, h: 4, color: '#3a3a4a' },
    { x: 30, y: 80, w: 6, h: 2, color: '#3a3a4a' },
    // 远帆船 2
    { x: 140, y: 80, w: 1.5, h: 3, color: '#3a3a4a' },
    { x: 138, y: 82, w: 5, h: 1.5, color: '#3a3a4a' },
  ],
  midLayer: [
    // 椰子树（右）
    { x: 176, y: 44, w: 2, h: 48, color: '#5a3a22' },
    { x: 168, y: 44, w: 16, h: 2, color: '#3b6b2e' },
    { x: 172, y: 40, w: 12, h: 2, color: '#4a8540' },
    { x: 178, y: 48, w: 8, h: 2, color: '#3b6b2e' },
    { x: 174, y: 50, w: 6, h: 2, color: '#4a8540' },
    // 椰子
    { x: 174, y: 46, w: 2, h: 2, color: '#5a3a22' },
    // 椰子树（左 · 远处更小）
    { x: 22, y: 56, w: 1.5, h: 36, color: '#5a3a22' },
    { x: 16, y: 56, w: 12, h: 1.5, color: '#3b6b2e' },
    { x: 20, y: 53, w: 8, h: 1.5, color: '#4a8540' },
  ],
  clouds: [
    { x: 40, y: 24, w: 28, h: 3, color: '#ff9a8b', delay: 0, dur: 120 },
    { x: 110, y: 30, w: 36, h: 3, color: '#ffc5a0', delay: -22, dur: 140 },
  ],
  sun: { x: 100, y: 64, r: 10, color: '#ffd166', glow: true },
  particleKind: 'cloud',
}

const STARRY_NIGHT: Scene = {
  id: 'starry-night',
  label: '星空之夜',
  dayParts: ['night'],
  gradient: 'linear-gradient(180deg, #0a0a2e 0%, #1a1a4a 50%, #2d2d6b 100%)',
  outdoor: true,
  groundY: 100,
  groundColor: '#10142a',
  groundDecor: [
    { x: 0, y: 102, w: 200, h: 0.6, color: '#3a3a6a' },
    // 远处灯光（隐约光点）
    { x: 30, y: 90, w: 1, h: 1, color: '#ffe9a0', opacity: 0.6 },
    { x: 78, y: 92, w: 1, h: 1, color: '#ffe9a0' },
    { x: 130, y: 91, w: 1, h: 1, color: '#ffe9a0' },
    { x: 170, y: 93, w: 1, h: 1, color: '#ffe9a0' },
  ],
  farLayer: [
    // 远山剪影
    { x: 0, y: 84, w: 60, h: 16, color: '#0a0a1a' },
    { x: 56, y: 80, w: 50, h: 20, color: '#0a0a1a' },
    { x: 100, y: 86, w: 48, h: 14, color: '#0a0a1a' },
    { x: 140, y: 82, w: 60, h: 18, color: '#0a0a1a' },
  ],
  midLayer: [
    // 树剪影 1
    { x: 18, y: 70, w: 12, h: 30, color: '#0a0a1a' },
    { x: 22, y: 66, w: 6, h: 4, color: '#0a0a1a' },
    { x: 24, y: 64, w: 4, h: 2, color: '#0a0a1a' },
    // 树剪影 2
    { x: 162, y: 74, w: 14, h: 26, color: '#0a0a1a' },
    { x: 166, y: 70, w: 6, h: 5, color: '#0a0a1a' },
    // 远城市天际线
    { x: 64, y: 92, w: 4, h: 8, color: '#1a1a3a' },
    { x: 70, y: 88, w: 3, h: 12, color: '#1a1a3a' },
    { x: 76, y: 94, w: 4, h: 6, color: '#1a1a3a' },
    { x: 84, y: 86, w: 4, h: 14, color: '#1a1a3a' },
    { x: 90, y: 92, w: 3, h: 8, color: '#1a1a3a' },
  ],
  moon: { x: 156, y: 22, r: 8 },
  stars: 110,
  particleKind: 'firefly',
}

const FOREST_PATH: Scene = {
  id: 'forest-path',
  label: '林间小径',
  dayParts: ['morning', 'day'],
  gradient: 'linear-gradient(180deg, #a8d8a8 0%, #c5e8b5 50%, #b8d8a0 100%)',
  outdoor: true,
  groundY: 96,
  groundColor: '#8b6b3a',
  groundDecor: [
    { x: 0, y: 100, w: 200, h: 0.6, color: '#5a4520' },
    // 弯曲小径
    { x: 60, y: 96, w: 80, h: 0.8, color: '#5a4520' },
    { x: 70, y: 104, w: 60, h: 0.8, color: '#5a4520' },
    // 石头
    { x: 26, y: 102, w: 3, h: 2, color: '#a0a0a0' },
    { x: 28, y: 104, w: 4, h: 2, color: '#888' },
    { x: 168, y: 108, w: 4, h: 2.5, color: '#888' },
    { x: 170, y: 110, w: 3, h: 2, color: '#a0a0a0' },
  ],
  farLayer: [
    // 远林深处
    { x: 0, y: 56, w: 24, h: 40, color: '#3b6b2e' },
    { x: 20, y: 60, w: 22, h: 36, color: '#4a8540' },
    { x: 40, y: 58, w: 24, h: 38, color: '#3b6b2e' },
    { x: 140, y: 58, w: 24, h: 38, color: '#3b6b2e' },
    { x: 160, y: 60, w: 22, h: 36, color: '#4a8540' },
    { x: 180, y: 56, w: 20, h: 40, color: '#3b6b2e' },
  ],
  midLayer: [
    // 大树近景（左）
    { x: 6, y: 44, w: 22, h: 52, color: '#2d5520' },
    { x: 10, y: 40, w: 14, h: 5, color: '#3b6b2e' },
    { x: 14, y: 36, w: 8, h: 5, color: '#4a8540' },
    // 大树近景（右）
    { x: 172, y: 44, w: 22, h: 52, color: '#2d5520' },
    { x: 176, y: 40, w: 14, h: 5, color: '#3b6b2e' },
    { x: 180, y: 36, w: 8, h: 5, color: '#4a8540' },
    // 小蘑菇（点缀）
    { x: 40, y: 98, w: 3, h: 2, color: '#e53935' },
    { x: 40, y: 100, w: 4, h: 1, color: '#fff' },
    { x: 156, y: 98, w: 3, h: 2, color: '#e53935' },
    { x: 156, y: 100, w: 4, h: 1, color: '#fff' },
    // 蝴蝶（小色块）
    { x: 96, y: 50, w: 1, h: 1, color: '#ffeb6b' },
    { x: 98, y: 50, w: 1, h: 1, color: '#ffeb6b' },
  ],
  clouds: [
    { x: 60, y: 12, w: 22, h: 2.5, color: '#fff', delay: 0, dur: 110 },
    { x: 140, y: 16, w: 18, h: 2.5, color: '#fff', delay: -30, dur: 110 },
  ],
  sun: { x: 34, y: 16, r: 6, color: '#ffe066', glow: true },
  particleKind: 'cloud',
}

const COZY_ROOM: Scene = {
  id: 'cozy-room',
  label: '温馨卧室',
  dayParts: ['night'],
  gradient: 'linear-gradient(180deg, #4a3a5a 0%, #6a4a6a 50%, #3a2a4a 100%)',
  outdoor: false,
  groundY: 98,
  groundColor: '#3a2a3a',
  groundDecor: [
    // 木地板条纹
    { x: 0, y: 100, w: 200, h: 0.6, color: '#2a1a2a' },
    { x: 40, y: 106, w: 200, h: 0.4, color: '#2a1a2a' },
    { x: 0, y: 112, w: 200, h: 0.4, color: '#2a1a2a' },
  ],
  farLayer: [
    // 壁纸
    { x: 0, y: 0, w: 200, h: 98, color: '#5a3a5a' },
    // 墙画
    { x: 76, y: 28, w: 24, h: 16, color: '#3a2a3a' },
    { x: 78, y: 30, w: 20, h: 12, color: '#ffd6a5' },
    { x: 80, y: 32, w: 16, h: 8, color: '#ffe6c7' },
    // 装饰条
    { x: 0, y: 18, w: 200, h: 0.5, color: '#7a5a7a' },
    { x: 0, y: 56, w: 200, h: 0.5, color: '#7a5a7a' },
  ],
  midLayer: [
    // 窗户
    { x: 16, y: 24, w: 28, h: 36, color: '#2a1a3a' },
    { x: 18, y: 26, w: 24, h: 32, color: '#1a2a4a' },
    { x: 29, y: 26, w: 1, h: 32, color: '#5a3a5a' },
    { x: 18, y: 40, w: 24, h: 1, color: '#5a3a5a' },
    // 窗外月光投射
    { x: 22, y: 30, w: 4, h: 4, color: '#fff', opacity: 0.85 },
    { x: 32, y: 44, w: 2, h: 2, color: '#fff' },
    // 床
    { x: 138, y: 76, w: 56, h: 22, color: '#7a3a5a' },
    { x: 138, y: 72, w: 56, h: 4, color: '#9a5a7a' },
    { x: 144, y: 68, w: 16, h: 4, color: '#fff' },
    // 床头柜 + 台灯
    { x: 122, y: 84, w: 12, h: 14, color: '#5a3a3a' },
    { x: 126, y: 76, w: 4, h: 8, color: '#5a3a3a' },
    { x: 122, y: 70, w: 12, h: 7, color: '#ffd6a5' },
    { x: 124, y: 72, w: 8, h: 4, color: '#ffe6c7' },
    // 地毯
    { x: 56, y: 100, w: 80, h: 8, color: '#8a4a6a' },
    { x: 58, y: 102, w: 76, h: 4, color: '#9a5a7a' },
    // 时钟
    { x: 100, y: 18, w: 8, h: 8, color: '#5a3a5a' },
    { x: 102, y: 20, w: 4, h: 4, color: '#ffe6c7' },
  ],
  particleKind: 'dust',
}

const CAFE: Scene = {
  id: 'cafe',
  label: '咖啡厅',
  dayParts: ['day', 'sunset'],
  gradient: 'linear-gradient(180deg, #6b3a2a 0%, #8b5a3a 50%, #5a2a1a 100%)',
  outdoor: false,
  groundY: 100,
  groundColor: '#3a1a0a',
  groundDecor: [
    { x: 0, y: 102, w: 200, h: 0.6, color: '#1a0a00' },
    // 地砖格
    { x: 24, y: 104, w: 0.5, h: 16, color: '#1a0a00' },
    { x: 60, y: 104, w: 0.5, h: 16, color: '#1a0a00' },
    { x: 96, y: 104, w: 0.5, h: 16, color: '#1a0a00' },
    { x: 132, y: 104, w: 0.5, h: 16, color: '#1a0a00' },
    { x: 168, y: 104, w: 0.5, h: 16, color: '#1a0a00' },
  ],
  farLayer: [
    // 砖墙
    { x: 0, y: 0, w: 200, h: 100, color: '#7a4a2a' },
    // 砖块横线
    { x: 0, y: 14, w: 200, h: 0.5, color: '#5a2a1a' },
    { x: 0, y: 30, w: 200, h: 0.5, color: '#5a2a1a' },
    { x: 0, y: 46, w: 200, h: 0.5, color: '#5a2a1a' },
    { x: 0, y: 62, w: 200, h: 0.5, color: '#5a2a1a' },
    { x: 0, y: 78, w: 200, h: 0.5, color: '#5a2a1a' },
    // 砖块竖线（错位）
    { x: 20, y: 0, w: 0.4, h: 14, color: '#5a2a1a' },
    { x: 60, y: 0, w: 0.4, h: 14, color: '#5a2a1a' },
    { x: 40, y: 14, w: 0.4, h: 16, color: '#5a2a1a' },
    { x: 80, y: 14, w: 0.4, h: 16, color: '#5a2a1a' },
  ],
  midLayer: [
    // 大型菜单牌
    { x: 140, y: 14, w: 48, h: 32, color: '#2a1a0a' },
    { x: 142, y: 16, w: 44, h: 28, color: '#f4e4c1' },
    { x: 146, y: 22, w: 36, h: 0.5, color: '#5a3a1a' },
    { x: 146, y: 28, w: 28, h: 0.5, color: '#5a3a1a' },
    { x: 146, y: 34, w: 32, h: 0.5, color: '#5a3a1a' },
    { x: 146, y: 40, w: 24, h: 0.5, color: '#5a3a1a' },
    // 吊灯
    { x: 60, y: 0, w: 0.6, h: 18, color: '#3a2a1a' },
    { x: 55, y: 18, w: 12, h: 4, color: '#ffe9a0' },
    { x: 57, y: 22, w: 8, h: 2, color: '#ffd166' },
    // 咖啡杯
    { x: 36, y: 86, w: 10, h: 10, color: '#fff' },
    { x: 38, y: 88, w: 6, h: 6, color: '#5a2a1a' },
    { x: 38, y: 87, w: 6, h: 1, color: '#7a3a2a' },
    { x: 46, y: 90, w: 2, h: 4, color: '#fff' },
    // 杯垫
    { x: 32, y: 96, w: 18, h: 1.5, color: '#a07a4a' },
    // 桌子
    { x: 28, y: 98, w: 24, h: 4, color: '#a07a4a' },
    { x: 30, y: 102, w: 2, h: 8, color: '#7a4a2a' },
    { x: 48, y: 102, w: 2, h: 8, color: '#7a4a2a' },
  ],
  particleKind: 'dust',
}

const LIBRARY: Scene = {
  id: 'library',
  label: '书房',
  dayParts: ['day', 'sunset', 'night'],
  gradient: 'linear-gradient(180deg, #3a2a1a 0%, #5a4520 50%, #2a1a0a 100%)',
  outdoor: false,
  groundY: 104,
  groundColor: '#3a2510',
  groundDecor: [
    // 木地板
    { x: 0, y: 106, w: 200, h: 0.5, color: '#1a0a00' },
    { x: 50, y: 112, w: 0.4, h: 8, color: '#1a0a00' },
    { x: 100, y: 112, w: 0.4, h: 8, color: '#1a0a00' },
    { x: 150, y: 112, w: 0.4, h: 8, color: '#1a0a00' },
  ],
  farLayer: [
    // 左书架
    { x: 0, y: 12, w: 76, h: 92, color: '#5a3a1a' },
    // 右书架
    { x: 124, y: 12, w: 76, h: 92, color: '#5a3a1a' },
  ],
  midLayer: [
    // ===== 左书架：3 行书 =====
    ...buildBookRow(4, 16, 70, ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#d35400']),
    ...buildBookRow(4, 36, 70, ['#7f8c8d', '#e74c3c', '#3498db', '#1abc9c', '#e67e22', '#9b59b6', '#34495e']),
    ...buildBookRow(4, 56, 70, ['#16a085', '#d35400', '#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad']),
    // ===== 右书架：3 行书 =====
    ...buildBookRow(128, 16, 70, ['#3498db', '#e74c3c', '#27ae60', '#f39c12', '#8e44ad', '#16a085', '#d35400']),
    ...buildBookRow(128, 36, 70, ['#e67e22', '#9b59b6', '#34495e', '#e74c3c', '#3498db', '#1abc9c', '#e67e22']),
    ...buildBookRow(128, 56, 70, ['#1abc9c', '#e67e22', '#9b59b6', '#34495e', '#e74c3c', '#3498db', '#1abc9c']),
    // 中央书桌
    { x: 80, y: 80, w: 40, h: 4, color: '#6a3a20' },
    { x: 82, y: 84, w: 4, h: 20, color: '#5a3a1a' },
    { x: 114, y: 84, w: 4, h: 20, color: '#5a3a1a' },
    // 桌上书 + 烛台
    { x: 86, y: 74, w: 10, h: 6, color: '#c0392b' },
    { x: 86, y: 73, w: 10, h: 1, color: '#fff' },
    { x: 104, y: 68, w: 2, h: 12, color: '#7a4a2a' },
    { x: 102, y: 64, w: 6, h: 4, color: '#ffe9a0' },
    { x: 104, y: 60, w: 2, h: 4, color: '#ffd166' },
  ],
  particleKind: 'dust',
}

/**
 * 构造一排彩色书脊。
 * 给定起始 x、y、可用宽度、颜色循环数组，返回若干 PixelRect。
 * 每本书宽 3px、间隔 1px，高度在 12~16 之间随机（用 idx 取模制造层次）。
 */
function buildBookRow(startX: number, y: number, width: number, palette: string[]): PixelRect[] {
  const arr: PixelRect[] = []
  const bookW = 3
  const gap = 1
  const count = Math.floor(width / (bookW + gap))
  for (let i = 0; i < count; i++) {
    const h = 12 + ((i * 5) % 6) // 12 / 17 / 14 / 13 / 12 / 17 …
    const x = startX + i * (bookW + gap)
    arr.push({ x, y: y + (16 - h), w: bookW, h, color: palette[i % palette.length] })
    // 顶部高光
    arr.push({ x, y: y + (16 - h), w: bookW, h: 1, color: '#fff' })
  }
  return arr
}

const WINDOW_SEAT: Scene = {
  id: 'window-seat',
  label: '窗边阳光',
  dayParts: ['morning', 'day'],
  gradient: 'linear-gradient(180deg, #ffd6a5 0%, #ffe6c7 50%, #f4d29c 100%)',
  outdoor: false,
  groundY: 100,
  groundColor: '#d9a86a',
  groundDecor: [
    { x: 0, y: 102, w: 200, h: 0.5, color: '#a07a4a' },
    // 地板木纹
    { x: 50, y: 108, w: 0.3, h: 12, color: '#8a6a3a' },
    { x: 100, y: 108, w: 0.3, h: 12, color: '#8a6a3a' },
    { x: 150, y: 108, w: 0.3, h: 12, color: '#8a6a3a' },
  ],
  farLayer: [
    // 窗外远山
    { x: 0, y: 24, w: 200, h: 12, color: '#8aa8c4' },
    { x: 0, y: 16, w: 200, h: 10, color: '#b4d4f0' },
  ],
  midLayer: [
    // 大窗框
    { x: 20, y: 12, w: 120, h: 76, color: '#fff' },
    { x: 24, y: 16, w: 112, h: 68, color: '#b4d4f0' },
    { x: 78, y: 16, w: 4, h: 68, color: '#fff' },
    { x: 24, y: 48, w: 112, h: 4, color: '#fff' },
    // 窗台
    { x: 12, y: 88, w: 136, h: 4, color: '#fff' },
    // 窗帘
    { x: 12, y: 12, w: 8, h: 80, color: '#e89eb8' },
    { x: 140, y: 12, w: 8, h: 80, color: '#e89eb8' },
    // 窗帘褶
    { x: 16, y: 12, w: 1, h: 80, color: '#c97e98' },
    { x: 144, y: 12, w: 1, h: 80, color: '#c97e98' },
    // 盆栽
    { x: 28, y: 78, w: 12, h: 12, color: '#8b5a3c' },
    { x: 30, y: 70, w: 8, h: 8, color: '#4a8540' },
    { x: 32, y: 66, w: 4, h: 4, color: '#5fa14f' },
    // 书桌
    { x: 96, y: 72, w: 40, h: 16, color: '#8b5a3c' },
    { x: 96, y: 68, w: 40, h: 4, color: '#a07a4a' },
    { x: 100, y: 88, w: 4, h: 14, color: '#7a4a2a' },
    { x: 128, y: 88, w: 4, h: 14, color: '#7a4a2a' },
    // 书
    { x: 102, y: 60, w: 14, h: 8, color: '#c0392b' },
    { x: 102, y: 59, w: 14, h: 1, color: '#fff' },
    // 咖啡杯
    { x: 122, y: 62, w: 8, h: 6, color: '#fff' },
    { x: 124, y: 64, w: 4, h: 4, color: '#5a2a1a' },
    // 太阳光斑
    { x: 60, y: 100, w: 30, h: 2, color: '#fff7d0' },
  ],
  clouds: [
    { x: 40, y: 24, w: 16, h: 1.5, color: '#fff', delay: 0, dur: 90 },
    { x: 100, y: 30, w: 22, h: 1.5, color: '#fff', delay: -20, dur: 110 },
  ],
  sun: { x: 116, y: 26, r: 5, color: '#ffe066', glow: true },
  particleKind: 'dust',
}

const SNOWY_TOWN: Scene = {
  id: 'snowy-town',
  label: '雪夜小镇',
  dayParts: ['night', 'sunset'],
  gradient: 'linear-gradient(180deg, #2a3a5a 0%, #4a5a7a 50%, #8a98b8 100%)',
  outdoor: true,
  groundY: 96,
  groundColor: '#e0e8f0',
  groundDecor: [
    { x: 0, y: 100, w: 200, h: 0.4, color: '#aab8c8' },
    // 雪地脚印
    { x: 30, y: 108, w: 1, h: 0.6, color: '#aab8c8' },
    { x: 36, y: 110, w: 1, h: 0.6, color: '#aab8c8' },
    { x: 42, y: 108, w: 1, h: 0.6, color: '#aab8c8' },
    { x: 48, y: 110, w: 1, h: 0.6, color: '#aab8c8' },
    // 路灯光晕
    { x: 168, y: 96, w: 24, h: 2, color: '#fff7d0', opacity: 0.4 },
  ],
  farLayer: [
    // 远山雪
    { x: 0, y: 70, w: 60, h: 26, color: '#5a6a8a' },
    { x: 0, y: 68, w: 60, h: 2, color: '#fff' },
    { x: 56, y: 76, w: 50, h: 20, color: '#6a7a9a' },
    { x: 56, y: 74, w: 50, h: 2, color: '#fff' },
    { x: 100, y: 72, w: 60, h: 24, color: '#5a6a8a' },
    { x: 100, y: 70, w: 60, h: 2, color: '#fff' },
  ],
  midLayer: [
    // 小屋
    { x: 60, y: 70, w: 30, h: 26, color: '#7a4a3a' },
    // 屋顶（三角）
    { x: 58, y: 66, w: 34, h: 4, color: '#5a3a2a' },
    { x: 62, y: 62, w: 26, h: 4, color: '#5a3a2a' },
    { x: 66, y: 58, w: 18, h: 4, color: '#5a3a2a' },
    // 屋顶积雪
    { x: 58, y: 64, w: 34, h: 2, color: '#fff' },
    // 窗户
    { x: 66, y: 76, w: 8, h: 8, color: '#ffd87a' },
    { x: 78, y: 76, w: 8, h: 8, color: '#ffd87a' },
    // 烟囱
    { x: 78, y: 50, w: 4, h: 12, color: '#5a3a2a' },
    // 圣诞树
    { x: 24, y: 70, w: 8, h: 26, color: '#2d5520' },
    { x: 26, y: 64, w: 4, h: 6, color: '#3b6b2e' },
    { x: 27, y: 58, w: 2, h: 6, color: '#4a8540' },
    // 路灯
    { x: 178, y: 78, w: 1.5, h: 18, color: '#3a2a3a' },
    { x: 174, y: 74, w: 10, h: 4, color: '#ffd87a' },
    { x: 176, y: 70, w: 6, h: 4, color: '#7a5a3a' },
  ],
  moon: { x: 32, y: 22, r: 6 },
  stars: 40,
  particleKind: 'snow',
}

/** 全部可用场景 */
const SCENES: ReadonlyArray<Scene> = [
  PARK_DAY,
  SUNSET_BEACH,
  STARRY_NIGHT,
  FOREST_PATH,
  COZY_ROOM,
  CAFE,
  LIBRARY,
  WINDOW_SEAT,
  SNOWY_TOWN,
]

/* ---------- 时间段映射 ---------- */

/**
 * 根据当前小时返回时段。
 *  - 5~10 早晨
 *  - 10~16 白天
 *  - 16~19 黄昏
 *  - 19~5  夜晚
 */
function partOfHour(hour: number): DayPart {
  if (hour >= 5 && hour < 10) return 'morning'
  if (hour >= 10 && hour < 16) return 'day'
  if (hour >= 16 && hour < 19) return 'sunset'
  return 'night'
}

/* ---------- 状态与切换 ---------- */

const activeIndex = ref(0)
const activeScene = computed(() => SCENES[activeIndex.value])

/** 星星位置（缓存以避免每次重算） */
const stars = ref<Array<{ x: number; y: number; size: number; delay: number }>>([])
/** 粒子位置（缓存） */
const particles = ref<
  Array<{
    x: number
    y: number
    size: number
    color: string
    opacity: number
    dur: number
    delay: number
    kind: ParticleKind
  }>
>([])

/** 整点切换的定时器 */
let switchTimer: ReturnType<typeof setTimeout> | null = null

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * 选取下一个场景索引：
 *  - 按"下一个整点的小时"挑选时段
 *  - 在该时段候选池里随机挑一个，避免与当前重复
 *  - 若候选池只有 1 个（极端时段），退化为全场景随机非当前
 */
function pickIndexForHour(hour: number): number {
  const part = partOfHour(hour)
  const cur = activeIndex.value
  const candidates: number[] = []
  SCENES.forEach((s, i) => {
    if (i === cur) return
    if (s.dayParts.includes(part)) candidates.push(i)
  })
  if (candidates.length > 0) {
    return candidates[randInt(0, candidates.length - 1)]
  }
  // 兜底：全场景随机非当前
  const all: number[] = []
  SCENES.forEach((_, i) => {
    if (i !== cur) all.push(i)
  })
  return all[randInt(0, all.length - 1)] ?? cur
}

/**
 * 当前距离下一个整点的毫秒数。
 * 例如现在 14:23:18.500 → 返回 (60 - 23) * 60_000 - 18_500 = 2_201_500
 * 加 1 秒保险，避免边缘抖动正好踩在 :00 触发循环。
 */
function msUntilNextHour(): number {
  const now = new Date()
  const next = new Date(now)
  next.setHours(now.getHours() + 1, 0, 1, 0)
  return next.getTime() - now.getTime()
}

/** 排程到下一个整点；点火时切场景并重排下一次 */
function scheduleNextHourSwitch() {
  if (switchTimer) clearTimeout(switchTimer)
  const wait = msUntilNextHour()
  console.info('[scene] next switch in %d min', Math.round(wait / 60000))
  switchTimer = setTimeout(() => {
    const nextHour = new Date().getHours()
    activeIndex.value = pickIndexForHour(nextHour)
    refreshStars()
    refreshParticles()
    console.info('[scene] switched to %s (hour=%d)', activeScene.value.label, nextHour)
    scheduleNextHourSwitch()
  }, wait)
}

/** 根据当前场景生成粒子 */
function refreshParticles() {
  const scene = activeScene.value
  const next: typeof particles.value = []
  if (scene.particleKind === 'dust') {
    for (let i = 0; i < 18; i++) {
      next.push({
        x: randInt(0, 100),
        y: randInt(0, 80),
        size: randInt(2, 4),
        color: '#ffe6c7',
        opacity: 0.5,
        dur: randInt(7, 14),
        delay: randInt(0, 6),
        kind: 'dust',
      })
    }
  } else if (scene.particleKind === 'firefly') {
    for (let i = 0; i < 14; i++) {
      next.push({
        x: randInt(0, 100),
        y: randInt(40, 90),
        size: randInt(2, 4),
        color: '#fff7a0',
        opacity: 0.8,
        dur: randInt(4, 9),
        delay: randInt(0, 5),
        kind: 'firefly',
      })
    }
  } else if (scene.particleKind === 'snow') {
    for (let i = 0; i < 36; i++) {
      next.push({
        x: randInt(0, 100),
        y: randInt(-10, 100),
        size: randInt(2, 4),
        color: '#fff',
        opacity: randInt(60, 95) / 100,
        dur: randInt(8, 16),
        delay: randInt(0, 8),
        kind: 'snow',
      })
    }
  }
  particles.value = next
}

/** 根据当前场景生成星星 */
function refreshStars() {
  const scene = activeScene.value
  if (!scene.stars) {
    stars.value = []
    return
  }
  const arr: typeof stars.value = []
  for (let i = 0; i < scene.stars; i++) {
    arr.push({
      x: randInt(0, 1999) / 10,
      y: randInt(0, 600) / 10,
      size: Math.random() < 0.7 ? 0.5 : 0.9,
      delay: randInt(0, 30) / 10,
    })
  }
  stars.value = arr
}

/** 初始化：依据当前小时挑场景，并生成星 / 粒子 */
function initScene() {
  const hour = new Date().getHours()
  activeIndex.value = pickIndexForHour(hour)
  refreshStars()
  refreshParticles()
  console.info('[scene] initial scene=%s (hour=%d)', activeScene.value.label, hour)
}

onMounted(() => {
  initScene()
  scheduleNextHourSwitch()
})

onBeforeUnmount(() => {
  if (switchTimer) clearTimeout(switchTimer)
})
</script>

<style scoped>
.pixel-scene {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
  transition: opacity 0.8s ease;
}

.pixel-scene__gradient {
  position: absolute;
  inset: 0;
  transition: background 1s ease;
}

.pixel-scene__svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  transition: opacity 0.6s ease;
}

/* 太阳光晕 */
.scene-sun--glow {
  filter: drop-shadow(0 0 6px rgba(255, 224, 102, 0.8)) drop-shadow(0 0 14px rgba(255, 224, 102, 0.5));
  animation: scene-sun-pulse 4s ease-in-out infinite;
  transform-origin: center;
  transform-box: fill-box;
}
@keyframes scene-sun-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.06);
  }
}

/* 月光 */
.scene-moon {
  filter: drop-shadow(0 0 6px rgba(254, 246, 216, 0.6));
}

/* 星星闪烁 */
.scene-star {
  animation: scene-star-blink 1.8s ease-in-out infinite;
  transform-origin: center;
  transform-box: fill-box;
}
@keyframes scene-star-blink {
  0%,
  100% {
    opacity: 0.25;
    transform: scale(0.6);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

/* 云朵漂浮 */
.scene-cloud {
  animation: scene-cloud-drift 80s linear infinite;
  transform-origin: center;
  transform-box: fill-box;
}
@keyframes scene-cloud-drift {
  0% {
    transform: translateX(-12%);
  }
  100% {
    transform: translateX(112%);
  }
}

/* 粒子层 */
.pixel-scene__particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.pixel-scene__particle {
  position: absolute;
  border-radius: 50%;
  filter: blur(0.3px);
}

/* dust：缓慢上浮的尘埃 */
.pixel-scene__particle--dust {
  animation: scene-particle-dust 8s ease-in-out infinite;
}
@keyframes scene-particle-dust {
  0%,
  100% {
    transform: translate(0, 0);
  }
  25% {
    transform: translate(10px, -12px);
  }
  50% {
    transform: translate(0, -20px);
  }
  75% {
    transform: translate(-10px, -10px);
  }
}

/* firefly：闪烁明灭 */
.pixel-scene__particle--firefly {
  animation: scene-particle-firefly 5s ease-in-out infinite;
  box-shadow: 0 0 4px rgba(255, 247, 160, 0.85);
}
@keyframes scene-particle-firefly {
  0%,
  100% {
    transform: translate(0, 0);
    opacity: 0.3;
  }
  25% {
    transform: translate(6px, -8px);
    opacity: 1;
  }
  50% {
    transform: translate(-4px, -16px);
    opacity: 0.6;
  }
  75% {
    transform: translate(-8px, -6px);
    opacity: 1;
  }
}

/* snow：自上而下飘落 */
.pixel-scene__particle--snow {
  animation: scene-particle-snow 10s linear infinite;
}
@keyframes scene-particle-snow {
  0% {
    transform: translate(0, -10vh);
    opacity: 0.2;
  }
  10% {
    opacity: 0.9;
  }
  90% {
    opacity: 0.9;
  }
  100% {
    transform: translate(8px, 110vh);
    opacity: 0;
  }
}
</style>
