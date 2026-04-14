# SRN 数据库正规化与 Hijarr 协议规范

## 1. 数据库正规化设计 (Cloudflare D1)

为了解决数据冗余并提升检索效率，我们将 Event 协议对象与其承载的数据内容（Blobs）、索引元数据（Metadata）以及扩展标签（Tags）进行拆解。

### A. 基础属性表
- **`blobs`**: 存储物理文件指纹与路径。
    - `content_md5` (TEXT, PK): 文件唯一的 MD5 指纹。
    - `r2_key` (TEXT): 对应 R2 中的 Key。
    - `size` (INT): 文件字节大小。
    - `created_at` (INT): 首次上传时间。

### B. 核心协议表
- **`events`**: 存储完整的协议报文，用于验证签名。
    - `id` (TEXT, PK): 事件唯一 ID (sha256)。
    - `pubkey` (TEXT): 发布者公钥。
    - `kind` (INT): 1001 (字幕)。
    - `content_md5` (TEXT, FK): 关联的文件指纹。
    - `tags` (TEXT): 原始 Tags 的 JSON 备份。
    - `sig` (TEXT): Ed25519 签名。
    - `created_at` (INT): 协议生成时间。

### C. 搜索索引表 (一等公民：必填属性)
- **`event_metadata`**: 专为影视检索优化的硬索引。
    - `event_id` (TEXT, PK, FK): 关联 events.id。
    - `tmdb_id` (INTEGER): TMDB 唯一标识。
    - `season` (INTEGER): 季（电影为空）。
    - `ep` (INTEGER): 集（电影为空）。
    - `language` (TEXT): 语言代码 (如 zh-CN)。
    - `archive_md5` (TEXT): 原始包指纹（用于聚合）。

### D. 扩展标签表 (二等公民：多变属性)
- **`event_tags`**: 动态键值对，支持无限扩展。
    - `event_id` (TEXT, FK): 关联 events.id。
    - `name` (TEXT): 标签名 (如 `group`, `resolution`, `codec`, `fansub`)。
    - `value` (TEXT): 标签值 (如 `LoliHouse`, `1080p`, `HEVC`)。
    - *索引*: `(name, value)` 复合索引用于快速过滤。

---

## 2. Hijarr 接入协议 (v1.5) 实现标准

Hijarr 推送数据到中继节点时，必须满足以下校验规则。

### 2.1 必须字段 (Required)
中继节点若发现缺失以下字段，将拒绝 `POST /v1/events` 请求：

| 字段 | 位置 | 描述 |
| :--- | :--- | :--- |
| `pubkey` | JSON | 32 字节 hex 公钥 |
| `sig` | JSON | 64 字节 hex 签名 |
| `tmdb` | Tags | TMDB 唯一标识 |
| `language` | Tags | 语言代码 (ISO 639-1) |
| `content_md5` | Tags & JSON | 文件的 MD5 指纹 |
| `s` / `e` | Tags | **仅针对剧集** 为必须项 |
| `file` | Multipart | 仅在云端无此文件时为必须项 |

### 2.2 推荐与可选字段 (Optional)
| 字段 | 位置 | 目的 |
| :--- | :--- | :--- |
| `archive_md5` | Tags | **精选推荐**：用于整季聚合预览 |
| `filename` | JSON | 原始文件名，方便认读 |
| `source_type` | Tags | 溯源分类 (torrent/rss/etc.) |
| `source_uri` | Tags | 溯源原始链接 |
| `group` | Tags | 压制/翻译组名称 |
| `resolution` | Tags | 分辨率标识 |

---

## 3. 示例报文

### 剧集示例 (TV Series)
```json
{
  "pubkey": "...",
  "created_at": 1713100000,
  "kind": 1001,
  "tags": [
    ["tmdb", "100565"],        // 必须
    ["s", "1"],               // 剧集必须
    ["e", "5"],               // 剧集必须
    ["language", "zh-CN"],    // 必须
    ["content_md5", "de4..."], // 必须
    ["archive_md5", "ab1..."], // 强烈推荐
    ["group", "喵萌奶茶屋"],     // 可选
    ["resolution", "1080p"]    // 动态标签
  ],
  "content": "de4...",        // 存放 content_md5
  "sig": "..."
}
```

### 电影示例 (Movie)
```json
{
  "pubkey": "...",
  "kind": 1001,
  "tags": [
    ["tmdb", "299534"],        // 必须
    ["language", "zh-TW"],    // 必须
    ["content_md5", "fe2..."]  // 必须
  ],
  "content": "fe2...",        // 存放 content_md5
  "sig": "..."
}
```
