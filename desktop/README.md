# Steam Spotify Desktop (Tauri)

This is a lightweight desktop wrapper around the existing sync service.

## What it does

- Collects Spotify and Steam credentials in a desktop UI.
- Starts/stops the existing `bun run start` sync process.
- Streams sync logs into the UI.
- Opens Spotify login URL (`http://localhost:8888/login`) with one click.

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
- For packaged distribution to end users without Bun, next step is bundling a standalone core binary and launching that instead.
