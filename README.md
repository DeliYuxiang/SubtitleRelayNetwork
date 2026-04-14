# SRN (Subtitle Relay Network) — Cloudless v2.0

[![SRN Status](https://img.shields.io/endpoint?url=https://srn-worker.delibill.workers.dev/v1/health)](https://srn-worker.delibill.workers.dev)

SRN (Subtitle Relay Network) 不是一个简单的字幕库，而是一套**去中心化的状态同步协议**。它遵循 **"Dumb Relays, Smart Clients"** 设计哲学：中继节点（Relay）仅作为高性能的消息转发器与存储索引，一切过滤与逻辑由用户侧的智能客户端（如 Hijarr）完成。

本项目已进化至 Phase 2.0：**Serverless Cloudless 架构**。利用 Cloudflare 生态系统，实现了全球分布、零运维成本且极致扩展的字幕中继网络。

---

## 🚀 核心架构 (Cloudless)

SRN 2.0 运行在 Cloudflare 边缘节点，基于 **Ed25519 签名** 确保数据的不可篡改性：

- **Edge Runtime**: 使用 [Cloudflare Workers](https://workers.cloudflare.com/) (TypeScript/Hono) 处理中继逻辑。
- **L1 Hot Index**: 使用 [Cloudflare D1](https://developers.cloudflare.com/d1/) (分布式 SQLite) 存储元数据与标签，支持毫秒级检索。
- **Storage (Asset)**: 使用 [Cloudflare R2](https://developers.cloudflare.com/r2/) (S3 兼容存储) 存放字幕二进制文件，享受零流出流量费 (Zero Egress Fees)。
- **Cryptography**: 每个 Event 必须附带公钥 (PubKey) 及其对应的 Ed25519 签名 (Sig)，在边缘节点实时校验。

---

## 🛠️ 工具链与运行

### 1. 中继节点部署 (Cloudflare Worker)
```bash
cd worker
npm install
# 初始化数据库
npx wrangler d1 execute srn_metadata --file=./schema.sql
# 部署到边缘节点
npx wrangler deploy
```

### 2. 身份密钥对管理 (Go)
```bash
CGO_ENABLED=0 go run cmd/keygen/main.go
```

### 3. 数据迁移与同步 (Cloud Sync)
将本地 1.8GB 数据或旧版 SRN 节点数据同步至云端：
```bash
CGO_ENABLED=0 go run cmd/deploy/main.go -url https://your-srn-worker.dev -db srn.db
```

---

## 🌐 社区枢纽 (Community Hub)

SRN 是一个去中心化的网络。你可以 Fork 本仓库并部署自己的中继节点，然后提交 Pull Request 将你的 URL 加入 [RELAYS.md](./RELAYS.md)。

*   **部署自己的节点**：只需在 GitHub Secrets 中配置 `CLOUDFLARE_API_TOKEN`，Workflow 会自动完成基础设施申请。
*   **节点清单**：查看全球活跃的 [中继节点注册表](./RELAYS.md)。

---

## 📡 API 规范 (v2.0)

- `GET  /v1/events`: 查询事件列表。支持 TMDB、季、集、语言等硬索引过滤。
- `POST /v1/events`: 发布新事件。支持 Multipart 上传 (Event JSON + Binary File)。
- `GET  /v1/events/:id/content`: 获取事件原始载荷。Worker 负责从 R2 流式输出。

---

## 📂 目录结构

- `worker/`: Cloudflare Worker 源代码 (TypeScript)。
- `cmd/deploy/`: 云端部署与同步工具 (Go)。
- `cmd/keygen/`: 身份密钥生成器 (Go)。
- `internal/event/`: 协议报文定义与签名逻辑 (v2 JSON 规范)。
- `internal/storage/`: 本地 SQLite 读取逻辑（用于迁移）。

---

**“Subtitles are the bridge of civilization; SRN is the bridge that cannot be burned.”**  
—— *Core Dumped! 2026*
