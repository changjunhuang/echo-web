<template>
  <div class="models-page">
    <!-- Hero section -->
    <section class="hero">
      <div class="hero-inner">
        <h1 class="hero-title">模型广场</h1>
        <p class="hero-subtitle">探索强大的 AI 模型，选择适合您业务场景的最优解决方案</p>
      </div>
    </section>

    <!-- Content -->
    <div class="content-wrapper">
      <!-- Category tabs -->
      <div class="category-tabs">
        <button
          v-for="cat in categories"
          :key="cat.key"
          class="category-tab"
          :class="{ 'category-tab--active': activeCategory === cat.key }"
          @click="activeCategory = cat.key"
        >
          <span class="tab-icon">{{ cat.icon }}</span>
          <span>{{ cat.label }}</span>
          <span class="tab-count">{{ getModelCount(cat.key) }}</span>
        </button>
      </div>

      <!-- Table section -->
      <div class="table-section">
        <div class="table-header-row">
          <h2 class="section-title">{{ currentCategoryLabel }}</h2>
          <div class="table-legend">
            <span class="legend-item"><span class="badge badge--new">NEW</span> 最新发布</span>
            <span class="legend-item"
              ><span class="badge badge--recommended">推荐</span> 官方推荐</span
            >
          </div>
        </div>

        <!-- Model comparison table -->
        <div class="model-table-wrapper">
          <table class="model-table">
            <thead>
              <tr>
                <th class="col-model">模型名称</th>
                <th class="col-context">上下文窗口</th>
                <th class="col-output">最大输出</th>
                <th class="col-price">输入价格</th>
                <th class="col-price">输出价格</th>
                <th class="col-features">功能特性</th>
                <th class="col-action"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="model in filteredModels"
                :key="model.id"
                class="model-row"
                @click="selectModel(model)"
                :class="{ 'model-row--selected': selectedModel?.id === model.id }"
              >
                <td class="col-model">
                  <div class="model-info">
                    <div class="model-name-row">
                      <span class="model-name">{{ model.name }}</span>
                      <span v-if="model.isNew" class="badge badge--new">NEW</span>
                      <span v-if="model.isRecommended" class="badge badge--recommended">推荐</span>
                    </div>
                    <code class="model-api-name">{{ model.apiName }}</code>
                    <p class="model-description">{{ model.description }}</p>
                  </div>
                </td>
                <td class="col-context">
                  <span class="metric-value">{{ formatTokens(model.contextWindow) }}</span>
                </td>
                <td class="col-output">
                  <span class="metric-value">{{ formatTokens(model.maxOutputTokens) }}</span>
                </td>
                <td class="col-price">
                  <div class="price-cell">
                    <span class="price-value">¥{{ model.inputPricePerMillion }}</span>
                    <span class="price-unit">/M tokens</span>
                  </div>
                </td>
                <td class="col-price">
                  <div class="price-cell">
                    <span class="price-value">¥{{ model.outputPricePerMillion }}</span>
                    <span class="price-unit">/M tokens</span>
                  </div>
                </td>
                <td class="col-features">
                  <div class="feature-tags">
                    <span v-for="feature in model.features" :key="feature" class="feature-tag">
                      {{ feature }}
                    </span>
                  </div>
                </td>
                <td class="col-action">
                  <RouterLink to="/chat" class="try-btn" @click.stop>
                    立即体验
                    <el-icon><ArrowRight /></el-icon>
                  </RouterLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Model detail panel -->
        <Transition name="slide-up">
          <div v-if="selectedModel" class="model-detail">
            <div class="detail-header">
              <div>
                <h3 class="detail-name">{{ selectedModel.name }}</h3>
                <code class="detail-api">{{ selectedModel.apiName }}</code>
              </div>
              <button class="detail-close" @click="selectedModel = null">
                <el-icon><Close /></el-icon>
              </button>
            </div>
            <p class="detail-description">{{ selectedModel.description }}</p>
            <div class="detail-stats">
              <div class="stat-card">
                <span class="stat-label">上下文窗口</span>
                <span class="stat-value">{{ formatTokens(selectedModel.contextWindow) }}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">最大输出</span>
                <span class="stat-value">{{ formatTokens(selectedModel.maxOutputTokens) }}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">输入价格</span>
                <span class="stat-value">¥{{ selectedModel.inputPricePerMillion }}/M</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">输出价格</span>
                <span class="stat-value">¥{{ selectedModel.outputPricePerMillion }}/M</span>
              </div>
            </div>
            <div class="detail-features">
              <span v-for="f in selectedModel.features" :key="f" class="feature-tag">{{ f }}</span>
            </div>
            <RouterLink to="/chat" class="detail-try-btn">开始对话</RouterLink>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ArrowRight, Close } from '@element-plus/icons-vue'
