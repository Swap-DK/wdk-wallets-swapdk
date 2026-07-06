# @swapdk/wdk-wallet-btc

WDK wallet module for Bitcoin. Fork of [`@tetherto/wdk-wallet-btc`](https://github.com/tetherto/wdk-wallet-btc) that adds optional **`OP_RETURN` memo** support to `sendTransaction` / `signTransaction`, so a spending transaction can carry a swap memo (THORChain, MAYAChain) in a single PSBT output.

Everything else — BIP-84 Native SegWit by default, Electrum and Blockbook transports, BIP-32 derivation, coin-selection — is unchanged from upstream. See the [upstream README](https://github.com/tetherto/wdk-wallet-btc#readme) for the full API.

## Why this fork exists

THORChain (and MAYAChain) **routes incoming BTC deposits on the `OP_RETURN` memo** of the spending transaction. Without that memo, a deposit to the THORChain inbound vault is either refunded or treated as a pool donation. The upstream `WalletAccountBtc.sendTransaction` API exposes only a single recipient output (`to` / `value` / `feeRate`) and no way to attach an `OP_RETURN` payload, leaving any THORChain-routed BTC source flow blocked.

This fork adds a single optional field — `memo` — to the existing send/sign options. Everything else is bit-for-bit upstream. The change is intended to land upstream as a PR; this fork exists so the SwapDK BTC bridge module can ship while that review happens.

## What changed

`WalletAccountBtc.sendTransaction` and `WalletAccountBtc.signTransaction` now accept an optional `memo` field:

```js
import WalletManagerBtc from '@swapdk/wdk-wallet-btc'

const wallet = new WalletManagerBtc({ /* ... */ })
const account = await wallet.getAccount(0)

const { hash, fee } = await account.sendTransaction({
  to:    'bc1qayml3n2nyavx0saqjpkz07h0wcpdum59uegwr9',
  value: 1_000_000n,                       // satoshis
  memo:  '=:e:0xe89E6305…:32324827:commission/SDK:444/5'
})
```

The memo bytes are emitted as an extra `OP_RETURN` output with value `0`. Standardness rules cap `OP_RETURN` at **80 bytes** on mainnet (Bitcoin Core policy); the wallet rejects longer memos with `RangeError` before constructing the PSBT.

`memo` may be a string (encoded as UTF-8) or a `Buffer` / `Uint8Array` of raw bytes. If omitted, the behaviour is identical to upstream — no `OP_RETURN` output is added.

`getMaxSpendable()` accepts the same `memo` field so callers can compute "send everything" amounts that already account for the OP_RETURN output's vbytes.

## Install

```bash
npm install @swapdk/wdk-wallet-btc
```

## Upstreaming

The diff is being prepared for submission to [tetherto/wdk-wallet-btc](https://github.com/tetherto/wdk-wallet-btc). Once it lands upstream and the relevant version is published on npm, this fork will be deprecated. Until then it is the source of truth for SwapDK's BTC source bridge module.

## License

Apache-2.0. Original copyright Tether Operations Limited; modifications copyright SwapDK. See `NOTICE`.
