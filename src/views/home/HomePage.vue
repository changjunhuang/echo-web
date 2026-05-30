<template>
  <div class="home-page">
    <div class="home-content">
      <div class="home-header">
        <div class="home-logo">⚡</div>
        <h1 class="home-title">Echo Web</h1>
        <p class="home-subtitle">智能助手与文件管理平台</p>
      </div>

      <div class="home-cards">
        <div class="home-card" @click="goToChat">
          <div class="card-icon card-icon--chat">
            <el-icon :size="40"><ChatDotRound /></el-icon>
          </div>
          <div class="card-info">
            <h3 class="card-title">智能对话</h3>
            <p class="card-desc">与 AI 助手进行自然语言交互，获取信息与帮助</p>
          </div>
          <el-icon class="card-arrow"><ArrowRight /></el-icon>
        </div>

        <div class="home-card" @click="goToFile">
          <div class="card-icon card-icon--file">
            <el-icon :size="40"><Folder /></el-icon>
          </div>
          <div class="card-info">
            <h3 class="card-title">文件管理</h3>
            <p class="card-desc">上传、查看和管理您的文件资源</p>
          </div>
          <el-icon class="card-arrow"><ArrowRight /></el-icon>
        </div>
      </div>

      <div class="home-footer">
        <p>基于 AI 技术构建，提供智能对话与文件管理服务</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ChatDotRound, Folder, ArrowRight } from '@element-plus/icons-vue'

const router = useRouter()

function goToChat() {
  router.push('/chat')
}

function goToFile() {
  router.push('/admin/upload')
}
</script>

<style scoped>
.home-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 60px);
  background: linear-gradient(135deg, #0a0a10 0%, #1a1a2e 50%, #0a0a10 100%);
  padding: 40px 20px;
}

.home-content {
  width: 100%;
  max-width: 720px;
  animation: fadeIn 0.6s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.home-header {
  text-align: center;
  margin-bottom: 48px;
}

.home-logo {
  font-size: 64px;
  margin-bottom: 16px;
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

.home-title {
  font-size: 42px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 12px;
  letter-spacing: -1px;
  background: linear-gradient(135deg, #fff 0%, #79abff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.home-subtitle {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
  letter-spacing: 2px;
}

.home-cards {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.home-card {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 28px 32px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.home-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(22, 93, 255, 0.4);
  transform: translateX(8px);
}

.card-icon {
  width: 72px;
  height: 72px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-icon--chat {
  background: linear-gradient(135deg, rgba(22, 93, 255, 0.3) 0%, rgba(22, 93, 255, 0.1) 100%);
  color: #79abff;
}

.card-icon--file {
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.3) 0%, rgba(64, 158, 255, 0.1) 100%);
  color: #40a9ff;
}

.card-info {
  flex: 1;
}

.card-title {
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 8px;
}

.card-desc {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
  line-height: 1.5;
}

.card-arrow {
  font-size: 24px;
  color: rgba(255, 255, 255, 0.3);
  transition: all 0.3s ease;
}

.home-card:hover .card-arrow {
  color: rgba(255, 255, 255, 0.8);
  transform: translateX(4px);
}

.home-footer {
  text-align: center;
  margin-top: 48px;
}

.home-footer p {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.3);
  margin: 0;
}
</style>