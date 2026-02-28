# Steam Spotify

Sync your Spotify "currently playing" track to your Steam status.

When a song is playing, Steam shows:

`Listening to <song> • <artist>`

When nothing is playing, Steam shows your fallback text from `NOTPLAYING`.

## Requirements

- Bun 1.1+
- A Steam account username/password
- A Spotify developer app with client ID/secret

## Quick Start

1. Install dependencies:

```bash
bun install
```

2. Create your environment file:

```bash
cp example.env .env
```

3. Fill in `.env`:

- `CLIENTID` (Spotify app client ID)
- `CLIENTSECRET` (Spotify app client secret)
- `STEAMUSERNAME` (Steam username)
- `STEAMPASSWORD` (Steam password)
- `STEAMGUARD` (optional one-time Steam Guard code, if challenged)
- `NOTPLAYING` (optional fallback text)
- `SPOTIFY_REDIRECT_URI` (optional; default `http://127.0.0.1:8888/callback`)

4. In Spotify Developer Dashboard, configure your app redirect URI exactly as:

`http://127.0.0.1:8888/callback`

If your app is configured with a different callback (for example
`http://localhost:8888/callback`), set `SPOTIFY_REDIRECT_URI` to that exact URI.

5. Start the app:

```bash
bun run start
```

6. On first run, open:

`http://127.0.0.1:8888/login`

Approve access in Spotify. After success, the app will continue running.

## First Run: What You Should See

```text
OAuth server listening at http://127.0.0.1:8888
Config loaded.
Open http://127.0.0.1:8888/login to connect Spotify.
Waiting for user to authorize the app...
Spotify API ready!
Logged into Steam
```

If Spotify authorization is not completed within a few minutes, the app exits with
instructions and you can run `bun run start` again.

## Commands

- `bun run start` - Run the app (recommended)
- `bun run dev` - Run the app in dev mode
- `bun run typecheck` - TypeScript check only
- `bun run format:check` - Prettier check for `src/**/*.ts`

## How It Works

- Starts a local auth server on port `8888`
- Uses Spotify OAuth authorization code flow
- Persists Spotify tokens locally in `.steam-spotify-tokens.json`
- Polls Spotify playback every 2 seconds
- Updates Steam rich presence text with track + artist

## Troubleshooting

### Common errors

| Symptom                                     | Likely cause                                      | Fix                                                                                    |
| ------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Missing required environment variables      | `.env` missing or incomplete                      | `cp example.env .env`, fill required keys, rerun                                       |
| Callback/auth error from Spotify            | Redirect URI mismatch or wrong client credentials | Ensure Spotify dashboard URI exactly matches runtime URI (`SPOTIFY_REDIRECT_URI` or default `http://127.0.0.1:8888/callback`); verify `CLIENTID`/`CLIENTSECRET` |
| Timed out waiting for Spotify authorization | Login flow not completed in browser               | Open `http://127.0.0.1:8888/login` and approve access                                  |
| Failed to login to steam                    | Wrong Steam credentials                           | Verify `STEAMUSERNAME` and `STEAMPASSWORD`                                             |
| Failed to fetch current Spotify playback    | Temporary network/API issue                       | Keep app running; it retries automatically                                             |

### Missing environment variables

If startup says required env vars are missing:

- Ensure `.env` exists in project root
- Ensure all required keys are set and non-empty
- Re-run `bun run start`

### Spotify authorization times out

- Open `http://127.0.0.1:8888/login`
- Confirm your Spotify app redirect URI exactly matches `SPOTIFY_REDIRECT_URI` (or default `http://127.0.0.1:8888/callback`)
- Check `CLIENTID` and `CLIENTSECRET` in `.env`

### Steam login fails

- Re-check `STEAMUSERNAME` and `STEAMPASSWORD`
- Confirm account credentials are valid
- If prompted for Steam Guard in desktop, submit the code in the in-app prompt
- For CLI runs, set `STEAMGUARD` or type the code when prompted on stdin

### Need more help?

- Spotify Web API docs: https://developer.spotify.com/documentation/web-api
- Spotify auth code flow docs: https://developer.spotify.com/documentation/web-api/tutorials/code-flow
- steam-user package docs: https://github.com/DoctorMcKay/node-steam-user

## Security Notes

- Do not commit `.env`
- Do not commit `.steam-spotify-tokens.json`
- Do not share runtime logs if they contain account-related error details
- Tokens are stored locally in `.steam-spotify-tokens.json`

## Docker

A `Dockerfile` is included, but local Bun execution is the recommended and supported setup path.

## Desktop App (Preview)

A simple Rust + Tauri desktop wrapper is available in `desktop/`.

It provides a basic UI to:

- enter credentials
- start/stop sync
- open Spotify login
- view logs

Run it locally:

```bash
cd desktop
bun install
bun run dev
```
