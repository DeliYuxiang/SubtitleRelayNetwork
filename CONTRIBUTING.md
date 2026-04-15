# Contributing to SRN

## Contributor Agreement

By submitting a pull request, you irrevocably assign all copyright and related rights in your contribution to the project maintainer, and waive any moral rights you may hold in such contribution to the fullest extent permitted by applicable law. You represent that you are legally entitled to make this assignment and that your contribution is your original work.

If you are contributing on behalf of your employer, you confirm that your employer has authorized you to make this assignment.

---

## Quick start

```bash
cd worker
npm install
npm run dev   # local wrangler dev server
npm test      # vitest integration tests
```

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat:  new feature
fix:   bug fix
chore: CI, deps, config
docs:  documentation only
test:  tests only
```

## Submitting a PR

1. Branch off `main`
2. Keep PRs focused — one concern per PR
3. Make sure `npm test` and `npm run format:check` pass before opening
4. Fill in the PR template

## Adding a relay node

Edit `RELAYS.md` and add a row to the community table. Include your relay URL and a working status badge:

```markdown
| My Node | @handle | `https://your-worker.workers.dev` | Global Edge |
```

## Database schema changes

Add a new numbered file to `worker/migrations/` — do not edit existing migration files. The deploy workflow applies migrations automatically before each production deployment.

## Protocol changes

Changes to the Event signing format or the `/v1/events` POST schema are breaking changes for all existing clients. Open an issue for discussion before implementing.
