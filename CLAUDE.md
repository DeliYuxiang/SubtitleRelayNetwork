# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SRN (Subtitle Relay Network) is a decentralized, cryptographically-secured subtitle distribution network built on Cloudflare's edge infrastructure. The core philosophy is **"Dumb Relays, Smart Clients"**: the relay only validates Ed25519 signatures and deduplicates files; clients are responsible for subtitle parsing, TMDB metadata, and fingerprinting.

## Commands

### Worker (TypeScript — main API server)

```bash
cd worker
npm install          # Install dependencies
npm run dev          # Local dev server (via wrangler)
npm run deploy       # Deploy to Cloudflare Workers
npm test             # Run tests with Vitest
npm run format:check # Check formatting
npm run format:fix   # Auto-fix formatting
```

### Database (Cloudflare D1)

```bash
cd worker
npx wrangler d1 execute srn_metadata --file=./schema.sql     # Initialize schema
npx wrangler d1 migrations apply <db-name> --remote          # Apply migrations
```

### Go CLI Tools

```bash
# Generate Ed25519 keypair
CGO_ENABLED=0 go run cmd/keygen/main.go

# Deploy local SQLite DB to cloud relay
CGO_ENABLED=0 go run cmd/deploy/main.go -url https://your-worker.dev -db srn.db -limit 0

# Import from Hijarr or old SRN v1 nodes
CGO_ENABLED=0 go run cmd/migrate/main.go -source https://source.com -type hijarr -privkey <hex> -db srn.db
```

## Architecture

The worker (`worker/src/index.ts`) is a Hono + Zod OpenAPI server running on Cloudflare Workers with two storage backends:

- **D1 (SQLite)**: metadata indices — 5-table normalized schema (`blobs`, `events`, `event_metadata`, `event_tags`, `event_sources`)
- **R2 (S3-compatible)**: gzip-compressed subtitle file blobs, keyed by MD5

### API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Landing page SPA (Petite-Vue, `worker/src/ui.ts`) |
| GET | `/v1/health` | Shields.io status badge |
| POST | `/v1/events` | Publish event — verifies Ed25519 signature, deduplicates via MD5, uploads to R2, inserts to D1 |
| GET | `/v1/events` | Search by `?tmdb=&season=&ep=&language=` |
| GET | `/v1/events/:id/content` | Download subtitle (streams from R2, gzip transparent) |
| GET | `/v1/tmdb/search` | TMDB API proxy |
| GET | `/ui` | Swagger interactive docs |
| GET | `/doc` | OpenAPI JSON schema |

### Event Protocol

Events are Ed25519-signed JSON objects. The event ID is SHA256 of a canonical JSON structure. Upload uses multipart form (`event` JSON field + `file` binary), with `X-SRN-PubKey` and `X-SRN-Signature` headers. Tags use a nested array format: `[["tmdb", "123"], ["s", "1"], ["ep", "2"]]`.

### Go CLI / Internal Packages

- `internal/event/event.go`: Event struct, SHA256-based ID computation, signing/verification
- `internal/storage/sqlite.go`: Local SQLite adapter for offline migration workflows
- `cmd/deploy/`: Reads local SQLite, pushes events to Worker via HTTP multipart
- `cmd/keygen/`: Generates Ed25519 keypairs (hex output)
- `cmd/migrate/`: Imports from Hijarr API or SRN v1 nodes, re-signs with provided key

## Key Design Decisions

- Files are **gzip-compressed** before R2 upload; served transparently via `Content-Encoding: gzip`
- **Deduplication**: same MD5 → same R2 blob; `blobs` table is the dedup layer
- Max file size: **5MB**
- The relay does **not** validate TMDB IDs or subtitle content — client responsibility
- R2 is chosen specifically to eliminate egress bandwidth costs

## CI/CD

`.github/workflows/deploy.yml` does:
1. Auto-format with Prettier on push (force-pushes fix commits); read-only check on PRs
2. Conditional deploy: if `SRN_D1_ID`/`SRN_D1_NAME`/`SRN_R2_NAME` secrets exist → apply migrations + deploy; otherwise → bootstrap (auto-create D1 + R2 resources)

## Configuration

- `worker/wrangler.jsonc`: D1 and R2 bindings, compatibility date
- `worker/.env.example`: Required Cloudflare credentials (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, resource IDs)
- `worker/migrations/`: Incremental D1 schema migrations (apply in order)
