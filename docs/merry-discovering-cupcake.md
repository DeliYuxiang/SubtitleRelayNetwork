# SRN Phase 2.1 — 协议扩展实现计划

## Context

SRN Phase 2 已运行（Kind 1001 字幕事件）。现在扩展协议，实现事件生命周期管理和身份特性。
哲学：**Dumb Relay, Fat Client** — 中继只存储/签名校验，客户端负责所有语义过滤。

两个仓库联合开发：
- `srn/` — Cloudflare Worker（TypeScript/Hono）+ Go CLI 工具
- `hijarr/` — Go 客户端（发布/查询事件，L2 队列）

## 新增 Kind 定义

| Kind | 名称 | 用途 | 是否携带文件 |
|------|------|------|------------|
| 1002 | Retract | 声明某事件作废 | 否（content_md5=""） |
| 1003 | Replace | 用新版本替代旧事件 | 是 |
| 1011 | Key Alias | 为公钥声明人类可读代号 | 否 |

### 关键技术决策

1. **无内容事件的 content_md5**：发送空字符串 `""`，multipart `file` 字段发空字节。
2. **D1 FK 问题**：`events.content_md5` 有 `FOREIGN KEY → blobs`，无内容事件会违反约束。
   **方案**：新增 migration 将 `content_md5` 改为允许空字符串（不修改 FK 定义，INSERT 逻辑上跳过 blob 插入）。
3. **中继身份**：`GET /v1/identity` 返回中继公钥 + 元数据；中继密钥对存于 Cloudflare Secrets（`RELAY_PRIVATE_KEY`）。
4. **撤回过滤**：客户端（hijarr）查询时额外取 Kind 1002 事件，过滤掉被撤回的 Kind 1001 结果；中继不处理。

---

## Tag 格式规范

### Kind 1002 (Retract)
```json
tags: [
  ["e", "<被撤回的 event_id>"],
  ["reason", "<可选原因，如 duplicate/wrong_ep>"]
]
content_md5: ""
```

### Kind 1003 (Replace)
```json
tags: [
  ["e", "<被替代的 event_id>"],
  ["tmdb", "<tmdb_id>"],
  ["title", "<series title>"],
  ["language", "<zh-CN>"],
  ["s", "<season>"],
  ["ep", "<episode>"]
  // 其余与 1001 相同
]
content_md5: "<新文件的 MD5>"
```

### Kind 1011 (Key Alias)
```json
tags: [
  ["alias", "<人类可读代号，如 SomeGroup>"],
  ["url",   "<可选 profile URL>"],
  ["about", "<可选描述>"]
]
content_md5: ""
```

### Relay Identity Response (HTTP, 非事件)
```json
GET /v1/identity → {
  "pubkey":      "<relay Ed25519 pubkey hex>",
  "name":        "SRN Relay",
  "version":     "2.1.0",
  "description": "SRN Phase 2 Cloud Relay"
}
```

---

## 工作单元（8 个，可并行）

### U1 — srn/proto-spec
**仓库**: srn  
**文件**: `docs/SRN_PROTOCOL.md`  
**内容**：完整协议文档（现为空文件），包含：
- 所有 Kind 定义（1000-1011）
- Tag 格式规范（每个 Kind 的必填/可选 tag）
- ID 计算方法（canonical JSON → SHA256[:16]）
- 签名协议（Ed25519 over canonical payload）
- Wire format（multipart POST 规范）
- 中继行为规范（Dumb Relay 原则）
- 客户端行为规范（撤回过滤、替换选择）

---

### U2 — srn/go-event-types
**仓库**: srn  
**文件**: `internal/event/event.go`  
**新增**：
```go
const (
    KindSubtitle  = 1001
    KindRetract   = 1002
    KindReplace   = 1003
    KindKeyAlias  = 1011
)

// NewRetractEvent creates a kind-1002 event retracting targetID.
func NewRetractEvent(pubkey string, targetID, reason string) *Event

// NewReplaceEvent creates a kind-1003 event replacing targetID with new content.
func NewReplaceEvent(pubkey, targetID string, subtitleTags [][]string, contentMD5 string) *Event

// NewKeyAliasEvent creates a kind-1011 event declaring a human-readable alias.
func NewKeyAliasEvent(pubkey, alias, url, about string) *Event
```
`ComputeID()` 已排除 `source_uri/source_type`，无需改动签名逻辑。

---

