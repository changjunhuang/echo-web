# Echo Web

基于 Vue 3 + TypeScript + Vite 的对话前端，配套 Go `net/http` Mock 后端。
聚焦 SSE 流式对话、Markdown + 多模态附件、连续语音交互、七牛云直传、以「记忆主题」为单位的长期记忆管理。

## 技术栈

| 类别 | 选型 |
|---|---|
| 框架 | Vue 3.5 `<script setup>` · TypeScript 5.9 |
| 构建 | Vite 8 · Vitest 4 |
| UI / 状态 | Element Plus 2.13 · Pinia 3 · Vue Router 4 |
| 网络 | Axios · Fetch + ReadableStream (SSE) |
| 语音 | Web Speech API |
| 对象存储 | 七牛云 (qiniu-js 直传 + 自研并发队列) |

## Code Change Summary（记忆主题重构）

本次提交围绕"以记忆主题为单位组织长期记忆"重构记忆管理：

- **主题重构**：`MemoryPage` 去掉 `el-tabs`，子页统一为 `MemoryThemeList`；新增 `src/api/memory.ts` 协议层（9 个端点）+ 三个新弹窗：`MemoryThemeFormDialog`（新增 / 编辑）/`MemoryThemeList`（列表）/`MemoryThemeViewDialog`（只读查看）
- **修复两个回归**：
  - `UploadQueue` 上传成功必须把七牛返回的 `fileKey` 回写给 caller（修复 `/api/memory/save` 的 `min=1` 校验失败）
  - 编辑态已有源文件 `fileType` 必须直接用详情接口返回值，不允许 `new File([], name)` 占位被二次推导降级（修复"MP4 元数据"被错算成文本喂给 LLM 的视频解析 bug）
- **下载链路**：媒体文件下载改走后端 `/file/:id/download` 代理，规避七牛域名在浏览器侧 DNS 失败 / 缺 CORS
- **工具与测试**：新增 `src/utils/clipboard.ts`、`src/utils/fileType.ts`、`src/utils/qiniuUpload.ts`；新增 `memory-filetype` / `qiniu-upload-queue` 两条 vitest 回归测试，`npm test` 已包含

## 功能

- **文本对话**：多会话 · SSE 流式（打字机效果 + 闪烁光标）· 停止 / 编辑 / 重试 · Markdown
- **附件**：图片预览 · 音视频内嵌播放 · 文件下载卡片 · 按 `file_id+chunk_index` 去重
- **像素角色对话**：SVG 角色 + 时段场景 + 情绪驱动表情 / 手势
- **语音交互**：连续 ASR + VAD 断句 + 自动续录 · TTS 播报 · barge-in 打断
- **七牛云直传**：拖拽 / 10 并发 / 单文件 2GB；`UploadQueue` 并发 5 + 3 次重试 + 指数退避；大文件 100MB 二次确认
- **账号会话**：localStorage 持久化 · TTL 自动清理
- **记忆主题管理**：以「主题」为单位聚合多模态源文件 + 主观描述；AI 解析生成 `{memoryId}.md`；新增 / 编辑 / 删除 / 预览；主题唯一性校验；编辑时增量 diff 决定是否触发 AI 重解析
- **跨上下文剪贴板**：secure-context 走 `navigator.clipboard`，HTTP 兜底 `textarea + execCommand`
- **下载代理**：媒体下载走 `/file/:id/download`，规避七牛域名 DNS / CORS

## 目录结构

