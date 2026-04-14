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
| **索引数据库** | 全文检索、元数据存储 | Cloudflare D1 (SQLite) |
| **对象存储** | 字幕二进制文件存储 | Cloudflare R2 |
| **安全防御** | 签名验证、限流、反爬 | CF WAF + Web Crypto API |

## 3. 数据模型 (分层正规化)

为了彻底解决数据冗余并支持复杂的扩展标签（如翻译组、分辨率等），我们采用了正规化设计。详细 SQL 定义请参考 [SRN_NORMALIZED_SCHEMA.md](file:///users/PAS0497/deliangus/project/ServiceCenter/srn/docs/SRN_NORMALIZED_SCHEMA.md)。

### 核心表结构预览：
- **`blobs`**: 静态文件存储信息（去重核心：`content_md5`）。
- **`events`**: 原始协议报文与 Ed25519 签名。
- **`event_metadata`**: 影视作品硬索引（TMDB, S, E, Lang）。
- **`event_tags`**: 动态扩展标签（翻译组、压制组、编码等）。

## 4. 关键业务流程

### A. 处理上传 (POST /v1/events)
1. **身份验证**：校验 `pubkey` 是否被允许或受限。
2. **签名核解**：通过 Web Crypto API 验证 `sig` 是否与 Payload 匹配。
3. **分流存储**：
    - 若 `content_md5` 已存在，跳过 R2 写入。
    - 若不存在，将 Binary 流存入 R2，并同步在 `blobs` 表建档。
4. **属性提取**：解析 Tags，将核心属性存入 `event_metadata`，其余存入 `event_tags`。

### B. 安全防护 (Gatekeeper)
- **防刷限流**：针对不同 PubKey 使用分布式计数器进行流控。
- **资源保护**：R2 资源不设公开访问，Worker 根据校验结果直接 Proxy 内容流。

## 5. 设计理念：Dumb Relay, Smart Client
- **Relay (中继)**：仅负责签名的合法性检查、去重存储和按索引返回元数据。它不关心字幕的具体内容，只关心“谁在什么时间发了什么”。
- **Client (Hijarr)**：负责解析本地文件、计算指纹、生成符合规范的 Event 报文并进行签名。

---
**状态**: 已通过架构评审
**目标版本**: `v2.0`
