# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SRN (Subtitle Relay Network) is a decentralized, cryptographically-secured subtitle distribution network built on Cloudflare's edge infrastructure. The core philosophy is **"Dumb Relays, Smart Clients"**: the relay validates Ed25519 signatures, enforces Proof-of-Work (PoW) challenges, deduplicates files, and mirrors blobs to Backblaze B2; clients are responsible for subtitle parsing, TMDB metadata, and fingerprinting.

## Commands

### Worker (TypeScript — main API server)

```bash
cd worker
npm install              # Install dependencies
npm run dev              # Local dev server (via wrangler)
npm run dev:test         # Interactive local dev: loads .env, optionally pulls remote D1 snapshot
npm run dev:test:pull    # Force-pull remote D1 snapshot, then start dev server
npm run test:setup       # Apply migrations to local test DB (wrangler.test.jsonc)
npm run db:pull          # Pull remote D1 snapshot to local only (no server start)
npm run deploy           # Deploy to Cloudflare Workers
npm test                 # Run tests with Vitest
npm run format:check     # Check formatting with Prettier
npm run format:fix       # Auto-fix formatting with Prettier
```

### Database (Cloudflare D1)

```bash
cd worker
npx wrangler d1 migrations apply <db-name> --remote   # Apply incremental migrations
```

## Architecture

The worker (`worker/src/index.ts`) is a Hono + Zod OpenAPI server running on Cloudflare Workers with three storage backends:

- **D1 (SQLite)**: metadata indices — normalized schema across 11+ tables (see DB Schema section)
- **R2 (S3-compatible)**: primary gzip-compressed subtitle file blobs, keyed by MD5 (`v1/<md5>.gz`)
- **Backblaze B2 (S3-compatible, optional)**: secondary backup mirror — lazy-synced via `BackupBucket` class; no-op if `B2_KEY_ID`/`B2_APP_KEY` env vars are unset

### Middleware (applied globally, in order)

1. **CORS** — configurable via `CORS_ORIGINS` env var (comma-separated origins)
2. **Maintenance mode** — returns 503 when `MAINTENANCE_MODE=true`
3. **Relay signature** — signs all responses with the relay's Ed25519 key (`X-SRN-Relay-Sig`, `X-SRN-Relay-PubKey`, `X-SRN-Relay-Timestamp` headers)

### API Routes

| Method | Path | Auth Required | Description |
|--------|------|---------------|-------------|
| GET | `/*` | No | Proxied to frontend CDN (`FRONTEND_URL`) — worker is the single entry point |
| GET | `/v1/relay` | No | Relay metadata: name, version, status, totalEvents, uniqueTitles, uniqueEpisodes |
| GET | `/v1/health` | No | Shields.io-compatible status badge |
| GET | `/v1/identity` | No | Relay pubkey, version, commit, description |
| GET | `/v1/challenge` | No | Returns PoW parameters: `{ salt, k, vip }` |
| POST | `/v1/events` | Yes (PoW + Ed25519) | Publish event — verifies signature, deduplicates via MD5 + semantic hash, uploads to R2 + B2, inserts to D1 |
| GET | `/v1/events` | Yes (PoW + Ed25519) | Search by `?tmdb=&season=&ep=&language=&kind=&pubkey=&archive_md5=` |
| GET | `/v1/events/:id/content` | Yes (PoW + Ed25519) | Download subtitle — decompressed server-side; lazy-syncs blob to B2 |
| GET | `/v1/tmdb/search` | Yes (PoW + Ed25519) | TMDB search proxy with D1 title cache |
| GET | `/v1/tmdb/season` | Yes (PoW + Ed25519) | TMDB season episode count with D1 season cache |
| GET | `/ui` | No | Swagger interactive docs |
| GET | `/doc` | No | OpenAPI JSON schema |

### Auth Headers (all protected routes)

| Header | Description |
|--------|-------------|
| `X-SRN-PubKey` | Client Ed25519 public key (hex) |
| `X-SRN-Nonce` | Proof-of-Work nonce satisfying current difficulty |
| `X-SRN-Signature` | Ed25519 signature of the canonical message |

### Event Protocol

Events are Ed25519-signed JSON objects. Upload uses multipart form (`event` JSON field + `file` binary). Auth headers `X-SRN-PubKey`, `X-SRN-Nonce`, `X-SRN-Signature` must accompany the request.