```
src/
├── api/                       # HTTP + SSE 协议层
│   ├── chat.ts                # SSE 流式对话 (7 种帧类型) + resolveUrl
│   ├── auth.ts                # 登录 / 注册 / 校验 / 登出
│   ├── upload.ts              # 七牛云凭证 + 入库 + 媒体下载代理
│   └── memory.ts              # 记忆主题协议层 (apply/check/upload-token/save/update/list/detail/delete)
├── composables/
│   ├── useTypewriter.ts       # 打字机节流 (25ms / 拍, ≤6 字符)
│   ├── useSpeechRecognition.ts # 连续 ASR + VAD
│   └── useSpeechSynthesis.ts  # TTS + barge-in
├── components/
│   ├── ChatAttachment.vue     # 图片 / 音视频 / 文件卡片
│   ├── ChatContext.vue        # RAG 检索上下文
│   ├── ChatImage.vue          # el-image-viewer 预览
│   ├── ChatToolCall.vue       # 工具调用记录
│   └── PixelCharacter / Scene / AppHeader / LoginDialog / AdminSidebar
├── stores/                    # Pinia
│   ├── chat.ts                # 会话 / 消息 / 资源 / 工具调用 / 上下文 / 记忆
│   ├── auth.ts                # 登录态 + sessionId 持久化
│   ├── roles.ts               # 当前角色维度（记忆主题按角色隔离）
│   └── upload.ts
├── utils/
│   ├── url.ts                 # normalizeAssetUrl：补 https:// 协议头
│   ├── clipboard.ts           # copyToClipboard：secure-context + execCommand 兜底
│   ├── fileType.ts            # resolveFileType：MIME > 扩展名 > 上游声明
│   └── qiniuUpload.ts         # uploadOne + UploadQueue：并发 / 重试 / 进度 / fileKey 回写
├── views/
│   ├── chat/ChatPage.vue      # 文本对话主页
│   ├── auth/  home/  models/
│   └── admin/
│       ├── MemoryPage.vue          # 入口：渲染 MemoryThemeList
│       ├── FileUploadView.vue      # 上传新文件（拖拽 + 上传确认弹框）
│       ├── MemoryListView.vue      # 「我的记忆」列表（按 tab 分类）
│       └── memory/
│           ├── MemoryThemeList.vue            # 主题列表（本次重构后主页面）
│           ├── MemoryThemeFormDialog.vue      # 新增 / 编辑主题弹窗
│           └── MemoryThemeViewDialog.vue      # 只读查看主题弹窗
├── types/  router/  layouts/  styles/  assets/
└── App.vue  main.ts

test/
├── 协议与基础（node:test）
│   ├── sse-parse.test.mjs          # SSE 行缓冲 + 帧解析
│   ├── sse-e2e.test.mjs           # 端到端 SSE 解析
│   ├── sse-events.test.mjs        # 7 种帧类型分发
│   └── chat-session-id.test.mjs   # sessionId 双口径
├── 附件渲染（node:test）
│   ├── chat-image.test.mjs
│   ├── chat-attachment.test.mjs
│   └── attachment-e2e.test.mjs
├── 打字机（node:test）
│   └── typewriter-wiring.test.mjs # ChatPage 集成契约
└── vitest（真实 DOM / 时序 / 回归）
    ├── resource-render.test.mjs        # mount ChatAttachment 真实 DOM
    ├── typewriter.test.mjs             # 打字机节流器
    ├── memory-filetype.test.mjs        # 回归：编辑提交时 mp4 fileType 不被降级
    └── qiniu-upload-queue.test.mjs     # 回归：UploadQueue 上传成功回写 fileKey
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
| GET | `/api/file/list` | 记忆文件列表（按角色） |
| GET | `/api/file/:id/download` | 媒体下载代理（规避七牛域名 DNS / CORS） |
| POST | `/api/file/text` | 新增纯文本记忆 |
| PUT | `/api/file/:id/desc` | 更新记忆描述（触发重新解析） |
| POST | `/api/memory/apply` | 申请 memoryId |
| POST | `/api/memory/check-topic` | 主题唯一性校验 |
| POST | `/api/memory/upload-token` | 记忆目录内上传凭证（`isMd=true` 用于 md 覆盖） |
| POST | `/api/memory/save` | 保存记忆 |
| POST | `/api/memory/update` | 更新记忆（`needReparse` 由前端 diff 决定） |
| GET | `/api/memory/list` | 主题列表 |
| GET | `/api/memory/detail` | 主题详情（含 `mdContent` 缓存） |
| DELETE | `/api/memory/file` | 删除单个源文件 |
| DELETE | `/api/memory/theme` | 删除整个主题 |
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
- **裸 URL**：附件 URL 不带 scheme（后端正则清掉了），前端 `normalizeAssetUrl()` 补 `https://`；协议相对 `//cdn/...` 跟随页面协议

## 关键设计

- **打字机渲染**：`useTypewriter` 把 burst 涌入的 delta 队列化，按 25ms / 拍、最长 6 字符 / 拍逐字推到 `msg.content`，让 SSE 有可视的逐字呈现；`stop(flush)` 在 `onDone` / `onError` / 用户点停止时强制 drain，避免 UI 与真实收尾脱钩
- **资源去重**：`appendMessageResource` 以 `fileId#chunkIndex` 为 key 合并，缺失 `fileId` 时退到 `eventId`
- **sessionId 双口径**：UI 维度（侧栏分组）= `nanoid`；上行 SSE = `authStore.sessionId`（与 `/api/auth/login` 严格一致）
- **记忆主题编辑变更判定**：进入编辑时记录 `sourceFiles[].fileKey` 集合 + 主观描述 trim 后快照；保存时与当前状态做严格 diff（长度 + 排序后逐位比较）→ `needReparse`。`needReparse=true` 才触发后端异步 AI 重建；完全无改动时仅落库，节省 LLM 与向量重建
- **记忆 fileType 权威性**：新增源文件时按 `File.type > 扩展名` 入栈时算一次并落到 `PendingFile.fileType`；编辑时已有源文件直接用详情接口返回的 `fileType`，**绝不二次推导**——`new File([], name)` 的 `type=""` 会把视频(3) 退化成文本(1)，把 MP4 字节喂给 LLM
- **下载代理**：媒体下载走后端 `/file/:id/download`，由服务端向七牛源站拉取二进制再转发给前端；规避浏览器侧 DNS / CORS / 域名失效导致的 `Failed to fetch`
- **上传队列**：`UploadQueue` 并发 5、3 次重试、指数退避（1s / 2s / 4s）；上传成功时通过 `onItemUpdate` 把七牛返回的 `key` 回写到 `PendingFile.fileKey`，供 `/api/memory/save` 透传

## 测试

```bash
npm test                                              # 全量
node --test test/sse-events.test.mjs                  # 单文件
npx vitest run test/typewriter.test.mjs               # 单文件
```

测试体系分两层：

| 层级 | 工具 | 覆盖 |
|---|---|---|
| 协议 / 状态 | `node:test` | SSE 帧解析、类型分发、normalizeAssetUrl、sessionId 流转、ChatPage 集成契约 |
| 真实 DOM / 时序 / 回归 | `vitest` + jsdom | ChatAttachment mount 出 `<img>` / `<audio>` / `<video>` / 文件卡片；打字机 fake timers 验证 burst 不满屏；`MemoryThemeFormDialog` mount 验证编辑提交时 mp4 的 `fileType` 不被降级；`UploadQueue` + `vi.mock('qiniu-js')` 验证上传成功回写 `fileKey` |

> 现网七牛示例域名：`tixapmuo5.hn-bkt.clouddn.com`（旧文档示例域名已统一替换）。
