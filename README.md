# Echo Web

基于 Vue 3 + TypeScript + Vite 的对话前端，配套 Go `net/http` Mock 后端。
聚焦 SSE 流式对话、Markdown + 多模态附件、连续语音交互、七牛云直传。

## 技术栈

| 类别 | 选型 |
|---|---|
| 框架 | Vue 3.5 `<script setup>` · TypeScript 5.9 |
| 构建 | Vite 8 · Vitest 4 |
| UI / 状态 | Element Plus 2.13 · Pinia 3 · Vue Router 4 |
| 网络 | Axios · Fetch + ReadableStream (SSE) |
| 语音 | Web Speech API |
| 对象存储 | 七牛云 (qiniu-js 直传) |

## 功能

- **文本对话**：多会话 · SSE 流式（打字机效果 + 闪烁光标）· 停止 / 编辑 / 重试 · Markdown
- **附件**：图片预览 · 音视频内嵌播放 · 文件下载卡片 · 按 `file_id+chunk_index` 去重
- **像素角色对话**：SVG 角色 + 时段场景 + 情绪驱动表情 / 手势
- **语音交互**：连续 ASR + VAD 断句 + 自动续录 · TTS 播报 · barge-in 打断
- **七牛云直传**：拖拽 / 10 并发 / 单文件 2GB
- **账号会话**：localStorage 持久化 · TTL 自动清理

## 目录结构

```
src/
├── api/                # HTTP + SSE 协议层
│   ├── chat.ts         # SSE 流式对话 (7 种帧类型) + resolveUrl
│   ├── auth.ts         # 登录 / 注册 / 校验 / 登出
│   └── upload.ts       # 七牛云凭证 + 入库
├── composables/
│   ├── useTypewriter.ts          # 打字机节流 (25ms / 拍, ≤6 字符)
│   ├── useSpeechRecognition.ts   # 连续 ASR + VAD
│   └── useSpeechSynthesis.ts     # TTS + barge-in
├── components/
│   ├── ChatAttachment.vue        # 图片 / 音视频 / 文件卡片
│   ├── ChatContext.vue           # RAG 检索上下文
│   ├── ChatImage.vue             # el-image-viewer 预览
│   ├── ChatToolCall.vue          # 工具调用记录
│   └── PixelCharacter / Scene / AppHeader / LoginDialog / AdminSidebar
├── stores/             # Pinia
│   ├── chat.ts         # 会话 / 消息 / 资源 / 工具调用 / 上下文 / 记忆
│   ├── auth.ts         # 登录态 + sessionId 持久化
│   └── upload.ts
├── views/
│   ├── chat/ChatPage.vue         # 文本对话主页
│   ├── auth/ admin/ home/ models/
├── types/  router/  layouts/  utils/  styles/  assets/
└── App.vue  main.ts

test/
├── 协议与基础
│   ├── sse-parse.test.mjs          # SSE 行缓冲 + 帧解析
│   ├── sse-e2e.test.mjs           # 端到端 SSE 解析
│   ├── sse-events.test.mjs        # 7 种帧类型分发
│   └── chat-session-id.test.mjs   # sessionId 双口径
├── 附件渲染
│   ├── chat-image.test.mjs
│   ├── chat-attachment.test.mjs
│   └── attachment-e2e.test.mjs
├── 打字机
│   └── typewriter-wiring.test.mjs # ChatPage 集成契约
└── vitest 运行测试
    ├── resource-render.test.mjs   # mount ChatAttachment 真实 DOM
    └── typewriter.test.mjs        # 打字机节流器
```

## 快速开始

```bash
npm install
npm run dev          # http://localhost:5173
go run server.go     # :8080 关键字 Mock（可选）
npm run build        # vue-tsc 类型检查 + vite build
npm test             # node:test + vitest
```

环境变量 (`.env`)：

| 变量 | 说明 | 默认 |
|---|---|---|
| `VITE_API_BASE_URL` | 后端 API 基址 | `/api` |
| `VITE_DEFAULT_CHAT_MODEL` | 默认对话模型 | `gpt-4o` |

> 七牛云 AK/SK 等密钥保存在**后端**，前端只使用后端签发的上传凭证。

## 后端接口

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/chat` | SSE 流式对话 |
| POST | `/api/chat/completions` | 非流式 JSON（OpenAI 兼容） |
| POST | `/api/auth/login` `register` `check` `logout` | 账号会话 |
| POST | `/api/file/token` `register` | 上传凭证 / 入库 |
| GET / DELETE | `/api/file/upload[/:id]` | 列表 / 删除 |
| GET | `/api/ip` | 客户端 IP（兜底会话标识） |

## SSE 帧协议

`POST /api/chat` 返回 `text/event-stream`，每帧一行 `data:` 行，靠 `type` 字段分发：

| type | 含义 | 关键字段 |
|---|---|---|
| `context` | RAG / 检索上下文摘要 | `persona_len` `core_count` `l1_count` |
| `resource` | 附件（图片 / 音频 / 视频 / 文件），可多次 | `url` `modality` `file_id` `chunk_index` |
| `tool` | 工具调用结果 | `name` `iter` `ok` `summary` |
| `prefix` | 级联小模型前缀，与 `delta` 同通道 | `text` |
| `delta` | 大模型增量（必 append） | `text` |
| `done` | 整轮结束 | `full` `sessionId` |
| `memory_extracted` | 长期记忆抽取（仅 `stream=false`） | `ok` `error` |

协议细则：

- **跨 chunk 帧**：`fetch` reader 把多条 `data:` 攒到一坨回调，自有 buffer 按 `\n\n / \r\n\r\n` 切齐再分发
- **裸 URL**：附件 URL 不带 scheme（后端正则清掉了），前端 `resolveUrl()` 补 `https://`；协议相对 `//cdn/...` 跟随页面协议

## 关键设计

- **打字机渲染**：`useTypewriter` 把 burst 涌入的 delta 队列化，按 25ms / 拍、最长 6 字符 / 拍逐字推到 `msg.content`，让 SSE 有可视的逐字呈现；`stop(flush)` 在 `onDone` / `onError` / 用户点停止时强制 drain，避免 UI 与真实收尾脱钩
- **资源去重**：`appendMessageResource` 以 `fileId#chunkIndex` 为 key 合并，缺失 `fileId` 时退到 `eventId`
- **sessionId 双口径**：UI 维度（侧栏分组）= `nanoid`；上行 SSE = `authStore.sessionId`（与 `/api/auth/login` 严格一致）

## 测试

```bash
npm test                                              # 全量
node --test test/sse-events.test.mjs                  # 单文件
npx vitest run test/typewriter.test.mjs               # 单文件
```

测试体系分两层：

| 层级 | 工具 | 覆盖 |
|---|---|---|
| 协议 / 状态 | `node:test` | SSE 帧解析、类型分发、resolveUrl、sessionId 流转、ChatPage 集成契约 |
| 真实 DOM / 时序 | `vitest` + jsdom | ChatAttachment mount 出 `<img>` / `<audio>` / `<video>` / 文件卡片；打字机 fake timers 验证 burst 不满屏 |
