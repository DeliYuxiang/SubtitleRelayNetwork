# SRN 云端迁移历史记录

> **状态：迁移已完成 (v3.0.0)**
>
> 本文件记录了 SRN 中继从本地 Go/SQLite 架构迁移至 Cloudflare Serverless (Worker + D1 + R2) 架构的历史路线图，供参考。所有阶段均已完成。

## 第一阶段：基础设施搭设 ✅

1. **Worker 项目初始化**：
    - 使用 `wrangler` 创建 TypeScript 项目（Hono + Zod OpenAPI）。
    - 使用 Web Crypto API 实现 Ed25519 协议签名验证。
2. **D1 元数据库初始化**：
    - 通过增量迁移文件 (`worker/migrations/0001`–`0011`) 建立完整 schema。
3. **R2 存储桶配置**：
    - 主存储桶存放 gzip 压缩的字幕文件 (`v1/<md5>.gz`)。
    - 备份存储桶存放 D1 SQL 导出快照，由 CI/CD 在每次部署前自动创建。

## 第二阶段：工具链升级 ✅

历史数据通过 `worker/data-migrations/` 下的 Node.js 脚本批量推送至 D1，由 CI/CD 流水线的 `run-data-migrations` 阶段自动执行（幂等，跟踪于 `_srn_migrations` 表）。

## 第三阶段：客户端 (Hijarr) 适配 ✅

Hijarr 已完全解耦本地存储，通过 `POST /v1/events` API 推送字幕，利用 `archive_md5` 实现整季聚合。

## 第四阶段：安全与限速 ✅

1. **Proof-of-Work (PoW)**：基于 Nonce 的动态难度挑战，IP/公钥双维度计数，每 5 次请求/分钟难度 +1（上限 +4）。VIP 白名单绕过。
2. **多级速率限制**：CF Rate Limiter 分别限制搜索（3/min）、下载（6/min）、通用（999/min）接口。
3. **Backblaze B2 异地备份**（新增）：字幕 Blob 在上传时同步写入 B2，在下载时懒迁移；完全可选，env 变量未设置则静默跳过。

## 数据模型核心字段

| 字段 | 作用 | 来源 |
| :--- | :--- | :--- |
| `content_md5` | 核心去重指纹（物理层），防止 R2 存储膨胀。 | 客户端上传前计算。 |
| `dedup_hash` | 语义去重指纹（逻辑层），防止同一用户重复发布相同字幕。 | 中继在接收时计算。 |
| `archive_md5` | 关联整季、整包资源，实现聚合预览。 | 客户端从压缩包名/目录结构解析。 |
| `source_uri` | 记录原始出处（如磁力、RSS 链接等）。 | 采集器源数据。 |
| `r2_key` | 字幕在 R2/B2 存储中的唯一定位键（格式 `v1/<md5>.gz`）。 | 中继生成。 |

<!-- doc-sha: edefb69835eb9811a2f41aba039736e552aac6e3 -->
