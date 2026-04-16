# SRN (Subtitle Relay Network) — Cloudless v2.1

[![SRN Status](https://img.shields.io/endpoint?url=https://srn-worker.delibill.workers.dev/v1/health)](https://srn-worker.delibill.workers.dev)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](./LICENSE)

SRN (Subtitle Relay Network) 不是一个简单的字幕库，而是一套**去中心化的状态同步协议**。它遵循 **"Dumb Relays, Smart Clients"** 设计哲学：中继节点（Relay）仅作为高性能的消息转发器与存储索引，一切过滤与逻辑由用户侧的智能客户端完成。

本项目运行在 **Serverless Cloudless 架构**上，利用 Cloudflare 生态系统实现了全球分布、零运维成本的字幕中继网络。

---

## 🌐 生态系统 (Ecosystem)

SRN 是以下基础设施项目的核心组件：

| 项目 | 角色 |
| :--- | :--- |
| **SRN**（本项目） | 去中心化字幕中继协议 + 边缘节点 |
| [**Hijarr**](https://github.com/DeliYuxiang/hijarr) (将开源) | 智能客户端 — 字幕检索、TMDB 匹配、指纹计算、自动发布至 SRN |
| [**Sonarr**](https://github.com/Sonarr/Sonarr) | 剧集管理 — 自动下载、文件组织，Hijarr 从其获取剧集元数据 |
| [**Caddy**](https://github.com/caddyserver/caddy) | 反向代理 — 在 Hijarr 还未列入sonarr支持的时候承担skyhook/tvdb -> tmdb的中间人 |

> Hijarr 是 SRN 的第一方客户端实现，完整展示了"Smart Client"应如何与 SRN 协议交互。

---

## 📡 活跃中继节点 (Active Relays)

可将以下 URL 配置到 Hijarr 或任意兼容 SRN 协议的客户端：

| 节点名称 | URL | 公钥 | 状态 |
| :--- | :--- | :--- | :--- |
| 原初节点 ⭐ | `https://srn-worker.delibill.workers.dev` | <details><summary>查看公钥</summary><code>cb469165d6b1be0d932fd77bce3eff9c2a4ea728ef600e867fc638de04e4a5dd</code></details> | [![Status](https://img.shields.io/endpoint?url=https://srn-worker.delibill.workers.dev/v1/health)](https://srn-worker.delibill.workers.dev) |
| *社区节点（欢迎提交 PR）* | — | — | — |

> **部署自己的节点**：Fork 本仓库，在 GitHub Secrets 中配置 `CLOUDFLARE_API_TOKEN`，Workflow 会全自动完成基础设施申请与部署。详见下方[部署指南](#%EF%B8%8F-部署指南)。

---

## 🚀 核心架构 (Cloudless)

SRN 2.x 运行在 Cloudflare 边缘节点，基于 **Ed25519 签名** 确保数据的不可篡改性：

- **Edge Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/) (TypeScript / Hono) — 处理中继逻辑与签名校验
- **L1 Hot Index**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (分布式 SQLite) — 元数据与标签，支持毫秒级检索
- **Asset Storage**: [Cloudflare R2](https://developers.cloudflare.com/r2/) (S3 兼容) — 字幕二进制文件，**零流出流量费 (Zero Egress)**
- **Cryptography**: 每个 Event 附带公钥 (PubKey) + Ed25519 签名，边缘节点实时校验

---

## 🛠️ 部署指南

### 快速部署（推荐）

只需 Fork 本仓库并在 GitHub 仓库设置中配置以下两个 Secrets：

| Secret | 说明 |
| :--- | :--- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token（需要 Workers、D1、R2 权限） |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |

推送任意 commit 到 `main`，Workflow 会自动完成 D1 数据库、R2 存储桶的创建与首次部署。

### 本地开发

```bash
cd worker
npm install
npm run dev          # 启动本地 wrangler 开发服务器
npm test             # 运行集成测试
npm run format:fix   # 自动格式化
```

### 可选配置（GitHub Secrets）

| Secret | 默认值 | 说明 |
| :--- | :--- | :--- |
| `SRN_SEARCH_LIMIT` | `3` | TMDB 搜索接口每分钟速率限制 |
| `SRN_DEFAULT_LIMIT` | `999` | 其他接口每分钟速率限制 |

---

## 📋 API 规范 (v2)

本项目提供标准 RESTful 接口，附带自动生成的 Swagger 文档（`/ui`）。

| 路径 | 方法 | 功能 | 参数 / 说明 |
| :--- | :--- | :--- | :--- |
| `/` | `GET` | **门户首页** | Petite-Vue SPA — 支持按剧集聚合浏览与下载 |
| `/v1/health` | `GET` | **健康徽章** | Shields.io 兼容，实时显示在线状态与索引总数 |
| `/v1/identity` | `GET` | **节点身份** | 返回公钥、版本号与当前部署的 commit SHA |
| `/v1/events` | `GET` | **查询事件** | `tmdb`, `season`, `ep`, `language`, `archive_md5` |
| `/v1/events` | `POST` | **发布事件** | 需要 Ed25519 签名认证，见下方说明 |
| `/v1/events/:id/content` | `GET` | **内容下载** | 按事件 ID 流式输出，R2 直出（gzip 透明编码） |
| `/v1/tmdb/search` | `GET` | **TMDB 搜索代理** | 本地标题缓存 + 子串匹配，减少外部 API 调用 |
| `/ui` | `GET` | **Swagger UI** | 交互式 API 文档 |
| `/doc` | `GET` | **OpenAPI JSON** | 标准 OpenAPI v3 Schema 导出 |

### 签名认证 (发布事件)

`POST /v1/events` 使用 multipart/form-data，字段：

- `event`：事件 JSON 载荷
- `file`：字幕二进制文件（≤ 5MB）

必须携带的 Header：

- `X-SRN-PubKey`：发布者 Ed25519 公钥（hex）
- `X-SRN-Signature`：对 `event` 字段 JSON 的 Ed25519 签名（hex）

中继节点校验：签名有效性 → 文件大小 → `archive_md5` 与实际文件一致。

---

## 📦 近期更新 (v2.1)

- **UI 剧集聚合视图**：门户首页现将同一剧集的多语言字幕聚合为单个徽章卡片，不再逐条平铺
- **TMDB 本地缓存 + 子串搜索**：`/v1/tmdb/search` 在 D1 内建立标题缓存层，降低对 TMDB API 的依赖与延迟
- **速率限制**：TMDB 搜索与其他接口分别受独立的 Cloudflare Rate Limiter 保护，限额可通过 GitHub Secrets 配置
- **维护模式 (Maintenance Mode)**：部署流程在数据库迁移期间自动启用维护模式，迁移完成后无缝切回
- **部署失败自动恢复**：若部署过程出现异常，Emergency Restore 步骤会强制关闭维护模式，避免服务长时间中断
- **D1 备份完整性校验**：每次部署前对 D1 进行 SQL 导出并上传至 R2，通过 MD5 轮验（本地下回再对比）确认备份完好
- **部署溯源 (Commit SHA 追踪)**：Worker 在部署时将 commit SHA 烘焙进运行时，备份命名与回滚均通过查询线上 `/v1/identity` 获取真实已部署版本，而非依赖 git 历史推断
- **集成测试覆盖**：维护模式、健康检查、D1 表存在性等场景均有 Vitest 集成测试覆盖

---

## 📂 目录结构

```
.
├── worker/              # Cloudflare Worker 源代码 (TypeScript)
│   ├── src/
│   │   ├── index.ts     # 入口，路由注册
│   │   ├── routes/      # API 路由分组
│   │   ├── ui.ts        # 门户 SPA 渲染
│   │   └── types.ts     # 类型定义与协议常量
│   ├── migrations/      # 增量 D1 Schema 迁移文件
│   └── wrangler.jsonc   # Cloudflare 绑定配置
└── .github/workflows/
    ├── deploy.yml       # CI/CD：测试 → 备份 → 迁移 → 部署
    └── rollback.yml     # 手动触发数据库回滚
```

---

**"Subtitles are the bridge of civilization; SRN is the bridge that cannot be burned."**  
—— *Core Dumped! 2026*
