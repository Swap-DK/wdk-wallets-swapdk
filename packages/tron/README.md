# @swapdk/wdk-wallet-tron

WDK wallet module for TRON. Fork of [`@tetherto/wdk-wallet-tron`](https://github.com/tetherto/wdk-wallet-tron) that adds **raw-calldata contract calls** to `sendTransaction` / `signTransaction`, so a wallet account can invoke arbitrary smart contracts (e.g. the THORChain router's `depositWithExpiry`) on TRON without reaching into private TronWeb internals.

Everything else — BIP-32 derivation, message signing, plain TRX transfers, hardcoded TRC-20 `transfer(address,uint256)` — is unchanged from upstream. See the [upstream README](https://github.com/tetherto/wdk-wallet-tron#readme) for the full API.

## Why this fork exists

THORChain (and MAYAChain) routes inbound deposits on TRON through a **router smart contract** (`THOR_router.depositWithExpiry(...)`) — the same pattern used on EVM chains. The upstream `WalletAccountTron.sendTransaction({ to, value })` only does plain TRX transfers; `WalletAccountTron.transfer({ token, recipient, amount })` is hardcoded to `transfer(address,uint256)`. Neither can call the router with the swap's vault, asset, amount, memo, expiration arguments, leaving any THORChain-routed TRON source flow blocked.

This fork adds two optional fields — `data` and `feeLimit` — to the existing `sendTransaction` / `signTransaction` options. When `data` is supplied, the wallet emits a `TriggerSmartContract` transaction carrying the calldata verbatim (via tronweb's `input` option). Everything else is bit-for-bit upstream. The change is intended to land upstream as a PR; this fork exists so the SwapDK TRON bridge module can ship while that review happens.

## What changed

`WalletAccountTron.sendTransaction` and `WalletAccountTron.signTransaction` now accept:

```js
import WalletManagerTron from '@swapdk/wdk-wallet-tron'

const wallet = new WalletManagerTron(seed, { provider: 'https://api.trongrid.io' })
const account = await wallet.getAccount(0)

// Plain TRX transfer — unchanged from upstream
await account.sendTransaction({
  to:    'TRecipientxxxxxxxxxxxxxxxxxxxxxxx',
  value: 10_000_000n,                       // sun
})

// NEW: contract call (e.g. THORChain router deposit)
await account.sendTransaction({
  to:        'TThorRouterxxxxxxxxxxxxxxxxxxxxxx',   // contract base58
  value:     10_000_000n,                            // callValue (sun) — for native TRX deposits
  data:      '0x44bc937b…',                          // pre-encoded calldata (selector + args)
  feeLimit:  100_000_000n,                           // SUN cap on energy
})
```

When `data` is omitted (or empty), the behaviour is identical to upstream — a plain TRX transfer.

`data` is the full ABI-encoded calldata including the 4-byte function selector. The fork delegates encoding to whatever produced it (swap-engine's `BuildRouterDepositWithExpiryCalldata`, for instance) — the wallet itself does not parse or interpret it.

## Install

```bash
npm install @swapdk/wdk-wallet-tron
```

## Upstreaming

The diff is being prepared for submission to [tetherto/wdk-wallet-tron](https://github.com/tetherto/wdk-wallet-tron). Once it lands upstream and the relevant version is published on npm, this fork will be deprecated. Until then it is the source of truth for SwapDK's TRON source bridge module.

## License

Apache-2.0. Original copyright Tether Operations Limited; modifications copyright SwapDK. See `NOTICE`.
