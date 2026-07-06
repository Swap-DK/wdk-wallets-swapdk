# @swapdk/wdk-wallet-tron

## 0.2.0

### Minor Changes

- 40da128: `TransferContract`-with-memo path for THORChain direct-vault deposits.

  Adds an optional `memo` parameter to `sendTransaction` / `signTransaction`. When present (and `data` is unset), the wallet:

  1. Builds a plain TRX `TransferContract` via `tronweb.transactionBuilder.sendTrx`.
  2. Attaches the memo as `raw_data.data` via `tronweb.transactionBuilder.addUpdateData(tx, memo, 'utf8')` — mutation happens BEFORE signing because the memo is part of the txID hash preimage.
  3. Signs and broadcasts as usual.

  This is the THORChain inbound-vault deposit pattern (à la Bitcoin OP_RETURN, adapted to TVM). Used when THORChain has the TRON pool unhalted for trading but the router contract isn't deployed — a transitional state observed mid-2026.

  Dispatch precedence in `_buildTronTransaction`:
  - `data` set                        → `TriggerSmartContract` (existing)
  - `data` unset, `memo` set+nonempty → `sendTrx` + `addUpdateData` (new)
  - neither                           → plain `sendTrx` (existing)

  When both `data` and `memo` are passed, `data` wins — the contract-call path doesn't benefit from a tx-level memo (`TriggerSmartContract`, not `TransferContract`), so the memo is silently ignored.

### Prior work in the fork (rolled into 0.2.0 since this is the first public release)

- **feat**: raw-calldata `sendTransaction({ to, value, data, feeLimit })` — invokes arbitrary TVM smart contracts via `TriggerSmartContract`. Enables THORChain router `depositWithExpiry` calls without reaching into private tronweb internals from downstream code. Prepared for upstream PR against `@tetherto/wdk-wallet-tron` (artefacts in `docs/upstream-pr/`).

- **security (audit-1..5 hardening)**:
  - `WalletManager.dispose()` zeroes `this._seed` (64-byte BIP-39 buffer) — the base class does not.
  - `WalletAccount.dispose()` is idempotent (`_disposed` flag + `_assertNotDisposed()` guards on `keyPair` / `sign` / `signTransaction` / `sendTransaction` / `transfer`).
  - `HDKey.wipePrivateData()` from `@scure/bip32` does NOT clear `chainCode` (verified against the library source); dispose explicitly zeros the buffer and nulls the reference. Without this, 32 bytes of derivation material survives in the V8 heap and can re-derive any child key.
  - `WalletManager.getAccount / getAccountByPath / getFeeRates` throw `"Cannot use disposed wallet manager"` post-dispose — otherwise a post-dispose `getAccount()` would derive from the zeroed seed and hand the caller a deterministic, publicly-known key.

- **Peer requirement.** Consumers of `@swapdk/wdk-protocol-bridge-swapdk-tron@0.2.0+` install this package to satisfy its peer-dep. Both packages are released together.