import type { ModelSpec, ModelCategory } from '@/types/model'

const categories = [
  { key: 'all' as const, label: '全部', icon: '✦' },
  { key: 'text' as const, label: '文本', icon: '📝' },
  { key: 'vision' as const, label: '视觉', icon: '👁️' },
  { key: 'audio' as const, label: '语音', icon: '🎙️' },
  { key: 'embedding' as const, label: '嵌入', icon: '🔢' },
]

type CategoryKey = ModelCategory | 'all'

const activeCategory = ref<CategoryKey>('all')
const selectedModel = ref<ModelSpec | null>(null)

const models: ModelSpec[] = [
  {
    id: 'echo-max-1',
    name: 'Echo Max 1',
    apiName: 'echo-max-1',
    category: 'text',
    description: '旗舰级大语言模型，综合能力全面领先，适合复杂推理、长文创作与专业领域问答。',
    contextWindow: 1000000,
    maxOutputTokens: 32768,
    inputPricePerMillion: 8,
    outputPricePerMillion: 24,
    features: ['工具调用', '结构化输出', '长文档', '代码生成'],
    isNew: true,
    isRecommended: true,
  },
  {
    id: 'echo-pro-1',
    name: 'Echo Pro 1',
    apiName: 'echo-pro-1',
    category: 'text',
    description: '高性能均衡型模型，在推理能力与响应速度之间取得最佳平衡，适合大多数生产场景。',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputPricePerMillion: 2,
    outputPricePerMillion: 6,
    features: ['工具调用', '结构化输出', '代码生成'],
    isRecommended: true,
  },
  {
    id: 'echo-lite-1',
    name: 'Echo Lite 1',
    apiName: 'echo-lite-1',
    category: 'text',
    description: '轻量高速模型，极低延迟下提供优质文本生成，适合实时应用与高并发场景。',
    contextWindow: 32000,
    maxOutputTokens: 8192,
    inputPricePerMillion: 0.3,
    outputPricePerMillion: 1,
    features: ['高速响应', '低延迟', '代码生成'],
  },
  {
    id: 'echo-vision-1',
    name: 'Echo Vision 1',
    apiName: 'echo-vision-1',
    category: 'vision',
    description: '多模态视觉理解模型，支持图像、文档与视频理解，适合图文分析与视觉问答。',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    inputPricePerMillion: 4,
    outputPricePerMillion: 12,
    features: ['图像理解', '文档解析', '视频理解', '工具调用'],
    isNew: true,
  },
  {
    id: 'echo-audio-1',
    name: 'Echo Audio 1',
    apiName: 'echo-audio-1',
    category: 'audio',
    description: '语音识别与合成专用模型，支持多语言实时语音转写与自然语音合成。',
    contextWindow: 0,
    maxOutputTokens: 0,
    inputPricePerMillion: 0.5,
    outputPricePerMillion: 2,
    features: ['语音识别', '语音合成', '多语言', '实时流式'],
  },
  {
    id: 'echo-embed-1',
    name: 'Echo Embed 1',
    apiName: 'echo-embed-1',
    category: 'embedding',
    description: '高精度文本向量化模型，适合语义搜索、RAG 检索增强生成与文本分类任务。',
    contextWindow: 8192,
    maxOutputTokens: 0,
    inputPricePerMillion: 0.1,
    outputPricePerMillion: 0,
    features: ['语义搜索', 'RAG 检索', '文本分类', '多语言'],
  },
]

const filteredModels = computed(() => {
  if (activeCategory.value === 'all') return models
  return models.filter((m) => m.category === activeCategory.value)
})

const currentCategoryLabel = computed(() => {
  const cat = categories.find((c) => c.key === activeCategory.value)
  return cat ? `${cat.icon} ${cat.label}模型` : '全部模型'
})

function getModelCount(key: CategoryKey) {
  if (key === 'all') return models.length
  return models.filter((m) => m.category === key).length
}

function formatTokens(n: number): string {
  if (n === 0) return '—'
  if (n >= 1000000) return `${n / 1000000}M`
  if (n >= 1000) return `${n / 1000}K`
  return String(n)
}

