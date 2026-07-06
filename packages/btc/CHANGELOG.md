# @swapdk/wdk-wallet-btc

## 0.1.3

### Patch Changes

- 349f334: `WalletManager.getAccount / getAccountByPath / getFeeRates` throw `"Cannot use disposed wallet manager"` post-dispose (AUDIT4-M1).

  Previously, calling `manager.getAccount(0)` after `manager.dispose()` silently derived from the now-zeroed 64-byte seed buffer and returned an account whose address was **deterministic and publicly computable** — any funds sent to it would be immediately stealable. Cosmos fork already had this guard; BTC and TRON forks missed it. Now uniform across all three forks.

### Prior work in the fork (rolled into 0.1.3 since this is the first public release)

- **feat**: `sendTransaction({ to, value, memo })` — optional `memo` field builds a PSBT with the memo as an `OP_RETURN` output. Enables THORChain / MAYAChain vault inbound deposits (where routing lives in the memo) without downstream code reaching into `bitcoinjs-lib`. Prepared for upstream PR against `@tetherto/wdk-wallet-btc`.

- **security (audit-1..4 hardening)**:
  - `WalletManager.dispose()` zeroes `this._seed` (64-byte BIP-39 buffer) — base class does not.
  - `WalletAccount.dispose()` idempotent (`_disposed` flag + `_assertNotDisposed()` guards on `keyPair` / `sign` / `signTransaction` / `sendTransaction`); `transfer()` also gated (BTC's `transfer()` throws `"not supported"`, guard fires first so the canonical dispose message wins).
  - Derivation intermediates (`masterKeyAndChainCodeBuffer` / `privateKey` / `chainCode`) `sodium_memzero`'d immediately after use. `dispose()` additionally zeros the account + masterNode's chainCode + privateKey.
  - `WalletManager.dispose()` bypasses the base-class `super.dispose()` because the base iterates via `account.keyPair.privateKey` which now throws on disposed accounts; the fork iterates `_accounts` directly and calls `account.dispose()` (itself idempotent).
