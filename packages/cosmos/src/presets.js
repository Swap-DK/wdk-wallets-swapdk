// SwapDK addition: ready-to-use chain configs for THORChain and MAYAChain.
//
// Neither network is in the public `chain-registry` package the upstream
// wallet uses for chain auto-resolution, so consumers would otherwise have
// to assemble the correct addressPrefix / nativeDenom / coinType /
// gasPrice tuple themselves. These presets capture the canonical mainnet
// values; pass the relevant one to `WalletManagerCosmos` along with your
// `rpcEndpoints` and you're set.

'use strict'

/**
 * @typedef {import('./wallet-account-cosmos.js').CosmosWalletConfig} CosmosWalletConfig
 */

/**
 * THORChain mainnet preset.
 *
 * - addressPrefix `thor` (bech32)
 * - native gas token RUNE, denom `rune`, 1e8 base units (8 decimals)
 * - BIP-44 coin type 931
 * - default gas price 0.02 RUNE per gas
 *
 * @type {Partial<CosmosWalletConfig>}
 */
export const THORCHAIN_PRESET = Object.freeze({
  addressPrefix: 'thor',
  nativeDenom: 'rune',
  coinType: 931,
  gasPrice: '0.02rune',
})

/**
 * MAYAChain mainnet preset.
 *
 * - addressPrefix `maya` (bech32)
 * - native gas token CACAO, denom `cacao`, 1e10 base units (10 decimals)
 * - BIP-44 coin type 931 (Maya forked from Thor and kept the slot)
 * - default gas price 2 CACAO per gas (the unit-scale on Maya is 100×
 *   THORChain's, so the absolute number is higher even though the USD
 *   cost is comparable)
 *
 * @type {Partial<CosmosWalletConfig>}
 */
export const MAYACHAIN_PRESET = Object.freeze({
  addressPrefix: 'maya',
  nativeDenom: 'cacao',
  coinType: 931,
  gasPrice: '2cacao',
})
