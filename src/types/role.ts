/**
 * 角色（Role）相关类型
 *
 * 设计约束：
 *  - 一个用户拥有 N 个角色，每个角色对应一份独立的记忆与对话上下文。
 *  - 创建/更新请求只需要 name / desc；后端会自动绑定当前登录用户并拒绝同名角色。
 *  - roleId 在前端业务侧一律以字符串传输（Go uint 序列化为 string 后下发 Python），
 *    切换、显示、上传记忆、对话等场景统一使用字符串。
 */

/** 角色实体（与后端 dto.RoleResponse 同构） */
export interface Role {
  id: number
  /** 归属用户 ID（字符串形式） */
  userId: string
  /** 角色名称（同用户下唯一） */
  name: string
  /** 角色描述（可空、可长文本） */
  desc: string
  /** 状态：1-正常 / 2-已删除（软删） */
  status: number
  /** ISO 8601 */
  createdAt: string
  /** ISO 8601 */
  updatedAt: string
}

/** 创建角色请求 */
export interface CreateRoleRequest {
  name: string
  desc?: string
}

/** 修改角色请求：name / desc 至少传一个 */
export interface UpdateRoleRequest {
  name?: string
  desc?: string
}
