# SRN Cloudless 架构设计文档

## 1. 概述
SRN (Subtitle Relay Network) Cloudless 是 SRN 中继节点的 Serverless 演进版本。它利用 Cloudflare 的边缘计算生态（Workers + D1 + R2），旨在提供一个高性能、低成本且全球分布的字幕分发中转站。

### 核心目标
- **极致扩展性**：无需维护物理服务器，即可支撑万级并发查询。
- **低成本运维**：利用 R2 的零流出流量费（Zero Egress Fees）和 Workers 的免费/标准配额。
- **智能化聚合**：支持 TMDB ID 索引、季度/集数管理、以及基于压缩包 MD5 的资源聚合。

## 2. 基础设施组件

| 组件 | 角色 | 技术实现 |
| :--- | :--- | :--- |
| **边缘计算** | 中继逻辑、权限验证、路由转发 | Cloudflare Workers (TypeScript) |
| **索引数据库** | 元数据存储与检索 | Cloudflare D1 (SQLite) |
| **主对象存储** | 字幕二进制文件 (gzip 压缩) | Cloudflare R2 |
| **备份对象存储** | 字幕 Blob 异地备份（可选） | Backblaze B2 (S3 兼容) |
| **安全防御** | Ed25519 签名验证、PoW 挑战、速率限制 | Web Crypto API + CF Rate Limiter |

## 3. 数据模型 (分层正规化)

为了彻底解决数据冗余并支持复杂的扩展标签（如翻译组、分辨率等），我们采用了正规化设计。详细 SQL 定义请参考 [SRN_NORMALIZED_SCHEMA.md](file:///users/PAS0497/deliangus/project/ServiceCenter/srn/docs/SRN_NORMALIZED_SCHEMA.md)。

### 核心表结构预览：
- **`blobs`**: 静态文件存储信息（去重核心：`content_md5`）。
- **`events`**: 原始协议报文与 Ed25519 签名。
- **`event_metadata`**: 影视作品硬索引（TMDB, S, E, Lang）。
- **`event_tags`**: 动态扩展标签（翻译组、压制组、编码等）。

## 4. 关键业务流程

### A. 处理上传 (POST /v1/events)
1. **PoW 验证**：验证 `X-SRN-Nonce` 满足当前难度 `k`；VIP 白名单绕过。
2. **签名核解**：通过 Web Crypto API 验证 `X-SRN-Signature` 与规范化消息匹配。
3. **语义去重**：Kind 1001 计算 `dedup_hash`，若已存在则直接返回现有事件 ID（`deduplicated: true`）。
4. **分流存储**：
    - 将文件 gzip 压缩后写入 R2（`v1/<md5>.gz`）。
    - 同时通过 `BackupBucket.write()` 异步镜像到 Backblaze B2（`waitUntil`）。
    - 在 `blobs` 表建档（`INSERT OR IGNORE`，MD5 物理去重）。
5. **属性提取**：将核心属性存入 `event_metadata`，溯源信息存入 `event_sources`，处理生命周期（1002/1003/1011）。

### B. 处理下载 (GET /v1/events/:id/content)
1. **PoW + 签名验证**（签名消息 = 当前 Unix 分钟数字符串）。
2. 从 R2 读取 gzip blob，**服务端解压缩**后返回明文（避免 CDN 干扰 `Content-Encoding`）。
3. 通过 `BackupBucket.checkExistsOrWrite()` 懒迁移：对 B2 发送 HEAD 请求，若不存在则异步 PUT。

### C. 安全防护 (Gatekeeper)
- **PoW 挑战**：`GET /v1/challenge` 返回 `{ salt, k, vip }`；难度按 IP/公钥每分钟请求次数动态递增（每 5 次 +1，上限 +4）。
- **速率限制**：搜索（3 req/min）、下载（6 req/min）、通用（999 req/min）使用独立的 CF Rate Limiter；VIP 绕过速率限制。
- **资源保护**：R2/B2 资源不直接公开，全部通过 Worker 校验后 Proxy。

## 5. 设计理念：Dumb Relay, Smart Client
- **Relay (中继)**：仅负责签名的合法性检查、去重存储和按索引返回元数据。它不关心字幕的具体内容，只关心“谁在什么时间发了什么”。
- **Client (Hijarr)**：负责解析本地文件、计算指纹、生成符合规范的 Event 报文并进行签名。

---
**状态**: 已部署生产 (v3.0.0)
**当前版本**: `v3.0.0`

<!-- doc-sha: edefb69835eb9811a2f41aba039736e552aac6e3 -->
