<template>
  <div class="role-switcher">
    <el-dropdown
      trigger="click"
      :disabled="rolesStore.loading"
      @command="handleCommand"
    >
      <span class="role-trigger" :title="currentRole ? `当前角色：${currentRole.name}` : '尚未选择角色'">
        <el-icon class="trigger-icon"><UserFilled /></el-icon>
        <span class="trigger-text">
          <span class="trigger-label">角色</span>
          <span class="trigger-value">{{ currentRole ? currentRole.name : '未选择' }}</span>
        </span>
        <el-icon class="trigger-arrow"><ArrowDown /></el-icon>
      </span>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="role in rolesStore.roles"
            :key="role.id"
            :command="String(role.id)"
            :disabled="String(role.id) === rolesStore.currentRoleId"
          >
            <span class="dropdown-name">{{ role.name }}</span>
            <el-icon v-if="String(role.id) === rolesStore.currentRoleId" class="dropdown-check">
              <Check />
            </el-icon>
          </el-dropdown-item>
          <el-dropdown-item divided command="__manage__">
            <el-icon><Setting /></el-icon>
            <span>管理角色...</span>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { UserFilled, ArrowDown, Check, Setting } from '@element-plus/icons-vue'
import { useRolesStore } from '@/stores/roles'

const router = useRouter()
const rolesStore = useRolesStore()

const { currentRole } = storeToRefs(rolesStore)

function handleCommand(cmd: string) {
  if (cmd === '__manage__') {
    router.push('/admin/roles')
    return
  }
  const target = rolesStore.roles.find((r) => String(r.id) === cmd)
  if (!target) return
  if (String(target.id) === rolesStore.currentRoleId) return
  rolesStore.switchRole(target.id)
}
</script>

<style scoped>
.role-switcher {
  display: inline-flex;
  align-items: center;
}

.role-trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 100px;
  font-size: clamp(0.78rem, 0.95vw, 0.85rem);
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition: all 0.2s;
}

.role-trigger:hover {
  background: rgba(22, 93, 255, 0.15);
  border-color: rgba(22, 93, 255, 0.4);
  color: #fff;
}

.trigger-icon {
  color: rgba(121, 171, 255, 0.9);
}

.trigger-text {
  display: inline-flex;
  align-items: baseline;
  gap: 0.35rem;
  max-width: 12rem;
}

.trigger-label {
  color: rgba(255, 255, 255, 0.5);
  font-size: 0.72rem;
}

.trigger-value {
  color: #fff;
  font-weight: 500;
  max-width: 8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-arrow {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.5);
}

.dropdown-name {
  display: inline-block;
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.dropdown-check {
  margin-left: 0.4rem;
  color: #67c23a;
}
</style>
