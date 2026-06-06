<script setup lang="ts">
/**
 * 根应用
 * 全站采用"视口驱动的根字号 + 流体布局"实现响应式适配：
 *  - html 根字号随视口宽度平滑缩放（global.css 中通过 clamp 设置）
 *  - 关键尺寸使用 rem / clamp() / vw / vh 自适应不同比例屏幕
 *  - 页面布局使用 flex/grid，确保铺满浏览器可视区域
 */
</script>

<template>
  <RouterView />
</template>
