# Echo Web

> 智能对话 + 文件管理 一体化 Web 平台，基于 Vue 3 + TypeScript + Vite 构建。

## 项目简介

Echo Web 是一个面向个人与中小团队的 AI 助手与文件管理前端，提供：

- **智能对话** —— 基于 SSE 流式输出的多会话 AI 对话，支持模型选择、消息编辑/重试、Markdown 渲染、图片预览。
- **文件管理** —— 集成七牛云对象存储，支持拖拽 / 点击上传、批量上传、实时进度、失败重试、文件查看与删除。
- **首页导航** —— 一站式入口，深色风格，符合现代 SaaS 视觉语言。

## 技术栈

| 类别       | 选型                                                 |
| ---------- | ---------------------------------------------------- |
| 框架       | Vue 3.5（`<script setup>` SFC）                      |
| 语言       | TypeScript 5.9                                       |
| 构建工具   | Vite 8                                               |
| UI 组件库  | Element Plus 2.13 + `@element-plus/icons-vue`        |
| 状态管理   | Pinia 3                                              |
| 路由       | Vue Router 4（History 模式）                         |
| HTTP 客户端 | Axios 1                                             |
| 对象存储   | 七牛云（`qiniu-js` 3.4，浏览器直传）                 |
| 工具库     | `nanoid`（ID 生成）                                  |
| 类型检查   | `vue-tsc`                                            |
| 演示后端   | Go 标准库 `net/http`（`server.go`）                  |

## 目录结构

```
echo-web/
├── server.go                  # Go 演示后端（SSE + 对话 + IP）
├── index.html                 # 入口 HTML
├── vite.config.ts             # Vite 配置（@ 别名、/api 代理）
├── package.json
├── tsconfig*.json
├── .env                       # 前端环境变量（API 地址、默认模型）
├── .env.qiniu                 # 七牛云配置样例
├── public/                    # 静态资源
└── src/
    ├── main.ts                # 入口：注册 Element Plus / Pinia / Router
    ├── App.vue                # 根组件（<RouterView />）
    ├── api/                   # 接口请求层
    │   ├── index.ts           # Axios 实例 + 拦截器
    │   ├── chat.ts            # 对话（流式 / 非流式）
    │   └── upload.ts          # 文件上传 / 注册 / 列表 / 删除
    ├── components/            # 通用组件
    │   ├── AppHeader.vue      # 顶部导航
    │   └── AdminSidebar.vue   # 后台侧边栏
    ├── layouts/               # 布局壳
    │   ├── DefaultLayout.vue  # 用户端布局（首页 / 对话）
    │   └── AdminLayout.vue    # 后台布局（文件管理）
    ├── router/                # 路由配置
    ├── stores/                # Pinia 状态
    │   ├── chat.ts            # 会话 / 消息 / 流式状态
    │   └── upload.ts          # 文件列表与上传状态
    ├── types/                 # TypeScript 类型定义
    ├── views/                 # 页面级视图
    │   ├── home/HomePage.vue
    │   ├── chat/ChatPage.vue
    │   ├── models/ModelsPage.vue
    │   └── admin/FileUploadPage.vue
    ├── styles/global.css
    └── assets/
```

## 快速开始

### 1. 安装依赖

```bash
npm install
# 或
pnpm install
```

### 2. 启动前端开发服务

```bash
npm run dev
```

默认监听 `http://localhost:5173`，所有 `/api/**` 请求由 Vite 代理到 `http://localhost:8080`（见 `vite.config.ts`）。

### 3. 启动演示后端（可选）

仓库自带一个 Go 写的最小演示后端，提供 SSE 对话与客户端 IP 接口：

```bash
go run server.go
# 监听 :8080，路由：
#   POST /api/chat               SSE 流式对话
#   POST /api/chat/completions   非流式 JSON 对话
#   GET  /api/ip                 客户端 IP
```

