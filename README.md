# SwapDK WDK wallet modules

Monorepo for [SwapDK](https://swapdk.com) WDK wallet packages. Each package extends or forks an upstream WDK wallet to add capabilities SwapDK's bridge protocols depend on but the upstream doesn't yet expose.

## Packages

| Package | Forked from | Adds |
|---|---|---|
| [`@swapdk/wdk-wallet-cosmos`](./packages/cosmos) | [`@base58-io/wdk-wallet-cosmos`](https://www.npmjs.com/package/@base58-io/wdk-wallet-cosmos) (Apache-2.0) | THORChain (RUNE) + MAYAChain (CACAO) `MsgDeposit` for swap-deposit transactions |

Each package's README has the user-facing documentation.

## Layout

```
wdk-wallets-swapdk/
├── packages/
│   └── cosmos/   # @swapdk/wdk-wallet-cosmos — Cosmos + THORChain + MAYAChain
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
```

Changeset workflow (optional, for changelog discipline):

```bash
npx changeset                # interactively record an intent
npx changeset version        # apply pending changesets — bumps versions, updates CHANGELOG.md
```

## License

Apache-2.0. Forked packages preserve the original license. See [`NOTICE`](./NOTICE) for attribution to upstream maintainers.
