// Per-account dispose contract for WalletAccountBtc:
//   1. dispose() is idempotent — a second call must not crash (the
//      original code called sodium_memzero on undefined fields).
//   2. After dispose, every private-key-touching method must throw
//      a clear "Cannot use disposed wallet account" instead of
//      returning silently or hitting a cryptic crypto error.
//   3. isDisposed flips on dispose() and stays true.

import { describe, it, expect } from 'vitest'

import WalletManagerBtc from '../src/wallet-manager-btc.js'

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

async function makeAccount() {
  const mgr = new WalletManagerBtc(TEST_MNEMONIC, { network: 'bitcoin' })
  const account = await mgr.getAccount(0)
  return { account, mgr }
}

describe('WalletAccountBtc.dispose idempotency', () => {
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
    // Pre-fix this hit `sodium_memzero(this._masterNode.privateKey)`
    // with masterNode === undefined and crashed.
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
      account.signTransaction({ to: 'bc1qxxx', value: 100n }),
    ).rejects.toThrow(/disposed wallet account/i)
    mgr.dispose()
  })

  it('sendTransaction() throws post-dispose', async () => {
    const { account, mgr } = await makeAccount()
    account.dispose()
    await expect(
      account.sendTransaction({ to: 'bc1qxxx', value: 100n }),
    ).rejects.toThrow(/disposed wallet account/i)
    mgr.dispose()
  })
})
