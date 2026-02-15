# AGENTS.md

Repository guide for coding agents working in `Steam-Spotify`.

## Scope and intent

- This is a small TypeScript Node.js service that syncs Spotify "now playing"
  status into Steam "currently playing".
- Keep edits minimal and focused.
- Prefer consistency with existing patterns over introducing new abstractions.

## Project layout

- `src/index.ts`: app entrypoint, dotenv bootstrap, orchestration.
- `src/config.ts`: env/config validation and persisted token store (`conf`).
- `src/spotify.ts`: Spotify OAuth flow + token refresh.
- `src/steam.ts`: Steam login and status update loop.
- `dist/`: TypeScript output (`tsc` build output).

## Tooling and runtime

- Language: TypeScript (`strict` mode enabled).
- Runtime: Node.js (CommonJS output).
- Formatting: Prettier.
- Linting: no ESLint configured.
- Tests: no test framework configured.

## Required commands

Run from repository root (`/Users/huxleymcguffin/Dev/Steam-Spotify`).

- Install deps: `npm install`
- Build: `npm run build`
- Start built app: `npm run start`
- Dev run (ts-node): `npm run dev`

### Quality commands

- Type check only: `npx tsc --noEmit`
- Format check: `npx prettier --check "src/**/*.ts"`
- Format write: `npx prettier --write "src/**/*.ts"`

### Lint/test status

- Lint script: not present in `package.json`.
- Test script currently fails by design:
  - `npm run test` -> `echo "Error: no test specified" && exit 1`
- There are currently no test files and no test config.

### Single-test execution

- Not available in current repo state because no test runner is installed.
- Do not invent `npm test -- ...` single-test instructions in PRs/issues for this repo.
- If a test framework is added later, document exact single-test command in this file.

## Build and release notes

- Build command is plain `tsc` and emits to `dist/`.
- Start command expects compiled output in `dist/index.js`.
- Docker uses multi-stage build and runs `npm run build` in builder stage.

## Coding conventions

These rules are based on existing source files and config.

### Formatting

- Use 2 spaces for indentation (`.prettierrc`).
- Do not use tabs.
- Keep code Prettier-compatible; no custom style deviations.

### Imports and module style

- Use ES import syntax in `.ts` files.
- Keep `require("dotenv").config()` at the top of `src/index.ts`-style entrypoints
  when early env loading is needed.
- Internal imports are relative and extensionless (example: `./config`).
- Prefer named exports for module APIs.

### Types and strictness

- Respect `tsconfig.json` strict mode; do not weaken compiler settings.
- Add explicit parameter types on exported functions.
- Avoid `any`, `@ts-ignore`, and `@ts-expect-error`.
- Use narrow assertions only when unavoidable (existing code uses `as string/number`
  for `conf.get`).

### Naming

- Functions: `camelCase` (`initSteam`, `updatePlayingSong`).
- Local variables: `camelCase`.
- Env-derived config variables in `config.ts` currently use `PascalCase`
  (`ClientId`, `SteamUsername`); keep local consistency within touched file.
- Environment variable keys are uppercase (`CLIENTID`, `STEAMUSERNAME`, etc.).

### Async and control flow

- Use `async/await` for service orchestration.
- For event APIs, wrapping in `new Promise` is an established pattern here.
- Keep loops/timers straightforward; avoid unnecessary abstractions.

### Error handling and logging

- Existing fatal-path behavior is `console.error(...)` then `process.exit(1)`.
- Preserve current operational behavior unless explicitly changing error strategy.
- Log concise operational messages (`Logged into Steam`, `Now playing`, etc.).

## Environment/config rules

- `.env` is required for runtime credentials.
- Use `example.env` as the template.
- Required variables validated in `initConfig()`:
  - `CLIENTID`
  - `CLIENTSECRET`
  - `STEAMUSERNAME`
  - `STEAMPASSWORD`
- Optional variable:
  - `NOTPLAYING` (defaults to `Monkey`).

## Agent workflow expectations

- Before edits, read the affected module and one related module.
- Prefer minimal diffs; do not refactor unrelated code during bug fixes.
- Run `npm run build` after code edits.
- Run `npx tsc --noEmit` when changing types/interfaces.
- Run Prettier check/write when touching formatting-sensitive blocks.

## Repo-specific guardrails

- Do not claim tests were run unless a real test framework is added.
- Do not add lint steps to CI/docs unless lint tooling is first introduced.
- Do not commit secrets (`.env` must remain untracked).
- Keep `dist/` as generated output; edit files under `src/` only.

## Cursor/Copilot policy files

Checked in this repository:

- `.cursorrules`: not present.
- `.cursor/rules/`: not present.
- `.github/copilot-instructions.md`: not present.

If any of the above files are added later, merge their instructions into this
document and treat them as higher-priority repository guidance.

## Quick command reference

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run start`
- `npx tsc --noEmit`
- `npx prettier --check "src/**/*.ts"`
- `npx prettier --write "src/**/*.ts"`

## Last verified

- Verified against repository contents on 2026-02-15.
