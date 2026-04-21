# SRN 协议规范 (v3)

## 1. 设计哲学
字幕中继网络 (Subtitle Relay Network, SRN) 遵循 **”笨中继，胖客户端” (Dumb Relay, Fat Client)** 的原则。
- **中继 (Relay)**：仅负责报文的存储、Ed25519 签名校验、PoW 验证及文件分发。中继不理解报文的业务逻辑，也不负责过滤非法内容。
- **客户端 (Client)**：负责所有的语义过滤、冲突解决以及事件生命周期的维护。

## 2. 报文结构 (Event Structure)
一个标准的 SRN 事件是一个 JSON 对象，包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 十六进制字符串。见 ID 计算方法。 |
| `pubkey` | string | 64 位十六进制字符串。发布者的 Ed25519 公钥。 |
| `kind` | integer | 事件类型。详见第 3 节。默认为 `1001`。 |
| `created_at` | integer | Unix 时间戳（由中继在接收时分配，客户端提供的值会被中继覆盖）。 |
| `tags` | [][]string | 标签列表，用于元数据查询（如 tmdb_id, s, ep, language）。 |
| `content_md5`| string | 关联文件的 MD5 十六进制字符串。无文件报文设为 `””`。 |
| `sig` | string | 128 位十六进制字符串。Ed25519 签名。 |
| `source_type` | string | (可选) 溯源类型（如 `torrent`、`rss`）。 |
| `source_uri` | string | (可选) 溯源原始链接。 |

### ID 计算方法
ID 由客户端计算，是对以下规范化数组进行 JSON 序列化后的 SHA256 哈希（完整十六进制字符串）：
```
SHA256(JSON.stringify([pubkey, kind, sorted_canonical_tags, content_md5]))
```
其中 `sorted_canonical_tags` 为按标签名排序、去除 `source_type`/`source_uri` 的标签列表。

*注意：`created_at` 被排除在 ID 计算之外，因为它由中继动态分配。*

### 签名协议 (POST /v1/events)
签名消息 = 与 ID 计算相同的规范化数组的 JSON 字符串：
```
message = JSON.stringify([pubkey, kind, sorted_canonical_tags, content_md5])
```
签名通过 `X-SRN-Signature` 头传递，格式为 Ed25519 签名的十六进制字符串。

## 3. 事件类型 (Event Kinds)

| Kind | 名称 | 用途 | 是否携带文件 |
|------|------|------|------------|
| 1001 | Subtitle | 标准字幕事件 | 是 |
| 1002 | Retract | 声明某事件作废 (撤回) | 否 (`content_md5=””`) |
| 1003 | Replace | 用新版本替代旧事件 (版本迭代) | 是 |
| 1011 | Key Alias | 为公钥声明人类可读代号 (身份) | 否 (`content_md5=””`) |

> **注意**：Kind 1020 (Bulk Salvage / 事件融合) 在协议层面定义，但当前中继实现中尚未支持，提交该 Kind 的报文会被忽略。

## 4. 生命周期管理与去激活 (Deactivation)

为了在保持去中心化特性的同时减少中继冗余，SRN 引入了”去激活”机制。

### 去激活触发条件
1. **Kind 1002 (Retract)**：必须包含 `[“e”, “<目标事件ID>”]`。中继仅在 `1002.pubkey == target.pubkey` 时写入 `event_lifecycle`。
2. **Kind 1003 (Replace)**：必须包含 `[“e”, “<前驱事件ID>”]`。中继仅在 `1003.pubkey == prev.pubkey` 时接受。`e` 标签指向该版本的 **直接前驱** ID。
3. **Kind 1011 (Key Alias)**：每个 Pubkey 仅最新的 Kind 1011 生效。同一 Pubkey 发布的旧 1011 报文自动被去激活（写入 `event_lifecycle`）。

### 生命周期侧表 (Lifecycle Sidecar)
中继维护一张 `event_lifecycle` 表，用于记录被去激活的报文：
- `event_id`: 被去激活的报文 ID。
- `deactivated_by`: 触发去激活的 Kind 1002/1003/1011 事件 ID。
- `deactivated_at`: 去激活操作的时间。
- `pubkey`: 操作者公钥。

被去激活的报文在 `GET /v1/events` 中默认被隐藏（`NOT EXISTS` 过滤 `event_lifecycle`）。

## 5. Kind 1001 语义去重 (Semantic Deduplication)

除 R2 Blob 层的 MD5 物理去重外，Kind 1001 还在 `event_metadata` 中通过 `dedup_hash` 进行语义去重。计算公式：

```
dedup_hash = MD5(pubkey | content_md5 | tmdb_id | season_num | episode_num | language | archive_md5)
```

若 `dedup_hash` 已存在，中继返回现有事件的 ID，响应中包含 `”deduplicated”: true`。

## 6. 传输规范 (Wire Format)
中继通过 `POST /v1/events` 接收报文，使用 `multipart/form-data` 格式：
- `event`: 报文的 JSON 字符串（包含 `id`、`pubkey`、`kind`、`content_md5`、`tags`、可选的 `source_type`/`source_uri`）。
- `file`: 关联的二进制文件（Kind 1001/1003 必须；Kind 1002/1011 省略）。
- HTTP Header `X-SRN-PubKey`: 发布者公钥（hex）。
- HTTP Header `X-SRN-Nonce`: 满足当前 PoW 难度的 Nonce。
- HTTP Header `X-SRN-Signature`: 规范化消息的 Ed25519 签名（hex）。

对于无内容事件（1002/1011），`content_md5` 必须为 `””`，中继会在 `blobs` 表中预置一条空记录以满足数据库外键约束。

<!-- doc-sha: edefb69835eb9811a2f41aba039736e552aac6e3 -->
