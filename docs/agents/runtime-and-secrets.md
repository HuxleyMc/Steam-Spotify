# Runtime, Logging, and Secrets

## Runtime Behavior

- User-facing runtime is the Tauri desktop app.
- The desktop app launches `src/index.ts` as the internal sync worker.
- Spotify OAuth callback defaults to `http://127.0.0.1:8888/callback`; overrides must stay on loopback HTTP (`127.0.0.1`, `localhost`, or `[::1]`).
- Steam Guard challenges can be answered via stdin prompt (desktop uses in-app prompt) or optional `STEAMGUARD` env input.
- Steam status updates run in a recurring polling loop.
- Closing the desktop window hides it; the app keeps running from the tray until Quit.

## Error Handling

- Fatal setup/auth failures use `console.error(...)` then `process.exit(1)`.
- Non-fatal refresh/poll failures are logged and retried.
- Keep error messages actionable and user-remediable.

## Logging

- Keep operational logs concise.
- Never log secrets or raw tokens.
- Preserve helpful startup hints for first-run flow.

## Environment Contract

Required variables:

- `CLIENTID`
- `CLIENTSECRET`
- `STEAMUSERNAME`
- `STEAMPASSWORD`

Optional variable:

- `NOTPLAYING` (defaults to `Monkey`)

## Secret Files

Never commit:

- `.env`
- `.steam-spotify-tokens.json`

Desktop token storage is redirected into the app config directory with private file permissions where the platform supports them.
