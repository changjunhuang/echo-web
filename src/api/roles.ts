/**
 * 角色管理 API
 *
 * 与后端 /api/role/* 端点对应（handlers/role_handler.go）：
 *   - GET    /api/role      列出当前用户角色（无角色自动建默认角色）
 *   - POST   /api/role      新建角色
 *   - PUT    /api/role/:id  修改角色（name / desc）
 *   - DELETE /api/role/:id  软删除角色（至少保留 1 个）
 *
 * 后端统一响应包络：{ code, message, data }；unwrap 失败抛带 message 的 Error，
 * 拦截器会调用 ElMessage.error 展示，无需各调用方重复 toast。
 */

import request from './index'
import type { AxiosResponse } from 'axios'
import { useAuthStore } from '@/stores/auth'
import type { CreateRoleRequest, Role, UpdateRoleRequest } from '@/types/role'

interface Envelope<T> {
  code: number
  message: string
  data: T
}

/** 同 auth.ts 的 unwrap：response 拦截器已 unwrap 一次，await 直接拿到 Envelope；
 *  这里是 cast 不是 bug——运行时形态稳定，TS 只是因为拦截器没显式标注而漂移 */
async function unwrap<T>(promise: Promise<AxiosResponse<Envelope<T>>>): Promise<T> {
  const env = (await promise) as unknown as Envelope<T>
  const ok = env.code === 0 || (env.code >= 200 && env.code < 300)
  if (!ok) {
    throw new Error(env.message || '请求失败')
  }
  return env.data
}

/** 从 authStore 读取 sessionId（统一来源） */
function getAuthSessionId(): string {
  try {
    return useAuthStore().sessionId || ''
  } catch {
    return ''
  }
}

/** GET /api/role —— 列表；若用户无角色后端会顺手建一个"默认角色" */
export function listRoles(): Promise<Role[]> {
  // GET 请求不携带 body，但仍需要在 Header 中带 sessionId 以通过 RequireSession 中间件
  return unwrap(
    request.get<Envelope<Role[]>>('/role', {
      headers: { 'X-Session-Id': getAuthSessionId() },
    }),
  )
}

/** POST /api/role —— 创建角色 */
export function createRole(payload: CreateRoleRequest): Promise<Role> {
  return unwrap(
    request.post<Envelope<Role>>(
      '/role',
      { ...payload, sessionId: getAuthSessionId() },
    ),
  )
}

/** PUT /api/role/:id —— 修改角色（至少传 name 或 desc 之一） */
export function updateRole(id: string | number, payload: UpdateRoleRequest): Promise<Role> {
  return unwrap(
    request.put<Envelope<Role>>(
      `/role/${id}`,
      { ...payload, sessionId: getAuthSessionId() },
    ),
  )
}

/** DELETE /api/role/:id —— 软删除角色（至少保留 1 个） */
export function deleteRole(id: string | number): Promise<{ ok: boolean }> {
  return unwrap(
    request.delete<Envelope<{ ok: boolean }>>(`/role/${id}`, {
      headers: { 'X-Session-Id': getAuthSessionId() },
    }),
  )
}
