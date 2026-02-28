# Steam Spotify Desktop (Tauri)

This is a lightweight desktop wrapper around the existing sync service.

## What it does

- Collects Spotify and Steam credentials in a desktop UI.
- Supports optional Steam Guard code for challenged Steam logins.
- Saves credentials locally and restores them when reopening the app.
- Supports optional Spotify redirect URI override for callback mismatch fixes.
- Starts/stops/restarts the existing `bun run start` sync process.
- Tracks sync lifecycle in real time (starting/running/stopping/exited/error).
- Streams sync logs into the UI.
- Opens Spotify login URL (`http://127.0.0.1:8888/login`) with one click.

## Development

From repository root:

```bash
cd desktop
bun install
bun run dev
```

## Build installers

```bash
cd desktop
bun run build
```

Tauri outputs platform installers/bundles under `desktop/src-tauri/target/release/bundle`.

## Notes

- This wrapper currently launches `bun run start`, so Bun must be available on the machine.
- Settings are stored in the app config directory as `settings.json`.
- For packaged distribution to end users without Bun, next step is bundling a standalone core binary and launching that instead.
