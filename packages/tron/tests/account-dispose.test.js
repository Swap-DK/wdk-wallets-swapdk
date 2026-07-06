// Per-account dispose contract for WalletAccountTron, mirroring the
// BTC version. Audit follow-up flagged that the original dispose:
//   1. wasn't idempotent — second call hit `sodium_memzero(undefined)`
//   2. left signing methods to throw cryptic crypto errors instead of
//      a clear "Cannot use disposed wallet account"

import { describe, it, expect } from 'vitest'

import WalletManagerTron from '../src/wallet-manager-tron.js'

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

async function makeAccount() {
  const mgr = new WalletManagerTron(TEST_MNEMONIC, {})
  const account = await mgr.getAccount(0)
  return { account, mgr }
}

describe('WalletAccountTron.dispose idempotency', () => {
  it('isDisposed flips false → true', async () => {
    const { account, mgr } = await makeAccount()
    expect(account.isDisposed).toBe(false)
    account.dispose()
    expect(account.isDisposed).toBe(true)
    mgr.dispose()
  })

  it('second dispose() is a no-op (no crash)', async () => {
    const { account, mgr } = await makeAccount()
    account.dispose()
    // Pre-fix this hit `sodium_memzero(undefined)` since the second
    // call still tried to zero already-cleared privKeyBytes.
    expect(() => account.dispose()).not.toThrow()
    mgr.dispose()
  })

  it('keyPair getter throws post-dispose', async () => {
    const { account, mgr } = await makeAccount()
    account.dispose()
    expect(() => account.keyPair).toThrow(/disposed wallet account/i)
    mgr.dispose()
  })

  it('sign() throws post-dispose', async () => {
    const { account, mgr } = await makeAccount()
    account.dispose()
    await expect(account.sign('hello')).rejects.toThrow(
      /disposed wallet account/i,
    )
    mgr.dispose()
  })

  it('signTransaction() throws post-dispose', async () => {
    const { account, mgr } = await makeAccount()
    account.dispose()
    await expect(
      account.signTransaction({ to: 'TGzz1AAA', value: 100n }),
    ).rejects.toThrow(/disposed wallet account/i)
    mgr.dispose()
  })

  it('sendTransaction() throws post-dispose', async () => {
    const { account, mgr } = await makeAccount()
    account.dispose()
    await expect(
      account.sendTransaction({ to: 'TGzz1AAA', value: 100n }),
    ).rejects.toThrow(/disposed wallet account/i)
    mgr.dispose()
  })

  // Audit-3 finding: @scure/bip32 HDKey.wipePrivateData() does NOT
  // touch chainCode (verified against the library source). Without
  // an explicit clear, the BIP-32 chain code would survive in the
  // heap — sufficient to re-derive child keys from any descendant
  // public key. dispose() must wipe chainCode too.
  it('wipes HDKey chainCode post-dispose (audit-3 fix)', async () => {
    const { account, mgr } = await makeAccount()

    // Grab a live reference to the chainCode buffer BEFORE dispose so
    // we can inspect it after the property gets nulled.
    const chainCodeRef = account._account.chainCode
    expect(chainCodeRef).toBeInstanceOf(Uint8Array)
    expect(chainCodeRef.length).toBe(32)
    expect(chainCodeRef.some(b => b !== 0)).toBe(true)

    account.dispose()

    // Underlying buffer zeroed in place.
    expect(chainCodeRef.every(b => b === 0)).toBe(true)
    // Property reference cleared (matches HDKey's default null).
    expect(account._account.chainCode).toBeNull()

    mgr.dispose()
  })
})