### U3 — srn/worker-new-kinds
**仓库**: srn  
**文件**:
- `worker/migrations/0005_new_kinds.sql`
- `worker/src/index.ts`（修改 POST /v1/events 处理逻辑）

**Migration**:
```sql
-- 新增 event_retracts 表（方便服务端辅助查询，可选）
CREATE TABLE IF NOT EXISTS event_retracts (
  retract_event_id TEXT PRIMARY KEY,
  target_event_id  TEXT NOT NULL,
  pubkey           TEXT NOT NULL,
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_retracts_target ON event_retracts(target_event_id);

-- event_keys 表用于 Key Alias 查询
CREATE TABLE IF NOT EXISTS event_keys (
  pubkey     TEXT PRIMARY KEY,
  alias      TEXT NOT NULL,
  url        TEXT NOT NULL DEFAULT '',
  about      TEXT NOT NULL DEFAULT '',
  event_id   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

**Worker POST /v1/events 修改**：
- 接受 kind 1001/1002/1003/1011（目前仅 1001）
- 对 kind 1002/1011：跳过 blob 插入（content_md5 为空）；跳过 event_metadata 插入；kind 1002 额外插入 event_retracts；kind 1011 额外 upsert event_keys
- 对 kind 1003：正常插入 blob + event_metadata（有文件内容）；额外记录被替换的 event_id 到 event_tags

---

### U4 — srn/worker-identity
**仓库**: srn  
**文件**: `worker/src/index.ts`  
**新增端点**：

```typescript
// GET /v1/identity — 返回中继元数据
app.get('/v1/identity', async (c) => {
  const pubkey = c.env.RELAY_PUBLIC_KEY ?? ''
  return c.json({ pubkey, name: 'SRN Relay', version: '2.1.0', description: 'SRN Phase 2 Cloud Relay' })
})

// GET /v1/keys/:pubkey — 查询已声明的公钥代号
app.get('/v1/keys/:pubkey', async (c) => {
  // SELECT * FROM event_keys WHERE pubkey = ?
  // 返回 { pubkey, alias, url, about } 或 404
})
```

**wrangler.jsonc**：新增 `RELAY_PUBLIC_KEY` secret 说明（注释）。

---

### U5 — hijarr/event-types
**仓库**: hijarr  
**文件**: `internal/srn/event.go`  
**新增**（与 srn/go-event-types 对称但适配 hijarr 的 Event 结构）：
```go
const (
    KindSubtitle = 1001
    KindRetract  = 1002
    KindReplace  = 1003
    KindKeyAlias = 1011
)

func NewRetractEvent(pubkey, targetID, reason string) *Event
func NewReplaceEvent(pubkey, targetID string, subtitleTags [][]string, contentMD5 string) *Event  
func NewKeyAliasEvent(pubkey, alias, url, about string) *Event
```
hijarr 的 `ComputeID()` 已正确处理 `content_md5` 字段，无需修改。

---

### U6 — hijarr/retract-replace
**仓库**: hijarr  
**文件**:
- `internal/srn/relay.go` — 添加 `RetractEvent(targetID, reason string, privKey ed25519.PrivateKey) error` + `ReplaceEvent(...)` 函数（复用 `PublishToNetwork` 逻辑，无内容时 data=[]byte{}）
- `internal/debug/handler.go` — 添加两个调试端点：
  - `DELETE /debug/srn/events/:id` → 发布 Kind 1002 retract 事件
  - `PUT /debug/srn/events/:id` → 发布 Kind 1003 replace 事件（body: multipart new file）

**relay.go 注意事项**：`pushToOneRelay` 目前将 `data` 写入 multipart file 字段。当 `data` 为空时，仍需发送 file 字段（空内容），以满足 multipart 格式；Worker 端检查 `kind != 1001` 时跳过 MD5 验证。

---

### U7 — hijarr/key-alias
**仓库**: hijarr  
**文件**:
- `internal/config/config.go` — 添加 `SRNAlias = getEnv("SRN_ALIAS", "")` 及环境变量表
- `cmd/hijarr/main.go` — 启动时若 `SRNAlias != ""`，自动发布 Kind 1011 事件（幂等：alias 未变则跳过）
- `internal/debug/handler.go` — `GET /debug/srn/identity` 返回本节点 pubkey + 已声明 alias

**幂等实现**：在 global_state 表中存储 `srn_alias_last_published` 值，若与当前 `SRN_ALIAS` 相同则跳过。

---

### U8 — hijarr/relay-identity-filter
**仓库**: hijarr  
**文件**: `internal/srn/relay.go`  
**新增两个功能**：

**a) 查询中继身份**:
```go
type RelayIdentity struct {
    PubKey      string `json:"pubkey"`
    Name        string `json:"name"`
    Version     string `json:"version"`
    Description string `json:"description"`
}

