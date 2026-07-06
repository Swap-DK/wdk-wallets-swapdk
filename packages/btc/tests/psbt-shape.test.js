// Sanity test that the PSBT recipe used by _getRawTransaction —
// recipient output, optional change output, optional OP_RETURN output —
// produces a transaction with the expected shape and that the
// OP_RETURN output is parseable by an independent decoder.

import { describe, it, expect } from 'vitest'
import { Psbt, payments, networks, Transaction } from 'bitcoinjs-lib'
import { BIP32Factory } from 'bip32'
import * as ecc from '@bitcoinerlab/secp256k1'

import { _normalizeMemo } from '../src/wallet-account-btc.js'

const bip32 = BIP32Factory(ecc)
const network = networks.regtest

// Deterministic test fixture: a 32-byte all-ones master key. Produces a
// stable p2wpkh address every run.
const masterNode = bip32.fromPrivateKey(
  Buffer.alloc(32, 1),
  Buffer.alloc(32, 2),
  {
    wif: 0xef,
    bip32: { public: 0x043587cf, private: 0x04358394 },
    messagePrefix: '\x18Bitcoin Signed Message:\n',
    bech32: 'bcrt',
    pubKeyHash: 0x6f,
    scriptHash: 0xc4
  }
)
const account = masterNode.derivePath("m/84'/1'/0'/0/0")
const { address } = payments.p2wpkh({ pubkey: account.publicKey, network })

// A fake previous tx (we never need it spent on-chain — the PSBT is
// merely a structural assertion). One p2wpkh output paying our test
// address 200_000 sats, addressed by a synthetic 32-byte txid.
const PREV_VALUE = 200_000
const PREV_TXID = '11'.repeat(32)
const witnessScript = payments.p2wpkh({ pubkey: account.publicKey, network }).output

function buildPsbtLikeWalletAccountBtc ({ recipient, recipientValue, changeValue, memoBytes }) {
  const psbt = new Psbt({ network })

  psbt.addInput({
    hash: PREV_TXID,
    index: 0,
    witnessUtxo: { script: witnessScript, value: PREV_VALUE },
    bip32Derivation: [{
      masterFingerprint: masterNode.fingerprint,
      path: "m/84'/1'/0'/0/0",
      pubkey: account.publicKey
    }]
  })

  psbt.addOutput({ address: recipient, value: recipientValue })
  if (changeValue > 0) psbt.addOutput({ address, value: changeValue })
  if (memoBytes) {
    const opReturnScript = payments.embed({ data: [memoBytes] }).output
    psbt.addOutput({ script: opReturnScript, value: 0 })
  }

  psbt.signInputHD(0, masterNode)
  psbt.finalizeAllInputs()
  return psbt.extractTransaction()
}

describe('PSBT shape parity with _getRawTransaction', () => {
  const recipient = address // round-trip to self for the fixture

  it('produces a 2-output tx when no memo (upstream-equivalent)', () => {
    const tx = buildPsbtLikeWalletAccountBtc({
      recipient,
      recipientValue: 100_000,
      changeValue: 99_000,
      memoBytes: null
    })
    expect(tx.outs).toHaveLength(2)
    expect(tx.outs[0].value).toBe(100_000)
    expect(tx.outs[1].value).toBe(99_000)
  })

  it('appends a 0-value OP_RETURN output when memo is supplied', () => {
    const memoBytes = _normalizeMemo('=:e:0xabc:1234:commission/SDK:444/5')
    const tx = buildPsbtLikeWalletAccountBtc({
      recipient,
      recipientValue: 100_000,
      changeValue: 99_000,
      memoBytes
    })
    expect(tx.outs).toHaveLength(3)
    const opReturn = tx.outs[2]
    expect(opReturn.value).toBe(0)
    expect(opReturn.script[0]).toBe(0x6a) // OP_RETURN
    expect(opReturn.script.slice(2).toString('utf8'))
      .toBe('=:e:0xabc:1234:commission/SDK:444/5')
  })

  it('decodes via Transaction.fromHex with the OP_RETURN intact', () => {
    const memoBytes = _normalizeMemo('hello world')
    const tx = buildPsbtLikeWalletAccountBtc({
      recipient,
      recipientValue: 100_000,
      changeValue: 99_000,
      memoBytes
    })
    const decoded = Transaction.fromHex(tx.toHex())
    expect(decoded.outs).toHaveLength(3)
    expect(decoded.outs[2].value).toBe(0)
    expect(decoded.outs[2].script[0]).toBe(0x6a)
    expect(decoded.outs[2].script.slice(2).toString('utf8')).toBe('hello world')
  })

  it('omits OP_RETURN when changeValue is 0 and no memo (single-output case)', () => {
    const tx = buildPsbtLikeWalletAccountBtc({
      recipient,
      recipientValue: 199_000,
      changeValue: 0,
      memoBytes: null
    })
    expect(tx.outs).toHaveLength(1)
  })
})
