## Root cause

The validation regex in `src/components/DeployPanel.tsx` is wrong:

```ts
/^0x?[0-9a-fA-F]{6,}$/
```

This matches a literal `0` then an optional `x` — so it only accepts addresses that start with `0`. The deployed address `d9e68ddb...` starts with `d`, so the regex rejects it and shows "Enter the hex contract address printed by scripts/deploy-midnight.mjs."

## Fix

Group the optional `0x` prefix correctly in `src/components/DeployPanel.tsx`:

```ts
if (!/^(0x)?[0-9a-fA-F]{6,}$/.test(trimmed)) { ... }
```

That's the only change.

## Verify

Reload the page, paste `d9e68ddb3068b7d2b6c1716080623735e2efecd41cb002932ba0f75e15c30552`, click **Use address** — the panel switches to "active" and the Publish form unlocks.
