<template>
  <div class="roles-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">角色管理</h2>
        <p class="page-desc">每个角色对应一份独立的记忆与对话上下文，至少保留 1 个</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="openCreateDialog" :disabled="rolesStore.loading">
        新建角色
      </el-button>
    </div>

    <el-table
      v-loading="rolesStore.loading"
      :data="rows"
      class="roles-table"
      :empty-text="rolesStore.loading ? '加载中...' : '暂未创建任何角色'"
    >
      <el-table-column label="名称" prop="name" min-width="120">
        <template #default="{ row }">
          <span class="role-name" :class="{ 'role-name--active': isCurrent(row) }">
            {{ row.name }}
            <el-tag v-if="isCurrent(row)" type="success" size="small" effect="plain" round>当前</el-tag>
          </span>
        </template>
      </el-table-column>
      <el-table-column label="描述" prop="desc" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="role-desc">{{ row.desc || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="140">
        <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220">
        <template #default="{ row }">
          <el-button
            size="small"
            plain
            type="primary"
            :disabled="isCurrent(row)"
            class="op-btn op-btn--text"
            @click="handleSwitch(row)"
          >
            设为当前
          </el-button>
          <el-button
            size="small"
            plain
            class="op-btn op-btn--text"
            @click="openEditDialog(row)"
          >
            编辑
          </el-button>
          <el-button
            size="small"
            plain
            type="danger"
            :disabled="rows.length <= 1"
            class="op-btn op-btn--text"
            @click="handleDelete(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建 / 编辑 弹窗（同一对话框，按 mode 切换行为） -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新建角色' : '编辑角色'"
      width="420px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="64px" @submit.prevent>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" maxlength="64" show-word-limit placeholder="同账号下唯一" />
        </el-form-item>
        <el-form-item label="描述" prop="desc">
          <el-input
            v-model="form.desc"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            placeholder="可空；描述该角色的背景、性格、记忆主题等"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">
          {{ dialogMode === 'create' ? '创建' : '保存' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import { useRolesStore } from '@/stores/roles'
import type { CreateRoleRequest, Role, UpdateRoleRequest } from '@/types/role'

const rolesStore = useRolesStore()
const { roles: rows, currentRoleId } = storeToRefs(rolesStore)

type DialogMode = 'create' | 'edit'
const dialogVisible = ref(false)
const dialogMode = ref<DialogMode>('create')
const editingId = ref<number | null>(null)
const submitting = ref(false)
const formRef = ref<FormInstance | null>(null)

const form = reactive<{ name: string; desc: string }>({ name: '', desc: '' })

const formRules: FormRules = {
  name: [
    { required: true, message: '请输入角色名称', trigger: 'blur' },
    { min: 1, max: 64, message: '长度 1~64 字符', trigger: 'blur' },
    {
      validator: (_rule, value: string, cb) => {
        if (value && value.trim() !== value) {
          cb(new Error('名称不能含首尾空白'))
          return
        }
        cb()
      },
      trigger: 'blur',
    },
  ],
  desc: [{ max: 500, message: '描述最多 500 字符', trigger: 'blur' }],
}

function isCurrent(row: Role): boolean {
  return String(row.id) === currentRoleId.value
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function resetForm() {
  form.name = ''
  form.desc = ''
  editingId.value = null
}

function openCreateDialog() {
  resetForm()
  dialogMode.value = 'create'
  dialogVisible.value = true
}

function openEditDialog(row: Role) {
  resetForm()
  dialogMode.value = 'edit'
  editingId.value = row.id
  form.name = row.name
  form.desc = row.desc
  dialogVisible.value = true
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  try {
    if (dialogMode.value === 'create') {
      const payload: CreateRoleRequest = { name: form.name.trim(), desc: form.desc.trim() }
      await rolesStore.createRole(payload)
    } else if (editingId.value !== null) {
      const payload: UpdateRoleRequest = {
        name: form.name.trim(),
        desc: form.desc.trim(),
      }
      await rolesStore.updateRole(editingId.value, payload)
    }
    dialogVisible.value = false
  } catch (err) {
    // 拦截器已经弹过错误；这里只控制状态，避免二次 toast
    if (err instanceof Error) {
      console.warn('[roles] submit failed:', err.message)
    }
  } finally {
    submitting.value = false
  }
}

function handleSwitch(row: Role) {
  if (isCurrent(row)) return
  rolesStore.switchRole(row.id)
  ElMessage.success(`已切换至"${row.name}"`)
}

async function handleDelete(row: Role) {
  try {
    await ElMessageBox.confirm(
      `确定删除角色"${row.name}"？该角色的记忆与对话仍保留在服务端，但不再关联到任何当前角色。`,
      '删除角色',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }
  try {
    await rolesStore.deleteRole(row.id)
  } catch (err) {
    if (err instanceof Error) {
      console.warn('[roles] delete failed:', err.message)
    }
  }
}

onMounted(async () => {
  // 进入页面保证已加载；若 AdminLayout 已触发过 bootstrap，则这里会立刻命中缓存值
  if (!rolesStore.bootstrapped || rolesStore.roles.length === 0) {
    try {
      await rolesStore.fetchRoles()
    } catch (err) {
      if (err instanceof Error) {
        console.warn('[roles] list failed:', err.message)
      }
    }
  }
})
</script>

<style scoped>
.roles-page {
  max-width: 70rem;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: clamp(1rem, 2vw, 1.5rem);
}

.page-title {
  font-size: clamp(1.1rem, 1.6vw, 1.4rem);
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.4rem;
}

.page-desc {
  font-size: clamp(0.75rem, 0.95vw, 0.9rem);
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

.roles-table {
  background: rgba(255, 255, 255, 0.03) !important;
  border-radius: 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  width: 100%;
  table-layout: auto;
}

.roles-table :deep(.el-table),
.roles-table :deep(.el-table__inner-wrapper),
.roles-table :deep(.el-table__header-wrapper),
.roles-table :deep(.el-table__header),
.roles-table :deep(.el-table__body),
.roles-table :deep(.el-table__body-wrapper),
.roles-table :deep(.el-table__row),
.roles-table :deep(.el-table__empty-block),
.roles-table :deep(.el-table__empty-text) {
  background: transparent !important;
  background-color: transparent !important;
  color: rgba(255, 255, 255, 0.85);
}

.roles-table :deep(th.el-table__cell),
.roles-table :deep(.el-table__header th),
.roles-table :deep(.el-table__header-wrapper th) {
  background: rgba(255, 255, 255, 0.04) !important;
  background-color: rgba(255, 255, 255, 0.04) !important;
  color: rgba(255, 255, 255, 0.65) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-weight: 600;
  padding: 8px 0 !important;
  text-align: left !important;
}

.roles-table :deep(td.el-table__cell) {
  background: transparent !important;
  background-color: transparent !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.85);
  padding: 6px 0 !important;
  text-align: left !important;
}

/* 兜底：旧类名残留也强制左对齐 */
.roles-table :deep(.el-table__cell.is-right),
.roles-table :deep(.el-table__cell.is-center) {
  text-align: left !important;
}

.roles-table :deep(.el-table .cell) {
  padding: 0 8px !important;
  line-height: 1.4 !important;
}

.roles-table :deep(tr.el-table__row:hover > td.el-table__cell),
.roles-table :deep(tr.el-table__row:hover) {
  background: rgba(255, 255, 255, 0.04) !important;
}

.roles-table :deep(.el-table__border-left-patch),
.roles-table :deep(.el-table__border-right-patch),
.roles-table :deep(.el-table__border-top-patch),
.roles-table :deep(.el-table__border-bottom-patch) {
  background: transparent !important;
}

/* 排序图标 / 筛选箭头：暗色面板下需要提亮 */
.roles-table :deep(.el-table__column-filter-trigger),
.roles-table :deep(.el-table__sort-icon) {
  color: rgba(255, 255, 255, 0.5);
}

.roles-table :deep(.el-table__sort-icon.is-active),
.roles-table :deep(.el-table__column-filter-trigger.is-active) {
  color: #79abff;
}

.role-name {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
}

.role-name--active {
  color: #67c23a;
}

.role-desc {
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.35;
  font-size: 0.78rem;
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.roles-table :deep(.el-button + .el-button) {
  margin-left: 0.3rem;
}

/* 操作列按钮：紧凑尺寸 */
.roles-table :deep(.op-btn--text) {
  padding: 4px 8px !important;
  font-size: 0.75rem !important;
  min-height: 24px !important;
  height: 24px !important;
}

/* el-tooltip 默认黑底白字与暗色面板协调，但弹层箭头需对齐表格风格 */
.roles-table :deep(.el-popper.is-dark) {
  background: rgba(20, 22, 28, 0.96) !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
  color: rgba(255, 255, 255, 0.85) !important;
  max-width: 28rem;
  word-break: break-word;
}
</style>
