# @swapdk/wdk-wallet-cosmos

A WDK wallet module for Cosmos-SDK chains, with first-class support for **THORChain (RUNE)** and **MAYAChain (CACAO)** swap deposits.

Use it to:

- Manage a BIP-39 seed and derive any number of Cosmos accounts.
- Send native and IBC token transfers on any Cosmos-SDK chain.
- Deposit RUNE on THORChain or CACAO on MAYAChain to enter a cross-chain swap (the `MsgDeposit` flow).
- Auto-configure from `chain-registry` for public chains, or pass a custom config for private/local ones.

## Installation

```bash
npm install @swapdk/wdk-wallet-cosmos
```

Requires Node.js 18+ (or the Bare runtime via the `bare.js` entry).

## Quick start

### Standard Cosmos chain

```javascript
import WalletManagerCosmos from '@swapdk/wdk-wallet-cosmos'

const wallet = new WalletManagerCosmos(seedPhrase, {
  chainName: 'cosmoshub', // or 'osmosis', 'juno', any chain-registry key
})

const account = await wallet.getAccount(0)
const address = await account.getAddress()
const balance = await account.getBalance() // native denom, in base units

await account.transfer({
  token: 'uatom',
  recipient: 'cosmos1…',
  amount: 1000000n, // 1 ATOM
})
```

### THORChain — deposit RUNE for a swap

```javascript
import WalletManagerCosmos, {
  THORCHAIN_PRESET,
} from '@swapdk/wdk-wallet-cosmos'

const wallet = new WalletManagerCosmos(seedPhrase, {
  ...THORCHAIN_PRESET,
  rpcEndpoints: ['https://rpc.thorchain.info'],
})
const account = await wallet.getAccount(0)

const result = await account.deposit({
  asset: 'THOR.RUNE',
  amount: 100000000n, // 1 RUNE = 1e8 base units
  memo: '=:BTC.BTC:bc1qrecipient…:0/1/0',
})
console.log(result.hash, result.fee)
```

### MAYAChain — deposit CACAO for a swap

```javascript
import WalletManagerCosmos, {
  MAYACHAIN_PRESET,
} from '@swapdk/wdk-wallet-cosmos'

const wallet = new WalletManagerCosmos(seedPhrase, {
  ...MAYACHAIN_PRESET,
  rpcEndpoints: ['https://tendermint.mayachain.info'],
})
const account = await wallet.getAccount(0)

await account.deposit({
  asset: 'MAYA.CACAO',
  amount: 10000000000n, // 1 CACAO = 1e10 base units
  memo: '=:ETH.ETH:0xrecipient…:0/1/0',
})
```

### Custom or local chain

```javascript
const wallet = new WalletManagerCosmos(seedPhrase, {
  rpcEndpoints: ['http://localhost:26657'],
  addressPrefix: 'cosmos',
  nativeDenom: 'uatom',
  coinType: 118,
  gasPrice: '0.025uatom',
})
```

## API

### `WalletManagerCosmos`

```javascript
new WalletManagerCosmos(seed, config)
```

| Arg      | Type                    | Description                                                                |
| -------- | ----------------------- | -------------------------------------------------------------------------- |
| `seed`   | `string \| Uint8Array`  | BIP-39 mnemonic or raw seed bytes.                                         |
| `config` | object (see below)      | Either a `chainName` (auto-resolved from `chain-registry`) or full custom config. |

**Config fields:**

| Field             | Type                  | Description                                                                                                                                                |
| ----------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chainName`       | `string`              | Chain-registry key — `'cosmoshub'`, `'osmosis'`, `'juno'`, etc. Auto-fills `addressPrefix`, `nativeDenom`, `coinType`, `gasPrice`, and default RPC endpoints. |
| `rpcEndpoints`    | `string[]`            | RPC URLs, tried in order with retry. Required for any signing or balance query. Overrides registry defaults.                                               |
| `addressPrefix`   | `string`              | Bech32 prefix (`'cosmos'`, `'thor'`, `'maya'`, …). Default `'cosmos'`.                                                                                     |
| `nativeDenom`     | `string`              | Gas/fee denom (`'uatom'`, `'rune'`, `'cacao'`, …). Default `'uatom'`.                                                                                      |
| `coinType`        | `number`              | BIP-44 slot. Default `118`.                                                                                                                                |
| `gasPrice`        | `string`              | E.g. `'0.025uatom'`. Used when `chain-registry` doesn't supply gas-price hints.                                                                            |
| `transferMaxFee`  | `number \| bigint`    | Cap; transfer/deposit operations throw if estimated fee ≥ this value.                                                                                      |
| `retryCount`      | `number`              | RPC fallback rounds. Default `3`.                                                                                                                          |
| `retryDelay`      | `number` (ms)         | Base delay for exponential backoff. Default `150`.                                                                                                         |

**Methods:**

| Method                   | Returns                                | Description                                              |
| ------------------------ | -------------------------------------- | -------------------------------------------------------- |
| `getAccount(index)`      | `Promise<WalletAccountCosmos>`         | Account at `m/44'/<coinType>'/<index>'/0/0`.             |
| `getAccountByPath(path)` | `Promise<WalletAccountCosmos>`         | Account at a full BIP-44 path tail, e.g. `"0'/0/5"`.     |
| `getFeeRates()`          | `Promise<{normal: bigint, fast: bigint}>` | Current fee estimates (base units).                  |
| `dispose()`              | `void`                                 | Zero seed + key buffers. Subsequent calls throw.         |

