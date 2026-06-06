/**
 * 认证相关类型定义
 * 与后端登录/会话接口保持一致。
 */

/** 当前登录用户（与登录接口返回的 user 字段对齐） */
export interface UserInfo {
  id: number
  username: string
  nickname: string
  email?: string
  /** 账号状态：1 启用 / 0 禁用 等业务码 */
  status: number
  /** ISO 8601，最近一次登录时间 */
  lastLoginAt: string
  /** ISO 8601，账号创建时间 */
  createdAt: string
}

/** 登录请求 */
export interface LoginRequest {
  username: string
  password: string
}

/** 登录响应数据
 *
 * 后端返回示例：
 * {
 *   "sessionId": "...",
 *   "expireAt":  "2026-06-06T00:34:00.3393579+08:00",
 *   "user": { ... }
 * }
 *
 * 注意字段名是 `expireAt`（单数），且为 ISO 8601 字符串而非 unix 秒。
 */
export interface LoginResponse {
  sessionId: string
  expireAt: string
  user: UserInfo
}

/** 注册请求 */
export interface RegisterRequest {
  username: string
  password: string
  nickname: string
  phone?: string
  email?: string
  avatar?: string
  bio?: string
  gender?: string
  birthday?: string
}

/** 注册响应数据 */
export interface RegisterResponse {
  id: number
  username: string
  nickname: string
}

/** 会话校验响应（与登录接口的会话部分同构） */
export interface CheckResponse {
  user: UserInfo
  expireAt: string
}
