<template>
  <!--
    注册页
    - 注册人填写账号/密码/昵称/手机/邮箱/性别/生日/个性签名/头像
    - 注册成功后跳转回首页，自动触发登录弹窗
  -->
  <div class="register-page">
    <div class="register-card">
      <div class="register-header">
        <h2 class="register-title">创建账号</h2>
        <p class="register-subtitle">加入虚拟陪伴构建平台，开启你的 AI 体验</p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        class="register-form"
        @submit.prevent="handleRegister"
      >
        <div class="form-grid">
          <el-form-item label="账号" prop="username">
            <el-input
              v-model="form.username"
              placeholder="3-32 个字符，用于登录"
              clearable
              :prefix-icon="User"
              autocomplete="username"
            />
          </el-form-item>

          <el-form-item label="昵称" prop="nickname">
            <el-input
              v-model="form.nickname"
              placeholder="展示给其他用户的名字"
              clearable
              :prefix-icon="Avatar"
              maxlength="20"
            />
          </el-form-item>

          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="6-64 位，建议字母+数字组合"
              show-password
              :prefix-icon="Lock"
              autocomplete="new-password"
            />
          </el-form-item>

          <el-form-item label="确认密码" prop="confirmPassword">
            <el-input
              v-model="form.confirmPassword"
              type="password"
              placeholder="再次输入密码"
              show-password
              :prefix-icon="Lock"
              autocomplete="new-password"
            />
          </el-form-item>

          <el-form-item label="手机号" prop="phone">
            <el-input
              v-model="form.phone"
              placeholder="选填，便于找回账号"
              clearable
              :prefix-icon="Phone"
              maxlength="11"
            />
          </el-form-item>

          <el-form-item label="邮箱" prop="email">
            <el-input
              v-model="form.email"
              placeholder="选填，用于接收通知"
              clearable
              :prefix-icon="Message"
            />
          </el-form-item>

          <el-form-item label="性别" prop="gender">
            <el-radio-group v-model="form.gender">
              <el-radio value="male">男</el-radio>
              <el-radio value="female">女</el-radio>
              <el-radio value="other">其他</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="生日" prop="birthday">
            <el-date-picker
              v-model="form.birthday"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择日期"
              style="width: 100%"
            />
          </el-form-item>

          <el-form-item label="头像 (emoji 或 URL)" prop="avatar" class="form-grid__full">
            <el-input
              v-model="form.avatar"
              placeholder="例如：🦊 或 https://…/avatar.png"
              clearable
              :prefix-icon="Picture"
              maxlength="64"
            />
          </el-form-item>

          <el-form-item label="个性签名" prop="bio" class="form-grid__full">
            <el-input
              v-model="form.bio"
              type="textarea"
              :rows="2"
              :maxlength="120"
              show-word-limit
              placeholder="一句话介绍一下你自己（选填）"
            />
          </el-form-item>
        </div>

        <div class="register-actions">
          <el-button plain @click="goHome">返回首页</el-button>
          <el-button type="primary" :loading="submitting" @click="handleRegister">
            立即注册
          </el-button>
        </div>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  User,
  Lock,
  Phone,
  Message,
  Picture,
  Avatar,
} from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const formRef = ref<FormInstance | null>(null)
const submitting = ref(false)

const form = reactive({
  username: '',
  nickname: '',
  password: '',
  confirmPassword: '',
  phone: '',
  email: '',
  gender: 'other',
  birthday: '',
  avatar: '',
  bio: '',
})

