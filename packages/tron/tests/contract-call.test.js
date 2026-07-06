// Unit tests for the optional `data` + `feeLimit` fields that the
// SwapDK fork adds to WalletAccountTron.sendTransaction /
// signTransaction. tronweb is fully mocked — the test asserts the
// wallet wires through the right tronweb API and respects the
// upstream-equivalent path when `data` is omitted.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import WalletAccountTron from '../src/wallet-account-tron.js'

// A valid 12-word BIP-39 mnemonic — the canonical Ledger / Trezor /
// dev fixture. Stable derivation, no special on-chain meaning.
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'

function makeMockTronWeb({ resources = {} } = {}) {
  const sendTrx = vi.fn().mockResolvedValue({
    txID: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
    raw_data_hex: '0a02' + 'deadbeef'.repeat(50)
  })
  const triggerSmartContract = vi.fn().mockResolvedValue({
    transaction: {
      txID: '1122334455667788991122334455667788991122334455667788991122334455',
      raw_data_hex: '0a02' + 'cafef00d'.repeat(80)
    }
  })
  // tronweb's addUpdateData mutates an existing TransferContract tx
  // by setting raw_data.data to the memo bytes; the new txID is the
  // hash of the modified raw_data so it changes. The mock returns a
  // distinct shape we can assert on downstream.
  const addUpdateData = vi.fn((tx, data, encoding) => Promise.resolve({
    ...tx,
    txID: 'MEMOTXID' + 'abcd'.repeat(14),
    raw_data: { data: Buffer.from(data, encoding ?? 'utf8').toString('hex') },
    _mockMemo: data,
    _mockMemoEncoding: encoding ?? 'utf8',
  }))
  const sendRawTransaction = vi.fn().mockResolvedValue({ txid: 'BROADCASTHASH' })
  const getAccountResources = vi.fn().mockResolvedValue({
    freeNetLimit: 0,
    freeNetUsed: 0,
    NetLimit: 0,
    NetUsed: 0,
    ...resources
  })

  return {
    feeLimit: 150_000_000,
    address: {
      toHex: vi.fn((addr) => '41' + addr.replace(/^T/, '').padStart(40, '0').slice(0, 40))
    },
    transactionBuilder: { sendTrx, triggerSmartContract, addUpdateData },
    trx: { sendRawTransaction, getAccountResources }
  }
}

