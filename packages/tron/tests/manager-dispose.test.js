// Verifies that WalletManagerTron.dispose() zeroes the BIP-39-derived
// seed buffer the base WalletManager retains in `this._seed`. Without
// this override the 64-byte seed survives in the V8 heap for the
// process lifetime, defeating the point of dispose().

import { describe, it, expect } from 'vitest'

import WalletManagerTron from '../src/wallet-manager-tron.js'

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

describe('WalletManagerTron.dispose seed zeroing', () => {
  // AUDIT4-M1: previously, calling getAccount() after dispose() would
  // silently derive from the zeroed seed buffer — producing a public,
  // deterministic key. The dispose guard must throw instead.
  it('throws on getAccount() / getAccountByPath() / getFeeRates() after dispose', async () => {
    const mgr = new WalletManagerTron(TEST_MNEMONIC, {})
    mgr.dispose()

    await expect(mgr.getAccount(0)).rejects.toThrow(/disposed wallet manager/i)
    await expect(mgr.getAccountByPath("0'/0/0")).rejects.toThrow(/disposed wallet manager/i)
    // getFeeRates throws even without a connected tronweb because the
    // dispose check fires first; that's the contract we want.
    await expect(mgr.getFeeRates()).rejects.toThrow(/disposed wallet manager/i)
  })

  it('zeroes this._seed (Uint8Array) after dispose()', () => {
    const mgr = new WalletManagerTron(TEST_MNEMONIC, {})

    const seed = mgr.seed
    expect(seed).toBeInstanceOf(Uint8Array)
    expect(seed.length).toBe(64)
    expect(seed.some(b => b !== 0)).toBe(true)

    mgr.dispose()

    expect(seed.every(b => b === 0)).toBe(true)
  })
})