/** 自定义校验：确认密码 */
const validateConfirmPassword = (_rule: unknown, value: string, callback: (err?: Error) => void) => {
  if (value === '') {
    callback(new Error('请再次输入密码'))
  } else if (value !== form.password) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const phoneRegex = /^1[3-9]\d{9}$/
const emailRegex = /^[\w.+-]+@[\w-]+\.[\w.-]+$/

const rules: FormRules = {
  username: [
    { required: true, message: '请输入账号', trigger: 'blur' },
    { min: 3, max: 32, message: '账号长度 3-32 个字符', trigger: 'blur' },
  ],
  nickname: [
    { required: true, message: '请输入昵称', trigger: 'blur' },
    { max: 20, message: '昵称最多 20 个字符', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 64, message: '密码长度 6-64 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, trigger: 'blur', validator: validateConfirmPassword },
  ],
  phone: [
    {
      validator: (_r, value: string, cb: (err?: Error) => void) => {
        if (value && !phoneRegex.test(value)) {
          cb(new Error('手机号格式不正确'))
        } else {
          cb()
        }
      },
      trigger: 'blur',
    },
  ],
  email: [
    {
      validator: (_r, value: string, cb: (err?: Error) => void) => {
        if (value && !emailRegex.test(value)) {
          cb(new Error('邮箱格式不正确'))
        } else {
          cb()
        }
      },
      trigger: 'blur',
    },
  ],
}

async function handleRegister() {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch {
    return
  }
  submitting.value = true
  try {
    await authStore.register({
      username: form.username.trim(),
      nickname: form.nickname.trim(),
      password: form.password,
      phone: form.phone.trim(),
      email: form.email.trim(),
      gender: form.gender,
      birthday: form.birthday,
      avatar: form.avatar.trim(),
      bio: form.bio.trim(),
    })
    // 注册成功后自动用刚注册的账号登录
    try {
      await authStore.login({
        username: form.username.trim(),
        password: form.password,
      })
      router.push('/home')
    } catch {
      // 自动登录失败，让用户手动登录
      router.push('/home')
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '注册失败'
    ElMessage.error(msg)
  } finally {
    submitting.value = false
  }
}

function goHome() {
  ElMessageBox.confirm('确定放弃当前注册信息并返回首页吗？', '提示', {
    type: 'warning',
    confirmButtonText: '确定返回',
    cancelButtonText: '继续注册',
  })
    .then(() => {
      router.push('/home')
    })
    .catch(() => {
      // 用户选择继续注册
    })
}
</script>

<style scoped>
.register-page {
  min-height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: clamp(1.5rem, 4vh, 3rem) clamp(1rem, 2vw, 1.75rem);
  background: linear-gradient(135deg, #0a0a10 0%, #1a1a2e 50%, #0a0a10 100%);
}

.register-card {
  width: 100%;
  max-width: 48rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: clamp(0.6rem, 1.2vw, 1rem);
  padding: clamp(1.25rem, 3vw, 2rem);
  box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.3);
}

.register-header {
  text-align: center;
  margin-bottom: clamp(1rem, 2.4vw, 1.75rem);
}

.register-title {
  font-size: clamp(1.4rem, 2.2vw, 1.8rem);
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.4rem;
  background: linear-gradient(135deg, #fff 0%, #79abff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.register-subtitle {
  font-size: clamp(0.8rem, 1vw, 0.95rem);
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 1rem;
}

.form-grid__full {
  grid-column: 1 / -1;
}

.register-form :deep(.el-form-item__label) {
  color: rgba(255, 255, 255, 0.7);
  font-size: clamp(0.75rem, 0.95vw, 0.85rem);
  padding-bottom: 0.25rem;
  line-height: 1.2;
}

.register-form :deep(.el-input__wrapper),
.register-form :deep(.el-textarea__inner) {
  background: rgba(255, 255, 255, 0.04);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08) inset;
  border-radius: 0.5rem;
}

.register-form :deep(.el-input__wrapper:hover),
.register-form :deep(.el-textarea__inner:hover) {
  box-shadow: 0 0 0 1px rgba(22, 93, 255, 0.5) inset;
}

.register-form :deep(.el-input.is-focus .el-input__wrapper) {
  box-shadow: 0 0 0 1px rgba(22, 93, 255, 0.8) inset;
}

.register-form :deep(.el-input__inner) {
  color: #fff;
  font-size: clamp(0.85rem, 1.05vw, 0.95rem);
  height: clamp(2rem, 2.6vw, 2.4rem);
}

.register-form :deep(.el-input__inner::placeholder),
.register-form :deep(.el-textarea__inner::placeholder) {
  color: rgba(255, 255, 255, 0.35);
}

.register-form :deep(.el-textarea__inner) {
  color: #fff;
  font-size: clamp(0.85rem, 1.05vw, 0.95rem);
}

.register-form :deep(.el-input__prefix) {
  color: rgba(255, 255, 255, 0.45);
}

.register-form :deep(.el-radio__label) {
  color: rgba(255, 255, 255, 0.7);
  font-size: clamp(0.8rem, 1vw, 0.9rem);
}

.register-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

@media (max-width: 36rem) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