### `WalletAccountCosmos`

| Method                                          | Returns                              | Description                                                                                       |
| ----------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `getAddress()`                                  | `Promise<string>`                    | The bech32 address.                                                                               |
| `getBalance(denom?)`                            | `Promise<bigint>`                    | Balance in base units. Defaults to `nativeDenom`.                                                 |
| `getTokenBalance(denom)`                        | `Promise<bigint>`                    | Balance of one specific denom.                                                                    |
| `getTokenBalances(denoms)`                      | `Promise<Record<string,bigint>>`     | Balances of multiple denoms.                                                                      |
| `transfer({token,recipient,amount})`            | `Promise<{hash,fee}>`                | Send native or IBC tokens (`MsgSend`).                                                            |
| `quoteTransfer({...})`                          | `Promise<{fee}>`                     | Estimate the fee for a transfer without broadcasting.                                             |
| `sendTransaction(tx)`                           | `Promise<{hash,fee}>`                | Send a raw Cosmos transaction payload.                                                            |
| `quoteSendTransaction(tx)`                      | `Promise<{fee}>`                     | Estimate the fee for a raw transaction.                                                           |
| `deposit({asset,amount,memo}, overrides?)`      | `Promise<{hash,fee}>`                | THORChain / MAYAChain `MsgDeposit` — see below.                                                   |
| `dispose()`                                     | `void`                               | Zero this account's keys.                                                                         |

> Message signing (`sign`) and verification (`verify`) are not implemented.

#### `transfer({ token, recipient, amount, memo? })`

| Field       | Type      | Description                                                                                                                                                              |
| ----------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `token`     | `string`  | Denom — `'uatom'`, `'rune'`, IBC denom…                                                                                                                                  |
| `recipient` | `string`  | Bech32 address.                                                                                                                                                          |
| `amount`    | `bigint`  | Amount in base units.                                                                                                                                                    |
| `memo`      | `string`  | Optional. Tx memo attached to the `MsgSend` (or IBC `MsgTransfer`). Defaults to `'Transfer via WDK'` / `'Transfer via WDK (IBC)'`. Required for THORChain/MAYAChain swap deposits via inbound vault — the memo encodes the swap intent and must match what the protocol expects. |

Throws if `transferMaxFee` is configured and the estimated fee meets or exceeds it.

#### `deposit({ asset, amount, memo }, overrides?)`

Signs and broadcasts a `types.MsgDeposit` — the message THORChain and MAYAChain use to enter a cross-chain swap. The configured `addressPrefix` determines which network (`'thor'` → THORChain, `'maya'` → MAYAChain).

| Field      | Type                | Description                                                                                                                              |
| ---------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `asset`    | `string`            | SwapKit-style asset string of the coin being deposited: `'THOR.RUNE'`, `'MAYA.CACAO'`, or `'CHAIN.SYMBOL-0xAddress'` for trade assets.   |
| `amount`   | `bigint \| string`  | Amount in the asset's native base units (RUNE: 1e8, CACAO: 1e10).                                                                        |
| `memo`     | `string`            | Swap memo. Required and non-empty. The memo determines the destination chain, recipient, and slippage — see below.                       |
| `overrides.gas` | `string \| number` | Gas limit override. Default `200000`. Bump if a deposit fails with "out of gas".                                                       |

Returns `{ hash, fee }`.

**About the memo.** The memo is the entire instruction set for the swap — destination chain, asset, address, slippage, optional affiliate. THORChain documents the format at <https://dev.thorchain.org/concepts/memos.html>. Common shapes:

```text
=:BTC.BTC:bc1qrecipient…:0/1/0          # swap to BTC, no min-out
=:ETH.USDC-0xA0b8…:0xrecipient…:1/1/0   # swap to ERC-20 USDC
+:BTC/BTC                                # add liquidity to BTC pool
```

