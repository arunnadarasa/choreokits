## Root cause

The private state provider rejects the local password `choreo-kits-local-password` — it only has lowercase + `-`, which counts as 2 character classes. `validatePassword` requires **3 of**: uppercase, lowercase, digits, specials.

## Fix

Single line change in `scripts/deploy-midnight.mjs`:

```js
privateStoragePasswordProvider: () => "Choreo-Kits-Local-2026!",
```

(uppercase + lowercase + digits + specials = 4 classes.)

## Verify

```bash
bun scripts/deploy-midnight.mjs
```

The Docker stack is already up; no need for `docker compose down -v`. Success = `Contract deployed at: 0200…` and `.env` gets `VITE_DEFAULT_CONTRACT` written.
