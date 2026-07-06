# @swapdk/wdk-wallet-cosmos

## 0.1.2

### Patch Changes

- c14dae7: Enforce `transferMaxFee` BEFORE broadcasting in `transfer()` and `deposit()`.

  Both methods previously built the `fee` object from `_parseGasPrice()`, handed it to `client.signAndBroadcast(...)` via `withFallback`, and only AFTER the broadcast returned did they check the cap:

  ```js
  if (totalFee >= this._config.transferMaxFee) {
    throw new Error('Exceeded maximum fee cost...')
  }
  ```

  By the time that throw fires, the tx is already in the mempool and typically already mined. The cap could not actually block a transaction.

  The fee is deterministic from chain config (`gasDenom` + `gasAmount` come straight out of `_parseGasPrice` — no RPC needed), so the check now runs immediately after building the `fee` struct and before `withFallback`. If the cap rejects, no tx is ever broadcast. Post-broadcast we still compute `totalFee` for the return shape (caller sees what was actually paid), but the throw is upstream.

  No new tests — exercising this path requires a stubbed `SigningStargateClient` which doesn't exist in this repo. The behaviour change is "the throw is now reachable before any network I/O"; existing tests still pass.
