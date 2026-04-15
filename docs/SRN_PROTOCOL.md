# SRN 协议规范 (v2.1)

## 1. 设计哲学
字幕中继网络 (Subtitle Relay Network, SRN) 遵循 **“笨中继，胖客户端” (Dumb Relay, Fat Client)** 的原则。
- **中继 (Relay)**：仅负责报文的存储、基本的签名校验及文件分发。中继不理解报文的业务逻辑，也不负责过滤非法内容。
- **客户端 (Client)**：负责所有的语义过滤、冲突解决以及事件生命周期的维护。

## 2. 报文结构 (Event Structure)
一个标准的 SRN 事件是一个 JSON 对象，包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 32 位十六进制字符串。SHA256[:16] 指纹。 |
| `pubkey` | string | 64 位十六进制字符串。发布者的 Ed25519 公钥。 |
| `kind` | integer | 事件类型。详见第 3 节。 |
| `created_at` | integer | Unix 时间戳（由中继在接收时分配）。 |
| `tags` | [][]string | 标签列表，用于元数据查询（如 tmdb, s, ep, language）。 |
| `content_md5`| string | 关联文件的 MD5 十六进制字符串。无文件报文设为 `""`。 |
| `sig` | string | 128 位十六进制字符串。Ed25519 签名。 |

### ID 计算方法
ID 是对以下数组进行 JSON 序列化后的 SHA256 哈希的前 16 字节（32 位 hex）：
`[pubkey, kind, canonical_tags, content_md5]`
*注意：`created_at` 被排除在 ID 计算之外，因为它由中继动态分配。*

### 签名协议
签名是对发送给中继的 **原始 JSON 字符串**（不含 `sig` 字段）进行的 Ed25519 签名。

## 3. 事件类型 (Event Kinds)

| Kind | 名称 | 用途 | 是否携带文件 |
|------|------|------|------------|
| 1001 | Subtitle | 标准字幕事件 | 是 |
| 1002 | Retract | 声明某事件作废 (撤回) | 否 (`content_md5=""`) |
| 1003 | Replace | 用新版本替代旧事件 (版本迭代) | 是 |
| 1011 | Key Alias | 为公钥声明人类可读代号 (身份) | 否 (`content_md5=""`) |
| 1020 | Bulk Salvage | 事件融合与物理销毁 (清理) | 否 |

## 4. 生命周期管理与去激活 (Deactivation)

为了在保持去中心化特性的同时减少中继冗余，SRN 引入了“去激活”机制。

### 去激活触发条件
1. **Kind 1002 (Retract)**：必须包含 `["e", "<目标事件ID>"]`。中继仅在 `1002.pubkey == target.pubkey` 时接受。
2. **Kind 1003 (Replace)**：必须包含 `["e", "<前驱事件ID>"]`。中继仅在 `1003.pubkey == prev.pubkey` 时接受。`e` 标签指向该版本的 **直接前驱** ID。
3. **Kind 1011 (Key Alias)**：每个 Pubkey 仅最新的 Kind 1011 生效。同一 Pubkey 发布的旧 1011 报文自动被去激活。

### 生命周期侧表 (Lifecycle Sidecar)
中继维护一张 `event_lifecycle` 表，用于记录被去激活的报文：
- `event_id`: 被去激活的报文 ID。
- `deactivated_by`: 触发去激活的 Kind 1002/1003/1011 事件 ID。
- `deactivated_at`: 去激活操作的时间。

### 公示期 (Publicity Period)
被去激活的报文不会立即删除，而是进入 **公示期**（默认为 7 天）。在此期间，报文在 `GET /v1/events` 中默认被隐藏，但仍可通过特定参数查询，以便其他客户端同步状态或进行存证。

### 事件融合 (Event Fusion / Bulk Salvage)
公示期结束后，可通过 Kind 1020 (Bulk Salvage) 进行物理清理：
- **撤回融合**：任何人均可发起 1020，中继校验公示期过后，物理删除 1001 + 1002。
- **替换融合**：**仅原作者**可发起 1020，将 1001 + 1003 序列“折叠”为一个新的 1001 报文（需包含最新内容）。
- **身份融合**：客户端默认行为，仅保留最新的 1011 报文。

## 5. 传输规范 (Wire Format)
中继通过 `POST /v1/events` 接收报文，使用 `multipart/form-data` 格式：
- `event`: 报文的 JSON 字符串。
- `file`: 关联的二进制文件（若无文件则发送 0 字节内容）。
- HTTP Header `X-SRN-PubKey`: 发布者公钥。
- HTTP Header `X-SRN-Signature`: 签名。

对于无内容事件（1002/1011），`content_md5` 必须为 `""`，中继会在 `blobs` 表中预置一条空记录以满足数据库外键约束。