A malformed memo can send funds to the wrong destination — validate before broadcasting.

### Presets

```javascript
import {
  THORCHAIN_PRESET,
  MAYACHAIN_PRESET,
} from '@swapdk/wdk-wallet-cosmos'
```

Spread either preset into your `WalletManagerCosmos` config. They're frozen, immutable.

| Preset             | `addressPrefix` | `nativeDenom` | `coinType` | `gasPrice`   |
| ------------------ | --------------- | ------------- | ---------- | ------------ |
| `THORCHAIN_PRESET` | `thor`          | `rune`        | `931`      | `0.02rune`   |
| `MAYACHAIN_PRESET` | `maya`          | `cacao`       | `931`      | `2cacao`     |

You still need to pass `rpcEndpoints` yourself.

### Asset string parser

```javascript
import { parseAssetString } from '@swapdk/wdk-wallet-cosmos'

parseAssetString('THOR.RUNE')
// → { chain: 'THOR', symbol: 'RUNE', ticker: 'RUNE', synth: false, … }

parseAssetString('ETH.USDC-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48')
// → { chain: 'ETH', symbol: 'USDC', ticker: 'USDC', … }
```

The contract suffix is stripped — THORChain matches by ticker. Chain prefix is upper-cased.

You don't need to call this for `deposit()` — it parses internally. Use it when you want to validate or inspect an asset string before passing it on.

### Building your own signing client

`deposit()` covers the common case. If you need to sign other custom message types alongside `MsgDeposit`, build the `Registry` yourself:

```javascript
import {
  createThorMayaRegistry,
  TYPE_URL_MSG_DEPOSIT,
} from '@swapdk/wdk-wallet-cosmos'
import { SigningStargateClient } from '@cosmjs/stargate'

const registry = createThorMayaRegistry() // standard Cosmos types + MsgDeposit
const client = await SigningStargateClient.connectWithSigner(rpc, signer, { registry })

await client.signAndBroadcast(senderAddress, [
  { typeUrl: TYPE_URL_MSG_DEPOSIT, value: { /* … */ } },
], fee, memo)
```

The raw `Asset`, `Coin`, and `MsgDeposit` proto encoders are exported too if you want to encode/decode payloads manually.

### Helpers

```javascript
import {
  resolveChainConfig,
  getAvailableChains,
  isKnownChain,
} from '@swapdk/wdk-wallet-cosmos'

const cfg = resolveChainConfig({ chainName: 'osmosis' })
// → { addressPrefix: 'osmo', nativeDenom: 'uosmo', coinType: 118, rpcEndpoints: [...], … }

getAvailableChains() // ['cosmoshub', 'osmosis', 'juno', …]
isKnownChain('osmosis') // true
isKnownChain('mychain') // false
```

## Fees

Estimated fee = `ceil(gasPrice * gasLimit)`.

Default gas limit is `200000`. Gas price is resolved in this order:

1. `gasPriceStep` from `chain-registry` (`average` / `high`)
2. `gasPrice` from your config (e.g. `'0.025uatom'`)
3. Default Cosmos tier — `0.01 / 0.025 / 0.04`

Set `transferMaxFee` to bound estimates; transfer/deposit throws when the estimate meets or exceeds the cap.

## Memory hygiene

The wallet stores private keys in buffers that are zeroed via `sodium-universal`'s `sodium_memzero` on `dispose()`. After dispose, every method throws.

```javascript
account.dispose()
wallet.dispose()
console.log(wallet.isDisposed) // true
```

Treat seed phrases as private keys — never log them, never check them in.

## Platform support

| Platform     | Status | Notes                                                          |
| ------------ | ------ | -------------------------------------------------------------- |
| Node.js 18+  | ✅      | Full support                                                   |
| Bare runtime | ✅      | Use the `bare.js` entry (resolved automatically by Bare)       |
| Browser      | ✅      | Full support                                                   |
| React Native | ⚠️      | Crypto polyfills required:                                     |

```javascript
import 'react-native-get-random-values'
import '@ethersproject/shims'
import WalletManagerCosmos from '@swapdk/wdk-wallet-cosmos'
```

## Security

- **Validate every transaction before signing.** For deposits in particular, a malformed memo can route funds to the wrong destination chain.
- **Use trusted RPC endpoints.** RPC nodes can return false balance data; multi-endpoint fallback partially mitigates but doesn't eliminate this.
- **Set `transferMaxFee`** to cap unexpected fee spikes.
- **Call `dispose()`** as soon as a wallet is no longer needed.
- Keep your seed phrase out of source control, logs, error reports, and analytics.

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
