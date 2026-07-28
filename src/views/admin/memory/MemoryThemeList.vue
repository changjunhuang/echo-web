<script setup lang="ts">
/**
 * 记忆主题列表（重构）：以"主题"为单位组织记忆，替代旧的单文件列表。
 *
 * 操作：
 *  - 新增：打开 <MemoryThemeFormDialog mode="create" />
 *  - 查看：打开 <MemoryThemeViewDialog />
 *  - 编辑：打开 <MemoryThemeFormDialog mode="edit" />
 *  - 删除：二次确认后调用 memoryApi.deleteMemoryTheme
 */
import { onMounted, ref, watch, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listMemories,
  deleteMemoryTheme,
  type RecallMemoryItem,
} from '@/api/memory'
import { useRolesStore } from '@/stores/roles'
import MemoryThemeFormDialog from './MemoryThemeFormDialog.vue'
import MemoryThemeViewDialog from './MemoryThemeViewDialog.vue'

const rolesStore = useRolesStore()

const items = ref<RecallMemoryItem[]>([])
const loading = ref(false)
const createOpen = ref(false)
const editTarget = ref<RecallMemoryItem | null>(null)
const viewTarget = ref<RecallMemoryItem | null>(null)

const currentRoleLabel = computed(() => {
  const r = rolesStore.roles?.find((x) => String(x.id) === String(rolesStore.currentRoleId || ''))
  return r?.name || rolesStore.currentRoleId || 'default'
})

async function refresh() {
  loading.value = true
  try {
    items.value = await listMemories()
  } catch (e) {
    console.warn('list memories failed', e)
  } finally {
    loading.value = false
  }
}

watch(() => rolesStore.currentRoleId, refresh)
onMounted(refresh)

function openEdit(it: RecallMemoryItem) {
  editTarget.value = it
}
function openView(it: RecallMemoryItem) {
  viewTarget.value = it
}

async function handleDelete(it: RecallMemoryItem) {
  try {
    await ElMessageBox.confirm(
      `确认删除记忆主题「${it.topic}」？\n将级联删除对象存储文件、MySQL 记录和向量库记录。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deleteMemoryTheme(it.memoryId)
    ElMessage.success('删除成功')
    await refresh()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    ElMessage.error(msg || '删除失败')
  }
}

function parseStatusLabel(s: number): string {
  return ['待解析', '解析中', '已完成', '解析失败'][s] || '未知'
}
function parseStatusType(s: number): 'info' | 'warning' | 'success' | 'danger' {
  const types: Array<'info' | 'warning' | 'success' | 'danger'> = ['info', 'warning', 'success', 'danger']
  return types[s] || 'info'
}
function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

function onDialogSaved() {
  createOpen.value = false
  editTarget.value = null
  refresh()
}
</script>

<template>
  <div class="memory-theme-list">
    <header class="header">
      <div class="title">
        <span class="dot" />
        <span>当前角色：<strong>{{ currentRoleLabel }}</strong></span>
        <span class="count">共 {{ items.length }} 条主题</span>
      </div>
      <el-button type="primary" :icon="Plus" @click="createOpen = true">
        新增记忆
      </el-button>
    </header>

    <el-table v-loading="loading" :data="items" stripe class="theme-table">
      <el-table-column label="主题" min-width="220">
        <template #default="{ row }">
          <div class="topic-cell">
            <div class="topic-text">{{ row.topic }}</div>
            <div v-if="row.subjectiveDesc" class="desc-text">
              {{ row.subjectiveDesc.slice(0, 80) }}
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="源文件数" width="100" align="center">
        <template #default="{ row }">
          {{ row.sourceFiles?.length ?? '—' }}
        </template>
      </el-table-column>
      <el-table-column label="解析状态" width="110" align="center">
        <template #default="{ row }">
          <el-tag :type="parseStatusType(row.parseStatus)" size="small">
            {{ parseStatusLabel(row.parseStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="编辑锁" width="90" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.editStatus === 1" type="warning" size="small">
            AI写入中
          </el-tag>
          <span v-else class="muted">空闲</span>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">
          <span class="muted">{{ formatDate(row.createdAt) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="260" fixed="right">
        <template #default="{ row }">
          <el-button-group>
            <el-button size="small" link @click="openView(row)">查看</el-button>
            <el-button size="small" link type="primary" @click="openEdit(row)">
              编辑
            </el-button>
            <el-button size="small" link type="danger" @click="handleDelete(row)">
              删除
            </el-button>
          </el-button-group>
        </template>
      </el-table-column>
      <template #empty>
        <div class="empty">
          <p>暂无记忆主题</p>
          <p class="hint">点击「新增记忆」开始记录</p>
        </div>
      </template>
    </el-table>

    <!-- 新增 -->
    <MemoryThemeFormDialog
      v-if="createOpen"
      mode="create"
      @close="createOpen = false"
      @saved="onDialogSaved"
    />
    <!-- 编辑 -->
    <MemoryThemeFormDialog
      v-if="editTarget"
      mode="edit"
      :target="editTarget"
      @close="editTarget = null"
      @saved="onDialogSaved"
    />
    <!-- 查看 -->
    <MemoryThemeViewDialog
      v-if="viewTarget"
      :target="viewTarget"
      @close="viewTarget = null"
    />
  </div>
</template>

<script lang="ts">
import { Plus } from '@element-plus/icons-vue'
export default { components: {} }
;(Plus as unknown as { __init?: boolean })
</script>

<style scoped>
.memory-theme-list {
  display: flex;
  flex-direction: column;
  gap: clamp(12px, 1.2vw, 18px);
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: clamp(10px, 1vw, 16px) clamp(14px, 1.2vw, 20px);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: clamp(8px, 0.8vw, 12px);
}
.title {
  display: flex;
  align-items: center;
  gap: clamp(8px, 0.8vw, 14px);
  font-size: clamp(13px, 1.05vw, 15px);
}
.dot {
  width: 0.6em;
  height: 0.6em;
  border-radius: 50%;
  background: linear-gradient(135deg, #5b8cff, #8b5bff);
  box-shadow: 0 0 0.6em rgba(91, 140, 255, 0.4);
}
.count {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.9em;
}
.theme-table {
  background: transparent !important;
}
.topic-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.topic-text {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
}
.desc-text {
  font-size: 0.85em;
  color: rgba(255, 255, 255, 0.5);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.muted {
  color: rgba(255, 255, 255, 0.45);
  font-size: 0.9em;
}
.empty {
  padding: clamp(24px, 3vw, 48px);
  text-align: center;
  color: rgba(255, 255, 255, 0.45);
}
.empty .hint {
  font-size: 0.85em;
  margin-top: 4px;
}
:deep(.el-table tr) {
  background: transparent !important;
}
:deep(.el-table--enable-row-hover tr.el-table__row:hover > td) {
  background: rgba(91, 140, 255, 0.06) !important;
}
</style>