function selectModel(model: ModelSpec) {
  selectedModel.value = selectedModel.value?.id === model.id ? null : model
}
</script>

<style scoped>
.models-page {
  background-color: #0a0a10;
  min-height: 100vh;
  color: #fff;
}

/* Hero */
.hero {
  padding: 72px 24px 56px;
  background: linear-gradient(
    180deg,
    rgba(22, 93, 255, 0.12) 0%,
    rgba(10, 10, 16, 0) 100%
  );
  text-align: center;
}

.hero-inner {
  max-width: 640px;
  margin: 0 auto;
}

.hero-title {
  font-size: 48px;
  font-weight: 800;
  letter-spacing: -1.5px;
  background: linear-gradient(135deg, #fff 0%, rgba(255, 255, 255, 0.7) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0 0 16px;
}

.hero-subtitle {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.6;
  margin: 0;
}

/* Category tabs */
.content-wrapper {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 24px 80px;
}

.category-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 32px;
  flex-wrap: wrap;
}

.category-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 100px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.category-tab:hover {
  border-color: rgba(255, 255, 255, 0.25);
  color: rgba(255, 255, 255, 0.85);
}

.category-tab--active {
  background: rgba(22, 93, 255, 0.2);
  border-color: rgba(22, 93, 255, 0.5);
  color: #fff;
}

.tab-count {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  padding: 1px 7px;
  font-size: 12px;
}

.category-tab--active .tab-count {
  background: rgba(22, 93, 255, 0.4);
}

/* Table */
.table-section {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  overflow: hidden;
}

.table-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin: 0;
}

.table-legend {
  display: flex;
  gap: 16px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.badge--new {
  background: rgba(22, 93, 255, 0.2);
  color: #79abff;
  border: 1px solid rgba(22, 93, 255, 0.35);
}

.badge--recommended {
  background: rgba(var(--el-color-success-rgb), 0.15);
  color: #67c23a;
  border: 1px solid rgba(103, 194, 58, 0.3);
}

.model-table-wrapper {
  overflow-x: auto;
}

.model-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 900px;
}

.model-table th {
  padding: 14px 24px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  background: rgba(255, 255, 255, 0.02);
  white-space: nowrap;
}

.model-table td {
  padding: 20px 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  vertical-align: top;
}

.model-row {
  cursor: pointer;
  transition: background-color 0.15s;
}

.model-row:hover {
  background: rgba(255, 255, 255, 0.04);
}

.model-row--selected {
  background: rgba(22, 93, 255, 0.07);
}

.col-model {
  min-width: 280px;
}

.col-context,
.col-output {
  min-width: 120px;
}

.col-price {
  min-width: 140px;
}

.col-features {
  min-width: 200px;
}

.col-action {
  min-width: 120px;
  text-align: right;
}

.model-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.model-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.model-name {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
}

.model-api-name {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 7px;
  border-radius: 4px;
  margin-top: 2px;
}

.model-description {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.5;
  margin: 4px 0 0;
  max-width: 320px;
}

.metric-value {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  font-variant-numeric: tabular-nums;
}

.price-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.price-value {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}

.price-unit {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
}

.feature-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.feature-tag {
  padding: 3px 9px;
  border-radius: 100px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
}

.try-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 14px;
  border-radius: 8px;
  background: rgba(22, 93, 255, 0.15);
  border: 1px solid rgba(22, 93, 255, 0.3);
  color: #79abff;
  font-size: 13px;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
  transition: all 0.2s;
}

.try-btn:hover {
  background: rgba(22, 93, 255, 0.25);
  border-color: rgba(22, 93, 255, 0.5);
  color: #fff;
}

/* Model detail panel */
.model-detail {
  padding: 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(22, 93, 255, 0.05);
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}

.detail-name {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 4px;
}

.detail-api {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
  font-family: monospace;
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 8px;
  border-radius: 4px;
}

.detail-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: all 0.2s;
}

.detail-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.detail-description {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.6;
  margin: 0 0 20px;
}

.detail-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.stat-card {
  flex: 1;
  min-width: 120px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}

.detail-features {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}

.detail-try-btn {
  display: inline-flex;
  align-items: center;
  padding: 10px 24px;
  border-radius: 8px;
  background: #165dff;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: background-color 0.2s;
}

.detail-try-btn:hover {
  background: #3a7aff;
}

/* Transition */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.25s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
