# Steam Spotify Desktop

Tauri desktop app for running Steam-Spotify sync as a background helper.

## What You Can Do

- enter Spotify and Steam credentials
- start, stop, and restart sync
- open Spotify login from the app
- submit Steam Guard responses
- monitor Steam session status
- stream logs in real time
- close the window while sync continues from the tray

## Prerequisites

1. Install Bun
2. Install the Rust toolchain
3. Install repo dependencies

From repository root:

```bash
bun install
cd desktop
bun install
```

## Run Desktop App

From repository root:

```bash
bun run start
```

Or from this directory:

```bash
bun run dev
```

## Typical Usage Flow

1. Fill credentials in the UI.
2. Click `Start Sync`.
3. Click `Open Spotify Login` and approve access.
4. If Steam asks for a code, enter it and click `Submit Code`.
5. If Steam asks for approval, approve in Steam and click `Continue`.
6. Close the window to keep syncing in the background.

Use the tray menu to show the window again or quit. Quitting stops the sync helper.

## Steam Guard Notes

- The app sends one Steam Guard response per sync start.
- If Steam asks again after the first response, restart sync (`Stop` then `Start`).
- This avoids repeated auth submissions and Steam rate-limit issues.

## Build Installers

```bash
cd desktop
bun run build
```

Output directory:

`desktop/src-tauri/target/release/bundle`

## Create Beta Release

Use workflow:

`.github/workflows/beta-release.yml`

Run it manually (`workflow_dispatch`) to:

1. Build desktop bundles for macOS.
2. Publish a GitHub prerelease with attached artifacts.

## Notes

- The desktop app launches the internal Bun sync worker.
- Bun must be available on the machine running the desktop app.
- Settings are stored in app config as `settings.json`.
