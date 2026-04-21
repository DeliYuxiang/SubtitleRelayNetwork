# SRN 数据库正规化与 Hijarr 协议规范

## 1. 数据库正规化设计 (Cloudflare D1)

为了解决数据冗余并提升检索效率，我们将 Event 协议对象与其承载的数据内容（Blobs）、索引元数据（Metadata）以及扩展标签（Tags）进行拆解。当前 schema 由迁移文件 `0001`–`0011` 叠加而成。

### A. 基础属性表
- **`blobs`**: 存储物理文件指纹与路径。
    - `content_md5` (TEXT, PK): 文件唯一的 MD5 指纹。
    - `r2_key` (TEXT): 对应 R2 中的 Key（格式 `v1/<md5>.gz`）。
    - `size` (INT): 文件字节大小。
    - `created_at` (INT): 首次上传时间。

### B. 核心协议表
- **`events`**: 存储完整的协议报文，用于验证签名。
    - `id` (TEXT, PK): 事件唯一 ID (SHA256)。
    - `pubkey` (TEXT): 发布者公钥。
    - `kind` (INT): 1001/1002/1003/1011。
    - `content_md5` (TEXT, FK): 关联的文件指纹（无内容事件为 `""`）。
    - `tags` (TEXT): 原始 Tags 的 JSON 备份。
    - `sig` (TEXT): Ed25519 签名。
    - `created_at` (INT): 中继接收时间（Unix 秒）。

### C. 搜索索引表 (一等公民：必填属性)
- **`event_metadata`**: 专为影视检索优化的硬索引。
    - `event_id` (TEXT, PK, FK): 关联 events.id。
    - `tmdb_id` (INTEGER): TMDB 唯一标识。
    - `season_num` (INTEGER): 季（电影为 0）。
    - `episode_num` (INTEGER): 集（电影为 0）。
    - `language` (TEXT): 语言代码 (如 zh-CN)；缺省为 `"und"`。
    - `archive_md5` (TEXT): 原始包指纹（用于整季聚合）。
    - `dedup_hash` (TEXT, UNIQUE): 语义去重指纹 `MD5(pubkey|content_md5|tmdb_id|season_num|episode_num|language|archive_md5)`。
    - *索引*: `(tmdb_id, season_num, episode_num)`、`(season_num, episode_num)`、`(season_num, episode_num, language)`。

### D. 扩展标签表 (二等公民：多变属性)
- **`event_tags`**: 动态键值对，支持无限扩展。
    - `event_id` (TEXT, FK): 关联 events.id。
    - `name` (TEXT): 标签名 (如 `group`, `resolution`, `codec`, `fansub`)。
    - `value` (TEXT): 标签值 (如 `LoliHouse`, `1080p`, `HEVC`)。
    - *索引*: `(name, value)` 复合索引用于快速过滤。

### E. 溯源表
- **`event_sources`**: 记录字幕的溯源信息。
    - `event_id` (TEXT, FK): 关联 events.id。
    - `source_type` (TEXT): 溯源类型（如 `torrent`、`rss`）。
    - `source_uri` (TEXT): 溯源原始链接。

### F. 生命周期侧表
- **`event_lifecycle`**: 记录被去激活（撤回/替换）的报文。
    - `event_id` (TEXT, PK, FK → events): 被去激活的事件。
    - `deactivated_by` (TEXT, FK → events): 触发去激活的 1002/1003/1011 事件 ID。
    - `deactivated_at` (INT): 去激活时间。
    - `pubkey` (TEXT): 操作者公钥。

### G. 身份别名表
- **`event_keys`**: 记录公钥的人类可读别名（来自 Kind 1011）。
    - `pubkey` (TEXT, PK): 发布者公钥。
    - `alias` (TEXT): 别名（如翻译组名称）。
    - `url` (TEXT): 主页 URL。
    - `about` (TEXT): 简介。
    - `event_id` (TEXT, FK): 最新的 1011 事件 ID。
    - `created_at` (INT): 更新时间。

