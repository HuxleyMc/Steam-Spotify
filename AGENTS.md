# AGENTS.md

Steam-Spotify syncs Spotify "currently playing" to Steam status.

## Essentials (Read First)

- Package manager/runtime: Bun (`bun install`, `bun run ...`).
- Canonical run command: `bun run start` (`start:local` is an alias).
- Quality gates: `bun run format:check`, `bun run typecheck`, `bun run build`.
- Tests run with `bun test` (`bun run test`).
- Commit regularly: make a commit after each completed, logically grouped change once required checks pass; do not batch unrelated work into one commit.
- Never commit secrets (`.env`, `.steam-spotify-tokens.json`).

## Progressive Disclosure Docs

- Commands and CI: `docs/agents/commands-and-ci.md`
- Testing status and future single-test rules: `docs/agents/testing.md`
- TypeScript/style/import conventions: `docs/agents/style-typescript.md`
- Runtime, logging, and secrets handling: `docs/agents/runtime-and-secrets.md`
- Change-scope and workflow guardrails: `docs/agents/change-scope.md`
- Cursor/Copilot rules status: `docs/agents/tooling-rules-status.md`

## Suggested Structure

```text
docs/
  agents/
    commands-and-ci.md
    testing.md
    style-typescript.md
    runtime-and-secrets.md
    change-scope.md
    tooling-rules-status.md
```

## Last Verified

- Verified against repository contents on 2026-02-15.