describe('WalletAccountTron.signTransaction', () => {
  let mockTronWeb, account

  beforeEach(() => {
    mockTronWeb = makeMockTronWeb()
    account = new WalletAccountTron(TEST_MNEMONIC, "0'/0/0", {
      provider: mockTronWeb
    })
  })

  it('routes plain TRX transfer through sendTrx when no data is supplied (upstream-equivalent)', async () => {
    await account.signTransaction({
      to: 'TRecipientAddrxxxxxxxxxxxxxxxxxxx',
      value: 10_000_000n
    })

    expect(mockTronWeb.transactionBuilder.sendTrx).toHaveBeenCalledOnce()
    const [to, value, from] = mockTronWeb.transactionBuilder.sendTrx.mock.calls[0]
    expect(to).toBe('TRecipientAddrxxxxxxxxxxxxxxxxxxx')
    expect(value).toBe(10_000_000n)
    expect(typeof from).toBe('string')
    expect(mockTronWeb.transactionBuilder.triggerSmartContract).not.toHaveBeenCalled()
  })

  it('routes through triggerSmartContract with raw input when data is supplied', async () => {
    const calldata = '0x44bc937b' + 'a614f803b6fd780986a42c78ec9c7f77e6ded13c'.padStart(64, '0').repeat(2) + '0123456789abcdef'.repeat(8)
    await account.signTransaction({
      to: 'TThorRouterxxxxxxxxxxxxxxxxxxxxxx',
      value: 10_000_000n,
      data: calldata,
      feeLimit: 100_000_000n
    })

    expect(mockTronWeb.transactionBuilder.sendTrx).not.toHaveBeenCalled()
    expect(mockTronWeb.transactionBuilder.triggerSmartContract).toHaveBeenCalledOnce()

    const [contract, selector, options, params, fromHex] =
      mockTronWeb.transactionBuilder.triggerSmartContract.mock.calls[0]
    expect(contract).toBe('TThorRouterxxxxxxxxxxxxxxxxxxxxxx')
    expect(selector).toBe('') // empty — tronweb falls back to options.input
    expect(options.input).toBe(calldata.slice(2)) // 0x prefix stripped
    expect(options.callValue).toBe(10_000_000)
    expect(options.feeLimit).toBe(100_000_000)
    expect(params).toEqual([])
    expect(typeof fromHex).toBe('string')
  })

  it('defaults callValue to 0 and feeLimit to tronWeb.feeLimit when omitted', async () => {
    await account.signTransaction({
      to: 'TContractxxxxxxxxxxxxxxxxxxxxxxxxx',
      data: '0xdeadbeef'
    })

    const [, , options] = mockTronWeb.transactionBuilder.triggerSmartContract.mock.calls[0]
    expect(options.callValue).toBe(0)
    expect(options.feeLimit).toBe(150_000_000) // tronWeb.feeLimit
  })

  it('accepts data without the 0x prefix verbatim', async () => {
    await account.signTransaction({
      to: 'TContractxxxxxxxxxxxxxxxxxxxxxxxxx',
      data: 'deadbeef',
      feeLimit: 50_000_000n
    })

    const [, , options] = mockTronWeb.transactionBuilder.triggerSmartContract.mock.calls[0]
    expect(options.input).toBe('deadbeef')
  })

  it('attaches the signature to the returned transaction', async () => {
    const signed = await account.signTransaction({
      to: 'TRecipientxxxxxxxxxxxxxxxxxxxxxxx',
      value: 1_000_000n
    })
    expect(signed).toHaveProperty('signature')
    expect(Array.isArray(signed.signature)).toBe(true)
    expect(signed.signature[0]).toMatch(/^[0-9a-f]{130}$/)
  })

  // Memo path — used for the THORChain direct-vault deposit pattern
  // when the router contract isn't deployed. The wallet must:
  //   1. Build a TransferContract via sendTrx (NOT triggerSmartContract).
  //   2. Attach the memo via addUpdateData (utf8, before signing — the
  //      memo is part of the txID hash preimage).
  //   3. Sign the resulting transaction (signature attaches to the
  //      memo-bearing tx, not the original).
  it('routes TRX-with-memo through sendTrx + addUpdateData (THORChain vault deposit)', async () => {
    const memo = '=:e:0xFff837231e84648664C9A8C8BEb9977556497a6c:367591:SDK:5'
    await account.signTransaction({
      to: 'TN6WohfEwrrrSed2PzsjJMNHLaqVGHceLt',
      value: 20_000_000n, // 20 TRX in sun
      memo,
    })

    expect(mockTronWeb.transactionBuilder.sendTrx).toHaveBeenCalledOnce()
    expect(mockTronWeb.transactionBuilder.addUpdateData).toHaveBeenCalledOnce()
    expect(mockTronWeb.transactionBuilder.triggerSmartContract).not.toHaveBeenCalled()

    const [tx, dataArg, encodingArg] = mockTronWeb.transactionBuilder.addUpdateData.mock.calls[0]
    expect(tx.txID).toBeDefined()         // came from sendTrx
    expect(dataArg).toBe(memo)
    expect(encodingArg).toBe('utf8')
  })

  it('routes plain TRX through sendTrx WITHOUT addUpdateData when memo is empty string', async () => {
    // Empty memo should be treated as "no memo" — don't call
    // addUpdateData (would set raw_data.data to empty hex, which is
    // wasted bandwidth + breaks the upstream-equivalent shape).
    await account.signTransaction({
      to: 'TRecipientxxxxxxxxxxxxxxxxxxxxxxx',
      value: 10_000_000n,
      memo: '',
    })
    expect(mockTronWeb.transactionBuilder.sendTrx).toHaveBeenCalledOnce()
    expect(mockTronWeb.transactionBuilder.addUpdateData).not.toHaveBeenCalled()
  })

  it('prefers data over memo when both are passed (contract call wins)', async () => {
    // Defensive: a caller passing both signals confusion about the
    // path. Existing data-driven contract call wins; memo is ignored
    // (it would be ineffective on a TriggerSmartContract anyway).
    await account.signTransaction({
      to: 'TContractxxxxxxxxxxxxxxxxxxxxxxxxx',
      data: 'deadbeef',
      memo: 'should-be-ignored',
      feeLimit: 50_000_000n,
    })
    expect(mockTronWeb.transactionBuilder.triggerSmartContract).toHaveBeenCalledOnce()
    expect(mockTronWeb.transactionBuilder.sendTrx).not.toHaveBeenCalled()
    expect(mockTronWeb.transactionBuilder.addUpdateData).not.toHaveBeenCalled()
  })
})

describe('WalletAccountTron.sendTransaction', () => {
  let mockTronWeb, account

  beforeEach(() => {
    mockTronWeb = makeMockTronWeb()
    account = new WalletAccountTron(TEST_MNEMONIC, "0'/0/0", {
      provider: mockTronWeb
    })
  })

  it('returns hash and bandwidth-based fee for plain TRX transfer', async () => {
    const result = await account.sendTransaction({
      to: 'TRecipientxxxxxxxxxxxxxxxxxxxxxxx',
      value: 1_000_000n
    })
    expect(result.hash).toBe('BROADCASTHASH')
    expect(typeof result.fee).toBe('bigint')
    expect(result.fee).toBeGreaterThan(0n) // raw_data_hex has length, bandwidth > 0
    expect(mockTronWeb.trx.sendRawTransaction).toHaveBeenCalledOnce()
  })

  it('returns hash and feeLimit (as bigint) as the fee on contract calls', async () => {
    const result = await account.sendTransaction({
      to: 'TContractxxxxxxxxxxxxxxxxxxxxxxxxx',
      value: 0n,
      data: '0xdeadbeef',
      feeLimit: 80_000_000n
    })
    expect(result.hash).toBe('BROADCASTHASH')
    // For contract calls we surface feeLimit as the conservative
    // upper bound (the actual energy burn is wallet-side and known
    // only after the tx lands).
    expect(result.fee).toBe(80_000_000n)
  })

  it('falls back to bandwidth fee when data is supplied without feeLimit', async () => {
    const result = await account.sendTransaction({
      to: 'TContractxxxxxxxxxxxxxxxxxxxxxxxxx',
      data: '0xdeadbeef'
      // no feeLimit — wallet uses tronWeb.feeLimit for the cap but
      // reports bandwidth as the fee since feeLimit is undefined
    })
    expect(typeof result.fee).toBe('bigint')
  })
})