### H. PoW 挑战计数表
- **`challenge_counts`**: 每分钟 IP/公钥请求计数，用于动态 PoW 难度调整。
    - `counter_key` (TEXT, PK): `ip:<ip>` 或 `pk:<pubkey>`。
    - `count` (INT): 当前分钟计数。
    - `minute` (INT): Unix 分钟时间戳（用于过期清理）。

### I. 统计缓存表
- **`relay_stats`**: 缓存的统计计数器（5 分钟 TTL 懒刷新）。
    - `key` (TEXT, PK): `event_count` / `unique_titles` / `unique_episodes`。
    - `value` (INT): 当前缓存值。
    - `updated_at` (INT): 最后更新的 Unix 时间戳。

### J. TMDB 缓存表
- **`tmdb_title_cache`**: 持久化 TMDB 标题搜索缓存（字幕库 L2 知识库）。
    - `tmdb_id` (INT, PK): TMDB 唯一标识。
    - `name` / `type` / `year` / `poster` (TEXT): 标题元数据。
    - `cached_at` (INT): 缓存时间。
    - *索引*: `name` 字段用于子串模糊匹配。
- **`tmdb_season_cache`**: 持久化 TMDB 每季集数缓存。
    - PK: `(tmdb_id, season_num)`。
    - `episode_count` (INT): 集数。

### K. 数据迁移跟踪表
- **`_srn_migrations`**: 记录已执行的 Node.js 数据迁移脚本，确保幂等性。
    - `name` (TEXT, PK): 迁移脚本文件名。
    - `executed_at` (TEXT): 执行时间。

---

## 2. Hijarr 接入协议实现标准

Hijarr 推送数据到中继节点时，必须满足以下校验规则。

### 2.1 必须字段 (Required)
中继节点若发现缺失以下字段，将拒绝 `POST /v1/events` 请求：

| 字段 | 位置 | 描述 |
| :--- | :--- | :--- |
| `pubkey` | JSON | 64 字符 hex Ed25519 公钥 |
| `content_md5` | JSON | 文件的 MD5 指纹 |
| `X-SRN-PubKey` | Header | 发布者公钥（hex）|
| `X-SRN-Nonce` | Header | 满足当前 PoW 难度的 Nonce |
| `X-SRN-Signature` | Header | 规范化消息的 Ed25519 签名（hex）|
| `file` | Multipart | Kind 1001/1003 必须提供文件 |

### 2.2 推荐与可选字段 (Optional)
| 字段 | 位置 | 目的 |
| :--- | :--- | :--- |
| `tmdb_id` | JSON | TMDB 唯一标识（整数） |
| `season_num` | JSON | 季号（剧集）|
| `episode_num` | JSON | 集号（剧集）|
| `language` | JSON | 语言代码 (如 zh-CN)；缺省 `und` |
| `archive_md5` | JSON | **强烈推荐**：整季聚合指纹 |
| `source_type` | JSON | 溯源分类 (torrent/rss/etc.) |
| `source_uri` | JSON | 溯源原始链接 |

---

## 3. 示例报文

### 剧集示例 (TV Series — Kind 1001)
```json
{
  "id": "<sha256 hex>",
  "pubkey": "<64-char hex>",
  "kind": 1001,
  "content_md5": "de4...",
  "tags": [
    ["tmdb", "100565"],
    ["s", "1"],
    ["ep", "5"],
    ["language", "zh-CN"],
    ["archive_md5", "ab1..."]
  ],
  "tmdb_id": 100565,
  "season_num": 1,
  "episode_num": 5,
  "language": "zh-CN",
  "archive_md5": "ab1...",
  "source_type": "torrent",
  "source_uri": "magnet:?xt=urn:btih:..."
}
```
*Headers: `X-SRN-PubKey`, `X-SRN-Nonce`, `X-SRN-Signature`*

### 电影示例 (Movie — Kind 1001)
```json
{
  "id": "<sha256 hex>",
  "pubkey": "<64-char hex>",
  "kind": 1001,
  "content_md5": "fe2...",
  "tags": [
    ["tmdb", "299534"],
    ["language", "zh-TW"]
  ],
  "tmdb_id": 299534,
  "language": "zh-TW"
}
```

<!-- doc-sha: edefb69835eb9811a2f41aba039736e552aac6e3 -->
