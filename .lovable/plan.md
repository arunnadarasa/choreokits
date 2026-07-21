## Problem

Deploy resolves ZK assets at `.../scripts/contracts/managed/...` instead of `.../contracts/managed/...`. `path.resolve(file, "..", "contracts", ...)` uses the file path itself as the base — the first `".."` just strips the filename, leaving `scripts/`. Needs a second `".."` to climb to project root.

## Fix

In `scripts/deploy-midnight.mjs` lines 54–60, add one `".."`:

```js
const ZK_CONFIG_PATH = path.resolve(
  new URL(import.meta.url).pathname,
  "..",
  "..",
  "contracts",
  "managed",
  "tokenized-choreo-kits",
);
```

The `.env` write at line 241 has the correct `..`, `..` pattern already.

## Verify

```bash
bun run compile
```

Expect `Contract deployed at: 0200…`.