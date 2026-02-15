# Commands and CI

Authoritative command sources:

- `package.json` scripts
- `.github/workflows/ci.yml`

## Install

- `bun install`

## Run

- Canonical: `bun run start`
- Alias: `bun run start:local`
- Dev: `bun run dev`

`start` and `start:local` currently resolve to the same command.

## Quality Commands

- Format check: `bun run format:check`
- Type check: `bun run typecheck`
- Build: `bun run build`

## CI (Push)

Workflow: `.github/workflows/ci.yml`

1. `bun install --frozen-lockfile`
2. `bun run format:check`
3. `bun run typecheck`
4. `bun run build`

When changing code, keep local verification aligned with CI.

## Linting

- No linter is configured.
- Do not claim lint checks were run.
