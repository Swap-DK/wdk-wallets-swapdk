// Verifies that WalletManagerBtc.dispose() zeroes the BIP-39-derived
// seed buffer the base WalletManager retains in `this._seed`. The base
// class does not do this; leaving 64 bytes of key material in the V8
// heap defeats the purpose of an explicit dispose() call.

import { describe, it, expect } from 'vitest'

import WalletManagerBtc from '../src/wallet-manager-btc.js'

// 12-word BIP-39 test vector. Public, well-known, no funds.
const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

describe('WalletManagerBtc.dispose seed zeroing', () => {
  it('zeroes this._seed (Uint8Array) after dispose()', () => {
    const mgr = new WalletManagerBtc(TEST_MNEMONIC, { network: 'bitcoin' })

    const seed = mgr.seed
    expect(seed).toBeInstanceOf(Uint8Array)
    expect(seed.length).toBe(64)
    // Sanity: before dispose, the seed should NOT be all-zero (the test
    // vector deterministically derives to a non-trivial 64-byte output).
    expect(seed.some(b => b !== 0)).toBe(true)

    mgr.dispose()

    // After dispose, every byte should be 0 — sodium_memzero ran.
    expect(seed.every(b => b === 0)).toBe(true)
  })

  // AUDIT4-M1: previously, calling getAccount() after dispose() would
  // silently derive from the zeroed seed buffer — producing a public,
  // deterministic key that any attacker can compute and watch for
  // accidental deposits. The dispose guard must throw instead.
  it('throws on getAccount() / getAccountByPath() / getFeeRates() after dispose', async () => {
    const mgr = new WalletManagerBtc(TEST_MNEMONIC, { network: 'bitcoin' })
    mgr.dispose()

    await expect(mgr.getAccount(0)).rejects.toThrow(/disposed wallet manager/i)
    await expect(mgr.getAccountByPath("0'/0/0")).rejects.toThrow(/disposed wallet manager/i)
    await expect(mgr.getFeeRates()).rejects.toThrow(/disposed wallet manager/i)
  })

  it('handles Uint8Array seed inputs as well', () => {
    const tmp = new WalletManagerBtc(TEST_MNEMONIC, { network: 'bitcoin' })
    const seedBytes = Uint8Array.from(tmp.seed)
    tmp.dispose()

    // Now feed the buffer back as raw bytes.
    const mgr = new WalletManagerBtc(seedBytes, { network: 'bitcoin' })
    expect(mgr.seed).toBeInstanceOf(Uint8Array)

    mgr.dispose()
    expect(mgr.seed.every(b => b === 0)).toBe(true)
  })
})
