# SRN Authentication Protocol v3 (Nonce-based PoW)

SRN 认证协议已从“虚荣公钥”迁移至“基于 Nonce 的工作量证明”。公钥现在仅作为持久身份标识。

## 1. 认证头 (Request Headers)

所有受保护的接口必须包含以下 Headers：

| Header | 类型 | 说明 |
| :--- | :--- | :--- |
| `X-SRN-PubKey` | Hex String | 客户端 Ed25519 十六进制公钥 (64 字符) |
| `X-SRN-Nonce` | String | 满足当前 PoW 难度的 Nonce 字符串 |
| `X-SRN-Signature` | Hex String | Ed25519 签名 (128 字符) |

## 2. 认证流程

### 步骤 A：获取挑战 (Challenge)
调用 `GET /v1/challenge` 获取当前难度。
- **输入**：建议在 Header 中携带 `X-SRN-PubKey` 以获取针对该身份的精确难度。
- **输出**：`{ "salt": "...", "k": 4, "vip": false }`
- `salt`: 与当前 IP 和分钟绑定的随机盐。
- `k`: 难度值（哈希前导零的个数）。
- `vip`: 若为 `true`，难度 `k` 始终为 `0`。

### 步骤 B：执行计算 (Mining)
在本地寻找一个字符串 `nonce`，使得：
`hex(SHA256(salt + pubKeyHex + nonce)).startsWith("0" * k)`

### 步骤 C：构造签名 (Signing)
根据接口类型准备“规范消息”并签名：

1. **常规接口 (Search/TMDB)**: 
- 消息内容 = `X-SRN-PubKey` 的十六进制字符串。
2. **下载接口 (`/content`)**: 
- 消息内容 = 当前 Unix 分钟数（`floor(now / 60)`）的字符串。
3. **发布接口 (POST)**: 
- 消息内容 = 规范化 JSON 数组 `[pubkey, kind, tags, content_md5]`。

## 3. 动态难度机制

服务器会根据 `max(IP计数, 公钥计数)` 自动调整难度 `k`：
- 每分钟前 5 次请求：`k = base_k`
- 每增加 5 次请求：`k` 增加 1
- 最大增加值：`+4`

这意味着爬虫即使疯狂更换公钥，只要 IP 不变，挖掘成本也会迅速上升。

## 4. 客户端实现建议

- **持久化身份**：生成一次密钥对后持久化保存。
- **Nonce 复用**：由于 Salt 按分钟更新，一个 Nonce 在一分钟内通常对同一 IP 是有效的。
- **Salt 容忍**：中继对当前分钟和上一分钟的 Salt 均接受，允许时间窗口边界的合理误差（±1 分钟）。
- **自动重试**：当收到 `403` 错误时，客户端应自动调用 `/v1/challenge` 更新 Salt 并重新计算。
- **k=0 时跳过挖矿**：当 `SRN_POW_DIFFICULTY=0` 且非高频请求时，`k` 为 0，`verifyPoW` 始终返回 `true`，客户端可传任意 Nonce。

## 5. 中继响应头 (Relay Response Headers)

所有响应均由中继通过 Ed25519 私钥签名：

| Header | 说明 |
| :--- | :--- |
| `X-SRN-Relay-Sig` | 中继对响应体的 Ed25519 签名 (hex) |
| `X-SRN-Relay-PubKey` | 中继公钥 (hex) |
| `X-SRN-Relay-Timestamp` | 签名时的 Unix 时间戳 |

<!-- doc-sha: edefb69835eb9811a2f41aba039736e552aac6e3 -->
