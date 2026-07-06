# SwapDK WDK wallet modules

Monorepo for [SwapDK](https://swapdk.com) WDK wallet packages. Each package extends or forks an upstream WDK wallet to add capabilities SwapDK's bridge protocols depend on but the upstream doesn't yet expose.

## Packages

| Package | Forked from | Adds |
|---|---|---|
| [`@swapdk/wdk-wallet-cosmos`](./packages/cosmos) | [`@base58-io/wdk-wallet-cosmos`](https://www.npmjs.com/package/@base58-io/wdk-wallet-cosmos) (Apache-2.0) | THORChain (RUNE) + MAYAChain (CACAO) `MsgDeposit` for swap-deposit transactions |
| [`@swapdk/wdk-wallet-btc`](./packages/btc) | [`@tetherto/wdk-wallet-btc`](https://www.npmjs.com/package/@tetherto/wdk-wallet-btc) (Apache-2.0) | Optional `memo` field on `sendTransaction` / `signTransaction` — emitted as an OP_RETURN output (≤80 bytes). Required for THORChain inbound observation on BTC source. |
| [`@swapdk/wdk-wallet-tron`](./packages/tron) | [`@tetherto/wdk-wallet-tron`](https://www.npmjs.com/package/@tetherto/wdk-wallet-tron) (Apache-2.0) | Optional `data` (hex calldata) + `feeLimit` (SUN) on `sendTransaction` / `signTransaction` — emits a `TriggerSmartContract` for invoking arbitrary contracts (e.g. THORChain router `depositWithExpiry`). |

Each package's README has the user-facing documentation.

## Layout

```
wdk-wallets-swapdk/
├── packages/
│   ├── cosmos/   # @swapdk/wdk-wallet-cosmos — Cosmos + THORChain + MAYAChain
│   ├── btc/      # @swapdk/wdk-wallet-btc    — Bitcoin + OP_RETURN memo support
│   └── tron/     # @swapdk/wdk-wallet-tron   — TRON + raw-calldata contract calls
└── package.json  # Workspaces config
```

## Working in the monorepo

```bash
npm install        # one-time, installs all workspaces
npm run build      # compiles every package
npm run lint       # lints every package
npm test           # runs vitest with workspace awareness
```

## Releasing

Per-package, manually, after a clean `npm install` + `npm run build` + `npm test`:

```bash
npm publish -w @swapdk/wdk-wallet-cosmos --access public
npm publish -w @swapdk/wdk-wallet-btc    --access public
npm publish -w @swapdk/wdk-wallet-tron   --access public
```

Changeset workflow (optional, for changelog discipline):

```bash
npx changeset                # interactively record an intent
npx changeset version        # apply pending changesets — bumps versions, updates CHANGELOG.md
```

## License

Apache-2.0. Forked packages preserve the original license. See [`NOTICE`](./NOTICE) for attribution to upstream maintainers.