func QueryRelayIdentity(relayURL string) (*RelayIdentity, error)
// GET {relayURL}/v1/identity
```

**b) 撤回事件过滤**（在 `QueryNetwork` 中）：
- 额外请求 `GET /v1/events?kind=1002&pubkey=<our_pubkey>` 获取自己发的撤回事件
- 建立 `retractedIDs` set
- 从 `QueryNetwork` 返回结果中过滤掉被撤回的事件
- 注意：`kind` 过滤参数需要 Worker 支持（U3 中添加）

**Worker GET /v1/events 修改**（在 U3 中一并实现）：
- 添加可选 `kind` query param 过滤

---

## 文件依赖图

```
srn/docs/SRN_PROTOCOL.md          ← U1 (独立)
srn/internal/event/event.go        ← U2 (独立)
srn/worker/migrations/0005_*.sql   ← U3 (独立)
srn/worker/src/index.ts            ← U3 + U4 (合并为同一文件，建议同一 agent)

hijarr/internal/srn/event.go       ← U5 (独立)
hijarr/internal/srn/relay.go       ← U6 + U8 (同一文件，建议合并)
hijarr/internal/debug/handler.go   ← U6 + U7 (同一文件，建议合并)
hijarr/internal/config/config.go   ← U7 (独立)
hijarr/cmd/hijarr/main.go          ← U7 (小改动)
```

**注意**：U3 和 U4 都修改 `srn/worker/src/index.ts`，建议合并为一个 agent。
U6 和 U8 都修改 `hijarr/internal/srn/relay.go`，建议合并为一个 agent。

---

## 最终并行单元（合并后 6 个）

| # | 标题 | 仓库 | 核心文件 |
|---|------|------|---------|
| 1 | srn-proto-spec | srn | docs/SRN_PROTOCOL.md |
| 2 | srn-go-event-types | srn | internal/event/event.go |
| 3 | srn-worker-all | srn | worker/src/index.ts, migrations/0005_*.sql |
| 4 | hijarr-event-types | hijarr | internal/srn/event.go |
| 5 | hijarr-retract-replace-filter | hijarr | internal/srn/relay.go, internal/debug/handler.go |
| 6 | hijarr-key-alias-identity | hijarr | internal/config/config.go, cmd/hijarr/main.go, internal/debug/handler.go |

---

## E2E 验证方案

### srn 单元 (U1, U2, U3)
```bash
cd /users/PAS0497/deliangus/project/ServiceCenter/srn

# Go 编译验证
CGO_ENABLED=0 go build ./...

# Worker 单元测试
cd worker && npm test

# 本地 Worker dev（如有 wrangler 环境）
npx wrangler dev
# curl 测试新端点:
# curl http://localhost:8787/v1/identity
# curl -X POST http://localhost:8787/v1/events -F 'event={"kind":1002,...}' -F 'file='
```

### hijarr 单元 (U4, U5, U6)
```bash
cd /users/PAS0497/deliangus/project/ServiceCenter/hijarr

# 编译 + 测试
CGO_ENABLED=0 go build ./...
CGO_ENABLED=0 go test ./internal/srn/...
CGO_ENABLED=0 go test ./...

# 构建二进制验证启动（不需要运行服务）
CGO_ENABLED=0 go build -o /tmp/hijarr ./cmd/hijarr
```

**不需要 browser 或完整端到端部署**，单元测试 + 编译通过即可。

---

## 约束提醒（给 worker agents）

- `CGO_ENABLED=0` 永远需要（Go 构建）
- hijarr 新增环境变量必须更新 `internal/config/config.go` 的 `getEnv()` 调用 **和** CLAUDE.md 环境变量表
- srn/worker 修改后运行 `npm test` 验证 TypeScript 编译
- hijarr 提交前运行 `CGO_ENABLED=0 go run ./tools/coderef > docs/CODEREF.md`
- 不在 `for` 循环内用 `defer` 释放 `sync.Map` 键
- Gin 路由不要在 `/*path` 旁注册静态路由
