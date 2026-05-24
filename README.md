# Steam Spotify

Desktop app that syncs Spotify "currently playing" to your Steam status.

When music is playing:

`Listening to <song> • <artist>`

When nothing is playing:

`NOTPLAYING` fallback text, configured in the app.

## What You Need

- Bun 1.1+
- Rust toolchain for Tauri development/builds
- Steam username and password
- Spotify developer app client ID and client secret

## Run The Desktop App

Install dependencies once:

```bash
bun install
cd desktop
bun install
```

Start the desktop app from the repository root:

```bash
bun run start
```

You can also run it from `desktop/`:

```bash
bun run dev
```

## Typical Flow

1. Add Spotify client details and Steam credentials in the desktop app.
2. Click `Start Sync`.
3. Click `Open Spotify Login` and approve access.
4. Complete the Steam Guard prompt if Steam asks for a code or app approval.
5. Close the window when you are done monitoring; the app keeps running from the tray.

Use the tray menu to show the window again or quit the app. Quitting stops the sync helper.

## Spotify Redirect URI

In the Spotify Developer Dashboard, add a redirect URI that exactly matches the app setting.

Default:

`http://127.0.0.1:8888/callback`

## Commands

- `bun run start`: run the desktop app
- `bun run dev`: run the desktop app
- `bun run desktop:dev`: run the Tauri app from the root
- `bun run desktop:build`: build desktop installers
- `bun run worker`: run the internal sync worker directly for development
- `bun run format:check`: Prettier check for TypeScript source
- `bun run typecheck`: TypeScript check
- `bun run build`: TypeScript build
- `bun run test`: tests

## Desktop Features

- saved local credentials
- start, stop, and restart sync
- one-click Spotify login
- Steam Guard prompt
- Steam session status panel
- live helper logs
- close-to-tray background usage

See [desktop/README.md](desktop/README.md) for desktop-specific notes.

## Troubleshooting

| Problem | Most likely cause | Fix |
| --- | --- | --- |
| Spotify login fails with `INVALID_CLIENT` or redirect mismatch | Spotify app redirect URI mismatch | Ensure the dashboard URI exactly matches the redirect URI shown in the app |
| Sync cannot start on port `8888` | stale local OAuth listener | stop old listeners or restart the desktop app |
| Steam login rate-limited (`RateLimitExceeded`) | too many recent auth attempts | wait for cooldown, then restart sync |
| Sync runs but status does not change | Steam auth is not complete | resolve Steam Guard and wait for the connected status |
| Window closed but music is still syncing | app is running in the tray | use the tray menu to show or quit |

## Security

- Never commit `.env`
- Never commit `.steam-spotify-tokens.json`
- Treat logs as sensitive account data

## Beta Releases

Manual GitHub Action available:

- Workflow: `.github/workflows/beta-release.yml`
- Trigger: `workflow_dispatch`
- Currently builds macOS desktop bundles only and creates a prerelease
