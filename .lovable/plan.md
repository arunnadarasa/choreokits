## Diagnosis

The Lace dump shows the contract call proof is valid and targets the expected `publishKit` entry point. The failure is after proving, in the dApp adapter that converts Lace’s balanced transaction back into a MidnightJS `FinalizedTransaction`.

Current code calls `balanceUnsealedTransaction(...)` and then tries to deserialize the returned hex as an `UnprovenTransaction`, while the connector docs say `balanceUnsealedTransaction` returns a balanced sealed/final transaction ready for `submitTransaction`. That marker mismatch can make MidnightJS submit an incorrectly typed transaction and produce the generic `Unexpected error submitting scoped transaction '<unnamed>': Error`.

## Plan

1. Update `src/lib/contract.ts` only.
2. In `LaceWalletProvider.balanceTx`, deserialize Lace’s `balancedHex` as a finalized transaction using `Transaction.deserialize('signature', 'proof', 'binding', bytes)`.
3. Keep `LaceMidnightProvider.submitTx` submitting that finalized hex through `api.submitTransaction(hex)`.
4. Improve the submit error handling so opaque Lace errors are surfaced with useful detail where possible.
5. Verify the source no longer uses the wrong `UnprovenTransaction.deserialize` path for Lace-balanced transactions.

## Expected result

After restarting Vite and retrying Mint Kit: Lace proves/signs once, the dApp submits the finalized transaction, and the UI returns a tx id instead of the scoped transaction error.