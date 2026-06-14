# Echo Web

> 基于 Vue 3 + TypeScript + Vite 构建。

## 技术栈

| 类别        | 选型                                                    |
| ----------- | ------------------------------------------------------- |
| 框架 / 语言 | Vue 3.5（`<script setup>`） + TypeScript 5.9            |
| 构建        | Vite 8                                                  |
| UI / 状态   | Element Plus 2.13 · Pinia 3 · Vue Router 4              |
| 网络        | Axios 1 · Fetch + ReadableStream（SSE）                 |
| 对象存储    | 七牛云（`qiniu-js` 3.4，浏览器直传）                    |
| 语音        | Web Speech API（SpeechRecognition + SpeechSynthesis）   |
| 演示后端    | Go `net/http`（`server.go`，关键字 mock）               |

## 功能亮点

- **智能对话**：多会话管理、SSE 流式输出、停止/编辑/重试、Markdown 渲染、图片与文件附件。
- **像素角色自由对话**：SVG 像素人物 + 按时段自动切换的场景背景，情绪标签驱动表情与手势。
- **语音连续对话**：流式 ASR + 静音断句 + 自动续录，TTS 自动播报并支持 **barge-in 打断**。
- **SSE 兼容层**：行缓冲 + `\r\n` 归一化，兼容 OpenAI 风格 / 命名事件 / 老式包络三种协议，已修复跨 chunk 边界丢帧。
- **七牛云直传**：三步直传（凭证 → 直传 → 入库），拖拽 / 批量 10 并发 / 单文件 2GB / 失败仅重试入库。
- **账号会话**：localStorage 持久化 + 启动校验，TTL 到期自动清理。

## 快速开始

```bash
npm install
npm run dev          # 前端  http://localhost:5173
go run server.go     # 后端  :8080（可选，关键字 mock）
npm run build        # 类型检查 + 构建
```

环境变量（`.env`）：

| 变量名                    | 说明                                 |
| ------------------------- | ------------------------------------ |
| `VITE_API_BASE_URL`       | 后端 API 基址，默认 `/api`           |
| `VITE_DEFAULT_CHAT_MODEL` | 默认对话模型（如 `gpt-4o`）          |

> 七牛云 AK/SK 等密钥保存在**后端**，前端仅使用后端签发的上传凭证。

## 后端接口

| Method | Path                                                | 说明                       |
| ------ | --------------------------------------------------- | -------------------------- |
| POST   | `/api/chat`                                         | SSE 流式对话               |
| POST   | `/api/chat/completions`                             | 非流式 JSON（OpenAI 兼容） |
| POST   | `/api/auth/login` · `register` · `check` · `logout` | 账号会话                   |
| POST   | `/api/file/token` · `register`                      | 上传凭证 / 完成入库        |
| GET    | `/api/file/upload`  ·  DELETE `/api/file/upload/:id`| 列表 / 删除                |
| GET    | `/api/ip`                                           | 客户端 IP（兜底会话标识）  |

SSE 帧示例：

```
data: {"choices":[{"delta":{"content":"H"}}]}\n\n
data: [DONE]\n\n
```

## 架构演进方向

| 现阶段问题                                           | 业界对标                                     | 本系统落地                                    |
| ---------------------------------------------------- | -------------------------------------------- | --------------------------------------------- |
| `ChatPage.vue` 3000+ 行，多模态/语音/打断耦合         | Vue 3 composable + 容器/展示分离             | 抽 `useChatStream` / `useVoiceAgent` / `useBargeIn` + `ChatInputBar` / `PixelStage` |
| 历史拼成字符串发后端，prompt 注入风险、无 token 预算  | OpenAI / Anthropic 标准 `messages[]` 协议    | 切换为结构化数组，BFF 侧做窗口裁剪            |
| SSE 三套协议共存                                      | Vercel AI SDK Data Stream Protocol           | 命名事件协议作正式版，旧协议在 BFF 适配       |
| 像素角色情绪由前端关键字推断                          | 模型直接吐结构化标签（Tool / Function 风格） | 新增 `event: emotion` 帧，前端匹配仅作兜底    |
| Go 后端仅 mock，无 Agent 内核                         | BFF + Agent Core 分层                        | 抽 `AgentService` 接口，mock 与真模型共用     |
| 身份口径三套（nanoid / IP / auth session）            | 单一身份源                                   | 登录 → `auth.user.id`，未登录 → 匿名 nanoid   |
