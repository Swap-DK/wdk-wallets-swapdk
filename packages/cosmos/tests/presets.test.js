// Sanity-check the THORChain / MAYAChain config presets. These values
// are baked-in mainnet constants — they should never change silently,
// so this test pins the exact tuple consumers will rely on.

import { describe, it, expect } from 'vitest'

import { THORCHAIN_PRESET, MAYACHAIN_PRESET } from '../src/presets.js'

describe('THORCHAIN_PRESET', () => {
  it('uses thor bech32 prefix and rune denom', () => {
    expect(THORCHAIN_PRESET.addressPrefix).toBe('thor')
    expect(THORCHAIN_PRESET.nativeDenom).toBe('rune')
  })

  it('uses BIP-44 coin type 931', () => {
    expect(THORCHAIN_PRESET.coinType).toBe(931)
  })

  it('has a sensible default gas price', () => {
    expect(THORCHAIN_PRESET.gasPrice).toBe('0.02rune')
  })

  it('is frozen (immutable) so consumers cannot accidentally mutate shared config', () => {
    expect(Object.isFrozen(THORCHAIN_PRESET)).toBe(true)
  })
})

describe('MAYACHAIN_PRESET', () => {
  it('uses maya bech32 prefix and cacao denom', () => {
    expect(MAYACHAIN_PRESET.addressPrefix).toBe('maya')
    expect(MAYACHAIN_PRESET.nativeDenom).toBe('cacao')
  })

  it('shares THORChain BIP-44 coin type 931 (Maya kept the slot when forking)', () => {
    expect(MAYACHAIN_PRESET.coinType).toBe(931)
  })

  it('has a default gas price in cacao', () => {
    expect(MAYACHAIN_PRESET.gasPrice).toBe('2cacao')
  })

  it('is frozen', () => {
    expect(Object.isFrozen(MAYACHAIN_PRESET)).toBe(true)
  })
})
