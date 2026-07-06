# Add optional `memo` (OP_RETURN) to `sendTransaction` / `signTransaction`

## Summary

Adds an optional `memo` field to `WalletAccountBtc.sendTransaction`, `WalletAccountBtc.signTransaction`, `WalletAccountReadOnlyBtc.quoteSendTransaction`, and `WalletAccountReadOnlyBtc.getMaxSpendable`. When supplied, the value is encoded as an `OP_RETURN` output (value `0`) and appended to the transaction during PSBT construction.

The change is fully backward-compatible: omitting `memo` is identical to the current behaviour.

## Motivation

`OP_RETURN` is how Bitcoin transactions carry arbitrary "data" payloads that downstream protocols read. The most common use today is **THORChain** (and **MAYAChain**) cross-chain swaps, which **route every inbound BTC deposit by parsing the `OP_RETURN` memo** on the spending transaction:

> Standard THORChain swap memo: `=:<dest_chain>:<dest_addr>:<min_out>:<affiliate>:<bps>`

A deposit without an `OP_RETURN` memo is either refunded or treated as a donation to the pool — there's no other way to encode the destination chain, destination address, or affiliate tag.

Today the public API exposes only a single recipient output (`to` / `value` / `feeRate`), with no path to attach an `OP_RETURN` payload. Apps that want to send a memo-bearing BTC tx end up reaching into `_masterNode` / `_client` and rebuilding the PSBT themselves, which is brittle and couples them to private fields. This PR offers a first-class field instead.

Reference: [THORChain memo specification](https://docs.thorchain.org/concepts/memos).

## Design choices

- **Field name `memo`.** Consistent with the cross-chain-swap nomenclature (this is what THORChain, MAYAChain, and SwapKit call it). `data` or `opReturn` would be lower-level but less discoverable for the common case.
- **Accepts `string | Buffer | Uint8Array`.** Strings are encoded as UTF-8; bytes are passed through unchanged.
- **Hard cap at 80 bytes.** Matches Bitcoin Core's `MAX_OP_RETURN_RELAY` default. Payloads above that are valid by consensus but won't propagate on the default mempool — rejecting at the API boundary is friendlier than producing an un-relayable transaction.
- **Empty memo (`''`) is treated as no memo.** Avoids accidentally inserting a zero-byte `OP_RETURN` output.
- **Fee planner accounts for OP_RETURN vbytes upfront.** `_planSpend` pads the coin-selection fee target by `_opReturnVBytes(memoLen)`, so the two-pass fee adjustment in `_getRawTransaction` does not have to claw from change after the fact. `getMaxSpendable({ memo })` similarly leaves room for the OP_RETURN output, so callers can compute a true "send everything" amount.
- **No changes to public API for callers that don't use `memo`.** The field is optional, defaulted to `undefined`. `tests/` and `tests/integration/` still pass without modification.

## Implementation

Two files change:

- `src/wallet-account-btc.js`
  - New `MAX_OP_RETURN_BYTES = 80` constant.
  - New `_normalizeMemo(memo)` helper: validates length, normalizes input to `Buffer | null`.
  - `signTransaction` / `sendTransaction` / `_buildSignedTransaction` / `_getRawTransaction` accept and thread `memo` through.
  - `_getRawTransaction` builds an `OP_RETURN` output via `payments.embed({ data: [memoBytes] })` and appends it to the PSBT (value `0`) after the recipient and change outputs.

- `src/wallet-account-read-only-btc.js`
  - New `_opReturnVBytes(dataLen)` helper computing the tx-level vbyte contribution of an OP_RETURN output (small-push and `OP_PUSHDATA1` forms).
  - `quoteSendTransaction`, `getMaxSpendable`, and `_planSpend` accept and account for `memo` when sizing the fee target.

Total diff is ~80 lines added across both files; no upstream lines were removed.

## Tests

- **`tests/op-return-unit.test.js`** — unit coverage for `_normalizeMemo`, `_opReturnVBytes`, and the `OP_RETURN` script form (small-push vs `OP_PUSHDATA1`). 13 cases. Runs under `npm run test:unit`.
- **`tests/integration/op-return.integration.test.js`** — regtest coverage: sends a memo-bearing tx, polls until it lands, decodes the tx, and asserts the `OP_RETURN` output carries the memo bytes verbatim. Mirrors the existing integration-test harness pattern (Electrum endpoint via env vars, `generatetoaddress` for funding).

Both new test files follow `AGENTS.md` conventions (JS Standard, Jest, ESM with `experimental-vm-modules`).

## Risk

Pure addition. No upstream behaviour changes when `memo` is omitted. The new `MAX_OP_RETURN_BYTES` cap is enforced at the API boundary — no risk of producing un-relayable transactions on non-standard inputs.

## Out of scope

- Multiple `OP_RETURN` outputs (consensus allows one; mempool policy only one).
- Tapscript / inscription-style data carriers.
- Larger memos (would require enabling `-datacarriersize` on the receiving node — out of scope for a wallet library).

## Reference downstream

`@swapdk/wdk-wallet-btc` (a SwapDK fork) consumes this fork to power the BTC source bridge module against THORChain. The fork can be retired once this PR lands and a release is published.
