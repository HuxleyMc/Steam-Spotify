# Steam Spotify Desktop (Tauri)

Desktop UI for running and monitoring Steam-Spotify sync.

## What You Can Do

- enter Spotify and Steam credentials
- start, stop, and restart sync
- open Spotify login page from the app
- submit Steam Guard response (code or approval)
- monitor Steam session status
- stream logs in real time
- collapse credentials section for cleaner monitoring

## Prerequisites

1. Install Bun
2. Install Rust toolchain (for Tauri)
3. Install repo dependencies

From repository root:

```bash
bun install
cd desktop
bun install
```

## Run Desktop App

```bash
cd desktop
bun run dev
```

## Typical Usage Flow

1. Fill credentials in the UI.
2. Click `Start Sync`.
3. Click `Open Spotify Login` and approve access.
4. If Steam asks for a code, enter it and click `Submit Code`.
5. If Steam asks for approval, approve in Steam and click `Continue`.
6. Confirm logs show Steam login succeeded.

## Steam Guard Notes

- The app sends one Steam Guard response per sync start.
- If Steam asks again after the first response, restart sync (`Stop Sync` then `Start Sync`).
- This avoids repeated auth submissions and Steam rate-limit issues.

## Build Installers

```bash
cd desktop
bun run build
```

Output directory:

`desktop/src-tauri/target/release/bundle`

## Create Beta Release (GitHub Actions)

Use workflow:

`.github/workflows/beta-release.yml`

Run it manually (`workflow_dispatch`) to:

1. Build desktop bundles for Linux, macOS, and Windows.
2. Publish a GitHub prerelease with attached artifacts.

## Notes

- Desktop currently launches the Bun-based sync process (`bun run src/index.ts`).
- Bun must be available on the machine running the desktop app.
- Settings are stored in app config as `settings.json`.
