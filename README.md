# Steam Spotify

Sync Spotify "currently playing" to your Steam status.

## Project Status

This repository is a rewrite of the project focused on an easy-to-use desktop app.

The legacy CLI-first version is still available on the `v2-backup` branch, but it is no longer actively maintained.

When music is playing:

`Listening to <song> • <artist>`

When nothing is playing:

`NOTPLAYING` (fallback text)

## What You Need

- Bun 1.1+
- Steam username and password
- Spotify developer app (`CLIENTID` + `CLIENTSECRET`)

## Choose Your Run Mode

- Desktop app (recommended): [desktop/README.md](desktop/README.md)
- CLI only: follow the steps below

## CLI Quick Start

1. Install dependencies:

```bash
bun install
```

2. Create `.env`:

```bash
cp example.env .env
```

3. Fill required values in `.env`:

- `CLIENTID`
- `CLIENTSECRET`
- `STEAMUSERNAME`
- `STEAMPASSWORD`

Optional values:

- `NOTPLAYING` (default: `Monkey`)
- `SPOTIFY_REDIRECT_URI` (default: `http://127.0.0.1:8888/callback`)
- `STEAMGUARD` (optional one-time code for CLI login challenge)
- `STEAM_DEBUG=1` for verbose Steam logs

4. In Spotify Developer Dashboard, add a redirect URI that exactly matches runtime.
Default:

`http://127.0.0.1:8888/callback`

5. Start sync:

```bash
bun run start
```

6. Open Spotify auth page:

`http://127.0.0.1:8888/login`

## First Run Checklist

Expected logs:

```text
Config loaded.
Initializing Spotify client...
OAuth server listening at http://127.0.0.1:8888
Spotify API ready!
Initializing Steam session...
Attempting Steam login...
Logged into Steam
Starting playback sync loop...
```

If Spotify auth is not completed within about 5 minutes, the process exits and you can run `bun run start` again.

## Steam Guard Behavior

Steam may challenge login in two ways:

1. Code challenge:
Enter the code from Steam.

2. Approval challenge (no code):
Approve sign-in in Steam app/client.

Important behavior:

- A Steam Guard response is submitted once per sync run.
- If Steam challenges again after that response, restart sync (`Stop` then `Start`) to retry cleanly.

## Commands

- `bun run start`: run app
- `bun run start:local`: alias of `start`
- `bun run dev`: local run for development
- `bun run format:check`: prettier check (`src/**/*.ts`)
- `bun run typecheck`: TypeScript check
- `bun run build`: TypeScript build
- `bun run test`: tests

## Desktop App

Desktop wrapper is in `desktop/` (Tauri).

Features include:

- saved credentials
- start/stop/restart sync
- one-click Spotify login
- Steam Guard prompt
- Steam session status panel
- live logs

See: [desktop/README.md](desktop/README.md)

## Troubleshooting

| Problem | Most likely cause | Fix |
| --- | --- | --- |
| `Missing required environment variables` | `.env` missing keys | Fill all required keys in `.env` |
| `INVALID_CLIENT` or redirect mismatch | Spotify redirect URI mismatch | Ensure dashboard URI exactly matches `SPOTIFY_REDIRECT_URI` or default callback |
| `Failed to start server. Is port 8888 in use?` | stale listener on OAuth port | stop old process on `8888`, restart sync |
| Steam login rate-limited (`RateLimitExceeded`) | too many recent auth attempts | wait for cooldown, then restart sync |
| Sync runs but status not changing | Steam not fully logged in yet | resolve Steam auth challenge and wait for `Logged into Steam` |

## Security

- Never commit `.env`
- Never commit `.steam-spotify-tokens.json`
- Treat logs as sensitive account data

## Beta Releases

Manual GitHub Action available:

- Workflow: `.github/workflows/beta-release.yml`
- Trigger: `workflow_dispatch`
- Builds desktop bundles (Linux/macOS/Windows) and creates a prerelease
