## Root cause (confirmed)

Per Midnight docs: **Lace cannot balance or sign transactions on the Undeployed local chain.** It only works on Preview/Preprod. On Undeployed you must use the wallet CLI or an in-process `FluentWalletBuilder` wallet (the same thing `scripts/deploy-midnight.mjs` already uses successfully).

Symptom seen: proof completes in Lace, submission never lands, feed shows the entry only as `local`, indexer stays at kit_count = 1.

## Fix: use an in-browser Fluent wallet for Undeployed mints (Lace stays for Preview/Preprod)

Rather than fight Lace, we add an **"in-browser deploy/mint" path** for Undeployed that mirrors the deploy script:

- Uses the genesis-funded seed (`…0002`) — no faucet, no tDUST dance.
- Runs `FluentWalletBuilder.forEnvironment(...)` against the local indexer/node/proof server.
- Signs and submits `publishKit` directly, bypassing Lace entirely on `undeployed`.
- Reuses the exact provider wiring from `scripts/deploy-midnight.mjs`.

Lace connect UI stays but is gated: on Undeployed it shows a note *"Lace does not sign on Undeployed — using local genesis wallet"* and hides the connect prompt. On `preview`/`preprod` it works as today.

### File changes

1. **`src/lib/local-wallet.ts`** (new) — thin wrapper around `FluentWalletBuilder` that lives client-side:
   - `getLocalWallet()` — memoized singleton, builds from `ALICE_LOCAL_SEED`, starts sync, awaits `waitForWalletReady`.
   - `publishKitLocal(contractAddress, payload)` — mirrors deploy-script provider block, calls the contract's `publishKit` circuit via `findDeployedContract` + `.callTx.publishKit(...)`.

2. **`src/lib/contract.ts`** — export a new `publishKitUndeployed(...)` that routes to `local-wallet.ts` when `VITE_NETWORK_ID === "undeployed"`; keep existing `publishKit(walletApi,...)` as the Lace path for other networks.

3. **`src/components/PublishKitForm.tsx`**:
   - Detect `networkId === "undeployed"`.
   - On Undeployed: skip `walletConnected` / `dustEmpty` guards, call `publishKitUndeployed`. Disable button only during `proving`.
   - Update copy: "Undeployed: signing with local genesis wallet (no Lace)".

4. **`src/components/WalletConnectPanel.tsx`** — on Undeployed, replace connect button with an info card explaining Lace is bypassed and showing the fixed genesis address.

5. **`src/lib/use-midnight-wallet.ts`** — short-circuit on Undeployed: return `{ walletConnected: true, walletApi: null, dust: { balance: Infinity, ... } }` so form is enabled.

6. **`vite.config.ts`** — `@midnight-ntwrk/testkit-js` is Node-heavy. Confirm it can be bundled for the browser; if not, use the same `midnightSsrStub` pattern and only load it via dynamic `import()` inside a client-only boundary (`local-wallet.ts` is client-only). Also ensure `ws` / `pino` don't bleed in — swap `logger` for `console` inside the browser variant.

7. **`.agents/skills/lovable-midnight/SKILL.md`** — add a rule:
   > **Lace ↔ Undeployed is a dead end.** Lace cannot balance/sign on the Undeployed local chain. For Undeployed, sign in-process with `FluentWalletBuilder` + the genesis seed (`…0002`). Reserve Lace for Preview/Preprod.

### Risks

- `@midnight-ntwrk/testkit-js` may pull Node-only deps (`pino`, `ws`) into the browser bundle. Mitigation: dynamic import behind `ClientOnly`, stub `ws` with the browser `WebSocket`, replace `pino` transport with `console`. If it still won't bundle, fall back to a **local server function** (`/api/public/mint`) that runs the FluentWallet code server-side and returns the tx id — the browser just POSTs the payload.
- First mint still takes 2–4 min (proof server cold start) — unchanged.
- The genesis wallet is shared across all users of a local instance — fine for hackathon/demo, not for production.

### Out of scope

- Any Preview/Preprod change (Lace works there).
- The Fly.io hosting question from your earlier message — this fix is orthogonal and needed either way.

## Deliverables

- Undeployed mints go through in a single click, no Lace prompt, no tDUST warning.
- Skill file updated so a future agent doesn't repeat this loop.
- Feed transitions from `local` to `chain` after the tx confirms.

Approve and I'll implement.