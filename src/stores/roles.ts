/**
 * 角色 Store
 *
 * 职责：
 *  - 维护当前用户的角色列表（roles）
 *  - 维护"当前激活角色" currentRoleId，全局生效，影响文件/记忆/对话等模块
 *  - localStorage 持久化 currentRoleId；刷新页面后自动恢复
 *  - 提供 fetchRoles / createRole / updateRole / deleteRole / switchRole
 *
 * 设计要点：
 *  - currentRoleId 仅在角色列表加载完成后才允许被业务模块读取；
 *    bootstrap() 内部串联拉取和回放切换，保证初始化时序可控。
 *  - 切换角色仅修改 ref，不重新拉取列表（避免列表闪烁）；列表与各业务模块自取。
 *  - 当前用户登出时由调用方清空（避免脏数据），本 store 不自动监听 authStore。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import * as rolesApi from '@/api/roles'
import type { CreateRoleRequest, Role, UpdateRoleRequest } from '@/types/role'

const STORAGE_KEY = 'echo_current_role_id'

function readPersistedRoleId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

function writePersistedRoleId(value: string) {
  try {
    if (value) {
      localStorage.setItem(STORAGE_KEY, value)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    /* localStorage 不可用时静默忽略，避免阻断业务 */
  }
}

export const useRolesStore = defineStore('roles', () => {
  /** 角色列表 */
  const roles = ref<Role[]>([])
  /** 当前激活角色 ID（字符串） */
  const currentRoleId = ref<string>(readPersistedRoleId())
  /** 列表加载态（防止重复触发 fetch） */
  const loading = ref<boolean>(false)
  /** 首次加载是否完成（决定业务模块何时可以放心读 currentRoleId） */
  const bootstrapped = ref<boolean>(false)

  const currentRole = computed<Role | null>(() => {
    const id = currentRoleId.value
    if (!id) return null
    return roles.value.find((r) => String(r.id) === id) || null
  })

  function setCurrentRoleId(id: string) {
    currentRoleId.value = id
    writePersistedRoleId(id)
  }

  /** 拉取当前用户的角色列表。空列表时后端会自动建"默认角色"，所以这里一定 ≥1 条 */
  async function fetchRoles(): Promise<Role[]> {
    loading.value = true
    try {
      const list = await rolesApi.listRoles()
      roles.value = list

      // 首次加载：若持久化值不在列表中（或未持久化），回落到列表第一项
      const persistedId = currentRoleId.value
      const exists = list.some((r) => String(r.id) === persistedId)
      if (!persistedId || !exists) {
        const first = list[0]
        if (first) {
          setCurrentRoleId(String(first.id))
        }
      }
      return list
    } finally {
      loading.value = false
      bootstrapped.value = true
    }
  }

  /** 切换当前激活角色 */
  function switchRole(id: string | number) {
    setCurrentRoleId(String(id))
  }

  /** 创建角色；成功后自动切到新角色（提升"刚建就用"的体验） */
  async function createRole(payload: CreateRoleRequest): Promise<Role> {
    const created = await rolesApi.createRole(payload)
    roles.value.push(created)
    switchRole(created.id)
    ElMessage.success(`已创建并切换至角色"${created.name}"`)
    return created
  }

  /** 更新角色；成功后同步更新本地列表项 */
  async function updateRole(id: string | number, payload: UpdateRoleRequest): Promise<Role> {
    const updated = await rolesApi.updateRole(id, payload)
    const idx = roles.value.findIndex((r) => String(r.id) === String(id))
    if (idx >= 0) {
      roles.value.splice(idx, 1, updated)
    }
    ElMessage.success('角色已更新')
    return updated
  }

  /** 删除角色；若被删的是当前角色，自动切到列表第一项 */
  async function deleteRole(id: string | number): Promise<void> {
    await rolesApi.deleteRole(id)
    const sid = String(id)
    roles.value = roles.value.filter((r) => String(r.id) !== sid)
    if (currentRoleId.value === sid) {
      const fallback = roles.value[0]
      setCurrentRoleId(fallback ? String(fallback.id) : '')
    }
    ElMessage.success('角色已删除')
  }

  /** 清空本地状态（登出时由调用方触发） */
  function clear() {
    roles.value = []
    setCurrentRoleId('')
    bootstrapped.value = false
  }

  return {
    roles,
    currentRoleId,
    currentRole,
    loading,
    bootstrapped,
    fetchRoles,
    switchRole,
    createRole,
    updateRole,
    deleteRole,
    clear,
  }
})
