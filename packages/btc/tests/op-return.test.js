// Unit tests for the OP_RETURN memo support added on top of the
// upstream @tetherto/wdk-wallet-btc PSBT builder.

import { describe, it, expect } from 'vitest'
import { payments } from 'bitcoinjs-lib'

import { _normalizeMemo, MAX_OP_RETURN_BYTES } from '../src/wallet-account-btc.js'
import { _opReturnVBytes } from '../src/wallet-account-read-only-btc.js'

const SAMPLE_MEMO = '=:e:0xe89E630553e63EA65b65F1cA2ea2C50cCA8f3E54:32324827:commission/SDK:444/5'

describe('_normalizeMemo', () => {
  it('returns null for undefined / null / empty', () => {
    expect(_normalizeMemo(undefined)).toBeNull()
    expect(_normalizeMemo(null)).toBeNull()
    expect(_normalizeMemo('')).toBeNull()
  })

  it('encodes strings as UTF-8 buffers', () => {
    const buf = _normalizeMemo('hello')
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.toString('utf8')).toBe('hello')
    expect(buf.length).toBe(5)
  })

  it('passes through Buffer inputs', () => {
    const input = Buffer.from([0x01, 0x02, 0x03])
    const out = _normalizeMemo(input)
    expect(out).not.toBeNull()
    expect(out.equals(input)).toBe(true)
  })

  it('converts Uint8Array inputs to Buffer', () => {
    const u8 = new Uint8Array([0xaa, 0xbb, 0xcc])
    const out = _normalizeMemo(u8)
    expect(Buffer.isBuffer(out)).toBe(true)
    expect(out.equals(Buffer.from(u8))).toBe(true)
  })

  it('accepts payloads up to the 80-byte standardness cap', () => {
    const ok = 'x'.repeat(MAX_OP_RETURN_BYTES)
    expect(() => _normalizeMemo(ok)).not.toThrow()
  })

  it('rejects payloads above the 80-byte standardness cap', () => {
    const tooBig = 'x'.repeat(MAX_OP_RETURN_BYTES + 1)
    expect(() => _normalizeMemo(tooBig)).toThrow(RangeError)
  })

  it('accepts the THORChain sample memo (~70 bytes)', () => {
    const buf = _normalizeMemo(SAMPLE_MEMO)
    expect(buf).not.toBeNull()
    expect(buf.length).toBeLessThanOrEqual(MAX_OP_RETURN_BYTES)
  })
})

describe('_opReturnVBytes', () => {
  it('is 0 when no payload', () => {
    expect(_opReturnVBytes(0)).toBe(0)
    expect(_opReturnVBytes(undefined)).toBe(0)
    expect(_opReturnVBytes(null)).toBe(0)
  })

  it('uses the small-push form for payloads ≤ 75 bytes', () => {
    // 8 (value) + 1 (script-len) + 1 (OP_RETURN) + 1 (push-n) + n
    expect(_opReturnVBytes(1)).toBe(12 + 1)
    expect(_opReturnVBytes(70)).toBe(12 + 70)
    expect(_opReturnVBytes(75)).toBe(12 + 75)
  })

  it('uses the OP_PUSHDATA1 form for 76 ≤ payload ≤ 80', () => {
    // 8 + 1 + 1 + 1 (OP_PUSHDATA1) + 1 (length byte) + n
    expect(_opReturnVBytes(76)).toBe(13 + 76)
    expect(_opReturnVBytes(80)).toBe(13 + 80)
  })
})

describe('OP_RETURN output script (via payments.embed)', () => {
  it('encodes the small-push form for short memos', () => {
    const memo = _normalizeMemo('hi')
    const script = payments.embed({ data: [memo] }).output
    expect(script).toBeInstanceOf(Buffer)
    expect(script[0]).toBe(0x6a) // OP_RETURN
    expect(script[1]).toBe(memo.length) // direct push opcode
    expect(script.slice(2).equals(memo)).toBe(true)
  })

  it('encodes OP_PUSHDATA1 for memos ≥ 76 bytes', () => {
    const memo = _normalizeMemo('y'.repeat(78))
    const script = payments.embed({ data: [memo] }).output
    expect(script[0]).toBe(0x6a) // OP_RETURN
    expect(script[1]).toBe(0x4c) // OP_PUSHDATA1
    expect(script[2]).toBe(memo.length)
    expect(script.slice(3).equals(memo)).toBe(true)
  })

  it('round-trips the THORChain sample memo bytes verbatim', () => {
    const memo = _normalizeMemo(SAMPLE_MEMO)
    const script = payments.embed({ data: [memo] }).output
    // Strip OP_RETURN + push opcode(s) and verify the trailing payload
    // matches the input memo bytes.
    const offset = memo.length < 76 ? 2 : 3
    expect(script.slice(offset).toString('utf8')).toBe(SAMPLE_MEMO)
  })
})
