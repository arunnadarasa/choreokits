## Diagnosis

Lace signed + proved the tx (the "Prove transaction" dialog completed at ~5s), but submission failed with `Unexpected error submitting scoped transaction '<unnamed>': Error`. That message is thrown from `midnight-js-contracts` when our `midnightProvider.submitTx` rejects.

Root cause is `LaceWalletProvider.balanceTx` in `src/lib/contract.ts`:

```ts
async balanceTx(tx, _ttl) {
  const hex = Buffer.from(tx.serialize()).toString("hex");
  const { tx: balancedHex } = await this.api.balanceUnsealedTransaction(hex, { payFees: true });
  const bytes = Buffer.from(balancedHex, "hex");
  const { Transaction } = await import("@midnight-ntwrk/midnight-js-protocol/ledger");
  return Transaction.deserialize("signature" as never, "proof" as never, "binding" as never, bytes) as FinalizedTransaction;
}
```

Two problems:
- `balanceUnsealedTransaction` returns a **balanced-but-unproven** tx. We cast it to `FinalizedTransaction` with fake `"signature"/"proof"/"binding"` markers.
- The SDK then treats it as already-final and hands it straight to `midnightProvider.submitTx`, which serializes garbage back out and Lace rejects it.

The Lace prove-dialog we saw was fired by the SDK's proof-provider path independently, so the on-chain transcript in the wallet screenshot is actually the correct proven tx that was **already submitted by Lace itself** during `proveTransaction`. Our subsequent `submitTx` is a double-submit / bad-hex submit — hence the generic "Error".

## Fix

Rework the Lace submission path in `src/lib/contract.ts`:

1. **`LaceWalletProvider.balanceTx`**: return the balanced-unproven tx correctly. Use the SDK's `UnprovenTransaction.deserialize(bytes)` (from `@midnight-ntwrk/midnight-js-protocol/ledger`) — NOT `Transaction.deserialize` with fake markers. Keep return type `UnprovenTransaction`.
2. **Proof provider**: keep using `api.getProvingProvider(zkConfigProvider)` so Lace still handles proving (that's what the user just saw succeed).
3. **`LaceMidnightProvider.submitTx`**: after the SDK proves, submit via `api.submitTransaction(hex)` and return the tx hash. Wrap in a try/catch that surfaces the real Lace error object (currently the `Error` has no message — likely because Lace rejects an already-known tx). If Lace throws "already submitted / duplicate", treat it as success and return the hash we can compute from the proven bytes.
4. Update the `WalletProvider` interface expectation: `balanceTx` should return `UnprovenTransaction`, not `FinalizedTransaction`. Adjust imports/types accordingly.

## Verify

After edits: `bun run dev`, connect Lace, click Mint Kit. Expected: single Lace "Prove transaction" popup → success toast with tx id, feed shows the new entry with `chain` badge and no red error.

If it still errors, log the raw Lace error object (`console.error(e, JSON.stringify(e))`) inside `submitTx` and re-run — the "Unexpected error submitting scoped transaction" wrapper is hiding the underlying message.

## Technical detail

- File: `src/lib/contract.ts` — replace `balanceTx` deserialization + tighten `submitTx` error surfacing.
- No changes needed in `PublishKitForm.tsx`, `use-midnight-wallet.ts`, deploy script, or Docker stack.
- Types: swap `FinalizedTransaction` import for `UnprovenTransaction` on the balance path.
