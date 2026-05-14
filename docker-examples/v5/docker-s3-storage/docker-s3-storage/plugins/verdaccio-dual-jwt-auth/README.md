# Verdaccio GameMaker Auth Plugin

Verdaccio auth plugin that verifies a GameMaker JWT access token during npm login,
then grants access based on the user's console licence entitlements.

## How It Works

```
┌─────────────────────────────┐
│      GameMaker IDE          │
│                             │
│  User logs into GameMaker   │
│  → receives JWT access token│
└──────────────┬──────────────┘
               │
               │  npm login
               │  username = email
               │  password = GameMaker JWT
               ▼
┌──────────────────────────────────────────┐
│            Verdaccio                     │
│  ┌──────────────────────────────────┐    │
│  │  GameMaker Auth Plugin           │    │
│  │  authenticate(user, password)    │    │
│  │    └─ password = GameMaker JWT   │    │
│  │    └─ verify against GM API ─────┼──► │ GET /api/2/licence
│  │    └─ map entitlements to groups │    │ Authorization: Bearer <jwt>
│  └──────────────────────────────────┘    │
│                                          │
│  Verdaccio issues its own session token  │
│  (token system completely untouched)     │
└──────────────────────────────────────────┘
```

1. The user logs into GameMaker → receives a JWT access token.
2. They log in to the npm registry: `npm login --registry <url>` using their email as
   the username and the GameMaker JWT as the password.
3. The auth plugin's `authenticate()` is called. It sends the JWT to the GameMaker API
   (`GET /api/2/licence`) to validate it and retrieve licence entitlements.
4. If valid, the user's groups are set based on which console platforms they are licensed
   for (e.g. `switch-developers`, `ps4-developers`).
5. Verdaccio issues its own session token as normal. All subsequent npm requests use this
   Verdaccio token — no custom headers or extra tokens required.

## Configuration

```yaml
auth:
  verdaccio-dual-jwt-auth:
    gameMakerApiUrl: https://api.gamemaker.io/api/2/licence
    timeout: 10000      # ms, default 10000
    cache: true         # cache verified tokens, default true
    cacheTTL: 300000    # cache TTL in ms, default 300000 (5 minutes)
```

### Environment Variables

```bash
# Override the GameMaker API URL
GAMEMAKER_API_URL=https://api.gamemaker.io/api/2/licence
```

## Package Access

Console-specific packages are gated by group membership set at login time:

| Console    | Group               | Package scope      |
|------------|---------------------|--------------------|
| Switch     | `switch-developers` | `@gmpm/switch-*`   |
| PS4        | `ps4-developers`    | `@gmpm/ps4-*`      |
| PS5        | `ps5-developers`    | `@gmpm/ps5-*`      |
| Xbox       | `xbox-developers`   | `@gmpm/xbox-*`     |
| Xbox One   | `xboxone-developers`| `@gmpm/xboxone-*`  |
| Xbox Series| `xboxseries-developers`| `@gmpm/xboxseries-*`|

## Files

- `index.js` — Auth plugin
- `gamemaker-verify-server.js` — Standalone proxy for testing, calls the GameMaker API
- `mock-verify-server.js` — Mock server for local development