**Supported event kinds:**
- `1001` — Subtitle (carries file)
- `1002` — Retract (no file; deactivates a target event by same pubkey)
- `1003` — Replace (carries file; deactivates the predecessor event by same pubkey)
- `1011` — Key Alias / Identity (no file; previous 1011 by same pubkey auto-deactivated)

**Canonical message for POST signing:** `JSON.stringify([pubkey, kind, sorted_tags, content_md5])`

**Kind 1001 semantic dedup hash:** `MD5(pubkey|content_md5|tmdb_id|season_num|episode_num|language|archive_md5)`

### DB Schema (current after all migrations)

| Table | Purpose |
|-------|---------|
| `blobs` | Physical file dedup layer: `content_md5`, `r2_key`, `size`, `created_at` |
| `events` | Protocol events: `id`, `pubkey`, `kind`, `content_md5`, `tags` (JSON), `sig`, `created_at` |
| `event_metadata` | Search index: `event_id`, `tmdb_id`, `season_num`, `episode_num`, `language`, `archive_md5`, `dedup_hash` |
| `event_tags` | Dynamic key-value tag pairs |
| `event_sources` | Source provenance: `source_type`, `source_uri` |
| `event_lifecycle` | Deactivation sidecar: tracks retracted/replaced events |
| `event_keys` | Public key aliases (from Kind 1011) |
| `challenge_counts` | Per-minute IP/pubkey counters for dynamic PoW difficulty |
| `relay_stats` | Cached counters (`event_count`, `unique_titles`, `unique_episodes`) with `updated_at` for TTL refresh |
| `tmdb_title_cache` | Persistent TMDB title search cache (substring match) |
| `tmdb_season_cache` | Persistent TMDB season episode count cache |
| `_srn_migrations` | Data migration tracking (idempotent runner) |

## Key Design Decisions

- Files are **gzip-compressed** before R2 upload; served **decompressed** server-side (not via `Content-Encoding: gzip`) to avoid CDN stripping issues
- **Primary dedup**: same MD5 → same R2 blob; `blobs` table is the dedup layer
- **Semantic dedup** (Kind 1001): `dedup_hash` in `event_metadata` prevents re-publishing identical subtitle metadata from the same pubkey
- **Max file size**: 5 MB
- **Backblaze B2 backup**: on upload, new blobs are mirrored synchronously to B2 via `waitUntil`; on download, existing blobs are lazily synced (HEAD check → PUT if missing). Entirely no-op if B2 env vars are unset
- **Stats caching**: `relay_stats` table caches event/title/episode counts; refreshed at most once per 5-minute TTL window (O(1) reads in the hot path)
- The relay does **not** validate TMDB IDs or subtitle content — client responsibility
- R2 is chosen specifically to eliminate egress bandwidth costs

## CI/CD

`.github/workflows/deploy.yml` runs on pushes to `main` (when `worker/` or the workflow file changes). Four-phase pipeline:

1. **lint-format**: Prettier format check + Vitest tests
2. **resolve-infra**: reads Terraform state to surface resource IDs
3. **deploy-or-bootstrap**: enable maintenance mode → D1 backup (to R2, MD5-verified) → apply SQL migrations; or **bootstrap** mode if no infra exists yet (auto-creates D1/R2 resources, generates relay keypair, opens a PR with instructions)
4. **run-data-migrations**: runs pending `worker/data-migrations/*.mjs` scripts
5. **finalize-deploy**: `wrangler deploy` (implicitly disables maintenance mode) + writes deployed SHA/URL to backup R2

An **emergency-restore** job fires on any phase failure: restores D1 from backup artifact, redeploys previous code version, or simply turns maintenance mode off if the DB was not touched.

Bootstrap mode also provisions a Backblaze B2 bucket via Terraform (`infra/terraform/backblaze.tf`).

## Configuration

- `worker/wrangler.jsonc`: D1 and R2 bindings, rate limiter namespaces, env vars
- `infra/terraform/`: Terraform config for Cloudflare D1/R2 and Backblaze B2 resources
- `worker/migrations/`: Incremental D1 SQL schema migrations (0001–0011, applied in order)
- `worker/data-migrations/`: Node.js data migration scripts (tracked in `_srn_migrations` table)

## Doc Version

This file was last updated at commit `edefb69835eb9811a2f41aba039736e552aac6e3`. To refresh docs after a large change, run:

```bash
git diff edefb69835eb9811a2f41aba039736e552aac6e3 HEAD
```

<!-- doc-sha: edefb69835eb9811a2f41aba039736e552aac6e3 -->