> 该演示后端不连接真实大模型，仅按关键字返回固定话术，方便本地联调前端流式协议。

### 4. 打包构建

```bash
npm run build      # vue-tsc 类型检查 + vite build，产物在 dist/
npm run preview    # 本地预览构建产物
```

## 环境变量

在项目根目录创建 `.env`（或 `.env.development` / `.env.production`）：

| 变量名                    | 必填 | 说明                                                       |
| ------------------------- | ---- | ---------------------------------------------------------- |
| `VITE_API_BASE_URL`       | 否   | 后端 API 基址，默认 `/api`（走 Vite 代理到 `:8080`）       |
| `VITE_DEFAULT_CHAT_MODEL` | 否   | 默认对话模型，如 `gpt-4o`；会话初始化时会使用该值          |

> `.env.qiniu` 为配置样例参考，七牛云 AK/SK/Bucket/域名等敏感信息应在 **后端** 保存，前端仅使用后端签发的上传凭证，请勿在浏览器端硬编码。

## 功能详解

### 智能对话（`/chat`）

- **多会话管理**：左侧栏列出所有会话，支持新建、删除、切换。
- **SSE 流式输出**：通过 `fetch` 读取 `text/event-stream`，逐 chunk 追加到消息气泡；支持「停止生成」（`AbortController`）。
- **消息操作**：用户消息支持「复制 / 编辑 / 重试」；编辑后自动删除原 assistant 回复并重新生成。
- **Markdown 渲染**：支持代码块（` ``` `）、行内代码、加粗、斜体、换行。
- **图片消息**：assistant 回复可携带 `imageUrl`，自动渲染并支持预览。
- **快捷提问**：空状态提供 4 个一键示例。
- **身份与会话标识**：`userId` 持久化于 `localStorage`；`defaultSessionId` 基于客户端 IP 生成，便于跨刷新保留上下文。

### 文件管理（`/admin/upload`）

- **七牛云直传**：前端 → 后端 `/file/token` 申请上传凭证 → 浏览器使用 `qiniu-js` 分片直传至七牛云 → 通知后端 `/file/register` 入库。
- **交互**：支持点击 / 拖拽到区域上传，批量最多 10 个并发，单文件上限 2GB。
- **状态机**：`pending → uploading_qiniu → uploading_backend → success`（或 `error`），文件列表实时反映状态与进度。
- **失败重试**：上传失败可一键重试；若七牛云已成功但后端注册失败，重试时仅重新通知后端，节省再次上传流量。
- **统计面板**：总文件数、已上传、失败数、累计大小，支持「清空记录」「一键上传全部」。

### 首页（`/home`）

- 渐变深色背景，居中品牌展示 + 两个核心入口卡片（智能对话 / 文件管理），动画与微交互统一。

## 后端接口约定

前端依赖的后端接口（演示版见 `server.go`，生产版需自行实现）：

| Method | Path                  | 说明                                |
| ------ | --------------------- | ----------------------------------- |
| POST   | `/api/chat`           | SSE 流式对话，返回 `data: ...` 帧  |
| POST   | `/api/chat/completions` | 非流式 JSON 对话，OpenAI 兼容格式 |
| GET    | `/api/ip`             | 客户端 IP（用于生成默认 sessionId） |
| POST   | `/api/file/token`     | 申请七牛云上传凭证                  |
| POST   | `/api/file/upload`    | 服务端中转上传（备用通道）          |
| POST   | `/api/file/register`  | 上传完成后通知后端入库              |
| GET    | `/api/file/upload`    | 文件列表                            |
| DELETE | `/api/file/upload/:id`| 删除文件                            |

SSE 帧协议：

```
data: {"choices":[{"delta":{"content":"..."}}]}\n\n
data: [DONE]\n\n
```

非流式响应为标准 `application/json`，形如 `{ id, choices: [{ message: { role, content }, finish_reason }], usage }`。
