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
export const THORCHAIN_PRESET: Partial<CosmosWalletConfig>;
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
export const MAYACHAIN_PRESET: Partial<CosmosWalletConfig>;
export type CosmosWalletConfig = import("./wallet-account-cosmos.js").CosmosWalletConfig;
