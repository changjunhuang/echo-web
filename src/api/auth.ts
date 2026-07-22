/**
 * 认证 API 模块
 * 与后端 server.go 中的 /api/auth/* 端点对应
 *
 * 后端统一响应包络：{ code, message, data }
 *  - code === 0 表示成功，data 为业务负载
 *  - 非零视为业务错误，axios 拦截器会自动展示 message
 */

import request from './index'
import type { AxiosResponse } from 'axios'
import type {
  CheckResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
} from '@/types/auth'

/** 后端响应包络 */
interface Envelope<T> {
  code: number
  message: string
  data: T
}

/** 统一拆包：成功返回 data，失败抛出后端 message
 *
 * 重要：api/index.ts 的 response.interceptor 已 unwrap 过一次，
 * await 拿到的就是 HTTP body（即 Envelope 本身），不是 AxiosResponse。
 * TS 类型上 axios 仍标为 AxiosResponse，所以这里用 `as unknown as Envelope<T>`
 * 把运行时形态对齐到业务期望。
 *
 * 后端 `code` 与 HTTP 状态码同义：2xx 表示成功。
 * 为兼容旧接口，code === 0 同样视为成功。
 */
async function unwrap<T>(promise: Promise<AxiosResponse<Envelope<T>>>): Promise<T> {
  const env = (await promise) as unknown as Envelope<T>
  const ok = env.code === 0 || (env.code >= 200 && env.code < 300)
  if (!ok) {
    throw new Error(env.message || '请求失败')
  }
  return env.data
}

/** 登录：账号 + 密码 */
export function login(payload: LoginRequest): Promise<LoginResponse> {
  return unwrap(request.post<Envelope<LoginResponse>>('/auth/login', payload))
}

/** 注册：填写注册人信息（账号/密码/昵称/手机/邮箱/性别/生日/个性签名等） */
export function register(payload: RegisterRequest): Promise<RegisterResponse> {
  return unwrap(request.post<Envelope<RegisterResponse>>('/auth/register', payload))
}

/** 校验本地 sessionId 是否仍有效 */
export function checkSession(sessionId: string): Promise<CheckResponse> {
  return unwrap(request.post<Envelope<CheckResponse>>('/auth/check', { sessionId }))
}

/** 登出：让服务端销毁该 sessionId */
export function logout(sessionId: string): Promise<{ ok: boolean }> {
  return unwrap(request.post<Envelope<{ ok: boolean }>>('/auth/logout', { sessionId }))
}
