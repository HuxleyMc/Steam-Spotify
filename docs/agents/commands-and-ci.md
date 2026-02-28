# Commands and CI

This file is the quick reference for local commands and GitHub Actions.

## Install

```bash
bun install
```

## Run

- Canonical:

```bash
bun run start
```

- Alias:

```bash
bun run start:local
```

- Dev:

```bash
bun run dev
```

`start` and `start:local` currently resolve to the same command.

## Local Quality Checklist

Run these before committing:

1. Format check:

```bash
bun run format:check
```

2. Type check:

```bash
bun run typecheck
```

3. Build:

```bash
bun run build
```

4. Tests:

```bash
bun run test
```

## Push CI

Workflow: `.github/workflows/ci.yml`

1. `bun install --frozen-lockfile`
2. `bun run format:check`
3. `bun run typecheck`
4. `bun run build`
5. `bun run test`

Local checklist should stay aligned with CI.

## Beta Release (Manual)

Workflow: `.github/workflows/beta-release.yml`

Trigger: `workflow_dispatch`

Input reference:

- `ref`: branch/tag/SHA to build (default `main`)
- `tag`: prerelease tag override (optional)
- `release_name`: release title override (optional)
- `notes`: release body additions (optional)

Behavior:

1. Builds Tauri desktop bundles on Linux, macOS, and Windows.
2. Uploads build bundles as workflow artifacts.
3. Creates a GitHub prerelease (`beta-*`) and attaches the archived bundles.

## Linting

- No linter is configured.
- Do not claim lint checks were run.
