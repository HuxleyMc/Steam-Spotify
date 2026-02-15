# Runtime, Logging, and Secrets

## Runtime Behavior

- App boots through `src/index.ts` orchestration.
- Spotify OAuth callback uses `http://localhost:8888/callback`.
- Steam status updates run in a recurring polling loop.

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
