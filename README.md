# SRN (Subtitle Relay Network) — Cloudless v2.1

[![SRN Status](https://img.shields.io/endpoint?url=https://srn.majiyabakunai.moe/v1/health)](https://srn.majiyabakunai.moe)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](./LICENSE)

SRN (Subtitle Relay Network) 不是一个简单的字幕库，而是一套**去中心化的状态同步协议**。它遵循 **"Dumb Relays, Smart Clients"** 设计哲学：中继节点（Relay）仅作为高性能的消息转发器与存储索引，一切过滤与逻辑由用户侧的智能客户端完成。

本项目运行在 **Serverless Cloudless 架构**上，利用 Cloudflare 生态系统实现了全球分布、零运维成本的字幕中继网络。

---

## 🌐 生态系统 (Ecosystem)

SRN 是以下基础设施项目的核心组件：

| 项目 | 角色 |
| :--- | :--- |
| **SRN**（本项目） | 去中心化字幕中继协议 + 边缘节点 |
| [**Hijarr**](https://github.com/DeliYuxiang/Hijarr) | Smart Client — DNS 劫持(Skyhook/TVDB→TMDB 中文化)、Torznab 分级裂变搜索、SRN 字幕自动同步与 MD5 锁定 |
| [**Sonarr**](https://github.com/Sonarr/Sonarr) | 剧集管理 — 自动下载、文件组织，Hijarr 从其获取剧集元数据 |
| [**Caddy**](https://github.com/caddyserver/caddy) | 反向代理 — 建议作为 Hijarr 的 TLS 终止层与访问控制层 |

> Hijarr 是 SRN 的第一方客户端实现（AGPL v3 开源），完整展示了"Smart Client"应如何与 SRN 协议交互。部署文档及 Docker Compose 配置详见 [Hijarr 项目主页](https://github.com/DeliYuxiang/Hijarr)。

---

## 📡 活跃中继节点 (Active Relays)

可将以下 URL 配置到 Hijarr 或任意兼容 SRN 协议的客户端：

| 节点名称 | URL | 公钥 | 状态 |
| :--- | :--- | :--- | :--- |
| 原初节点 ⭐ | `https://srn.majiyabakunai.moe` | <details><summary>查看公钥</summary><code>cb469165d6b1be0d932fd77bce3eff9c2a4ea728ef600e867fc638de04e4a5dd</code></details> | [![Status](https://img.shields.io/endpoint?url=https://srn.majiyabakunai.moe/v1/health)](https://srn.majiyabakunai.moe) |
| *社区节点（欢迎提交 PR）* | — | — | — |

> **部署自己的节点**：Fork 本仓库，在 GitHub Secrets 中配置 `CLOUDFLARE_API_TOKEN`，Workflow 会全自动完成基础设施申请与部署。详见下方[部署指南](#%EF%B8%8F-部署指南)。

---

## 🚀 核心架构 (Cloudless)

SRN 2.x 运行在 Cloudflare 边缘节点，基于 **Ed25519 签名** 确保数据的不可篡改性：

- **Edge Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/) (TypeScript / Hono) — 处理中继逻辑与签名校验
- **L1 Hot Index**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (分布式 SQLite) — 元数据与标签，支持毫秒级检索
- **Primary Storage**: [Cloudflare R2](https://developers.cloudflare.com/r2/) (S3 兼容) — 字幕二进制文件，**零流出流量费 (Zero Egress)**
- **Backup Storage**: [Backblaze B2](https://www.backblaze.com/b2/cloud-storage.html) (S3 兼容，可选) — 字幕 Blob 异地备份，上传时同步写入、下载时懒迁移
- **Cryptography**: 每个 Event 附带公钥 (PubKey) + Ed25519 签名，并要求 Proof-of-Work 验证

---

## 🛠️ 部署指南

### 快速部署 (GitHub Actions)

为了实现自动化部署，你需要在 GitHub Repository Settings -> Secrets and variables 中配置以下内容。Workflow 会全自动完成基础设施申请、数据库迁移与部署。

#### GitHub Secrets (加密敏感信息)

| Secret | 说明 |
| :--- | :--- |
| `CLOUDFLARE_API_TOKEN` | 具有 Worker, D1, R2 编辑权限的 API 令牌 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |
| `RELAY_PRIVATE_KEY` | 中继服务器的 Ed25519 私钥 (Hex) |
| `RELAY_PUBLIC_KEY` | 中继服务器的 Ed25519 公钥 (Hex) |
| `TMDB_TOKEN` | (可选) TMDB API 访问令牌 (v4 auth) |
| `FRONTEND_URL` | (可选) 前端 CDN URL，用于 Worker 代理 |
| `B2_KEY_ID` | (可选) Backblaze B2 应用密钥 ID，用于字幕备份 |
| `B2_APP_KEY` | (可选) Backblaze B2 应用密钥，用于字幕备份 |

#### GitHub Variables (公共配置项)

| Variable | 默认值 | 说明 |
| :--- | :--- | :--- |
| `SRN_POW_DIFFICULTY` | `0` | 基础 PoW 难度 (哈希前导零个数)，`0` 为禁用 |
| `SRN_PUBKEY_WHITELIST` | (空) | VIP 公钥白名单 (逗号分隔的 Hex) |
| `SRN_SEARCH_LIMIT` | `3` | TMDB 搜索接口每分钟速率限制 |
| `SRN_DEFAULT_LIMIT` | `999` | 常规接口每分钟速率限制 |
| `SRN_CONTENT_LIMIT` | `6` | 内容下载接口每分钟速率限制 |
| `SRN_BACKUP_RETENTION_DAYS` | `90` | R2 备份桶对象保留天数，超期自动删除 |
| `B2_ENDPOINT` | `https://s3.us-west-004.backblazeb2.com` | Backblaze B2 S3 兼容端点 |
| `TF_B2_BUCKET_NAME` | `srn-backup-prod` | Backblaze B2 存储桶名称 |

### 本地开发与测试

本项目的本地开发环境使用 `wrangler.test.jsonc` 配置，确保开发过程不影响生产环境。

```bash
cd worker
npm install

# 🚀 快速启动 (推荐)
npm run dev:test     # 交互式启动：自动加载 .env，提示是否拉取 D1 快照并运行

# 📥 数据库同步
npm run dev:test:pull # 强制拉取远程 D1 快照并启动开发服务器
npm run db:pull       # 仅拉取远程 D1 快照到本地（不启动服务器）
npm run test:setup    # 仅执行本地数据库迁移（初始化空库）

# 🧪 其他指令
npm test             # 运行 Vitest 集成测试
npm run format:fix   # 自动格式化代码
```

> **提示**：拉取快照功能依赖于 `.env` 中的 `SRN_D1_NAME` 变量。请确保你已根据 `worker/.env.example` 配置好本地环境变量。


---

## 📋 API 规范 (v3)

本项目提供标准 RESTful 接口，附带自动生成的 Swagger 文档（`/ui`）。

### 身份认证与 PoW 机制
自 v3 版本起，所有受保护的写入与查询操作均需要 **Nonce-based PoW 验证**：
1. 调用 `/v1/challenge` 获取 `salt` 和难度 `k`。
2. 在本地寻找 `nonce` 使得 `SHA256(salt + pubkey + nonce)` 满足 `k` 个前导零。
3. 携带 `X-SRN-PubKey`, `X-SRN-Nonce`, `X-SRN-Signature` 头部发起请求。

详情请参考：[SRN 认证协议 v3 (docs/SRN_AUTH_V3.md)](docs/SRN_AUTH_V3.md)

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

<!-- doc-sha: edefb69835eb9811a2f41aba039736e552aac6e3 -->
