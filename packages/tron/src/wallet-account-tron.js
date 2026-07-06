// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict'

// SwapDK fork note: this file is mostly the upstream
// @tetherto/wdk-wallet-tron@1.0.0-beta.5 verbatim. Modifications:
//   - signTransaction / sendTransaction accept two optional fields:
//     `data` (hex calldata, including 4-byte selector) and `feeLimit`
//     (SUN cap on energy)
//   - when `data` is supplied, the wallet emits a TriggerSmartContract
//     transaction carrying the calldata verbatim, via tronweb's
//     `input` option on `transactionBuilder.triggerSmartContract`
//     with an empty function selector. `value` becomes callValue
//     (sun) for native TRX deposits, or stays 0 for TRC-20 calls.
//   - when `data` is omitted, behaviour is unchanged — plain TRX
//     transfer via `sendTrx`.
// Everything else (key derivation, message signing, TRC-20 transfer,
// dispose) is upstream.

import { TronWeb } from 'tronweb'

// eslint-disable-next-line camelcase
import { keccak_256 } from '@noble/hashes/sha3'
import { secp256k1 } from '@noble/curves/secp256k1'
import { HDKey } from '@scure/bip32'
import * as bip39 from 'bip39'

// eslint-disable-next-line camelcase
import { sodium_memzero } from 'sodium-universal'

import WalletAccountReadOnlyTron from './wallet-account-read-only-tron.js'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */

/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */

/** @typedef {import('./wallet-account-read-only-tron.js').TronTransaction} TronTransaction */
/** @typedef {import('./wallet-account-read-only-tron.js').TronWalletConfig} TronWalletConfig */

/** @typedef {import('tronweb').Types.SignedTransaction} SignedTransaction */

const BIP_44_TRON_DERIVATION_PATH_PREFIX = "m/44'/195'"

function getTronAddress (publicKey) {
  const uncompressedPublicKey = secp256k1.Point.fromHex(publicKey)
    .toRawBytes(false)
    .slice(1)

  const publicKeyHash = keccak_256(uncompressedPublicKey)
  const addressBytes = publicKeyHash.slice(12)
  const addressHex = '41' + Buffer.from(addressBytes).toString('hex')

  const address = TronWeb.address.fromHex(addressHex)

  return address
}

/** @implements {IWalletAccount} */
export default class WalletAccountTron extends WalletAccountReadOnlyTron {
  /**
   * Creates a new tron wallet account.
   *
   * @param {string | Uint8Array} seed - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
   * @param {string} path - The BIP-44 derivation path (e.g. "0'/0/0").
   * @param {TronWalletConfig} [config] - The configuration object.
   */
  constructor (seed, path, config = { }) {
    if (typeof seed === 'string') {
      if (!bip39.validateMnemonic(seed)) {
        throw new Error('The seed phrase is invalid.')
      }

      seed = bip39.mnemonicToSeedSync(seed)
    }

    path = BIP_44_TRON_DERIVATION_PATH_PREFIX + '/' + path

    const account = HDKey.fromMasterSeed(seed).derive(path)

    const address = getTronAddress(account.publicKey)

    super(address, config)

    /**
     * The tron wallet account configuration.
     *
     * @protected
     * @type {TronWalletConfig}
     */
    this._config = config

    /** @private */
    this._path = path

    /**
     * The account's hd key.
     *
     * @protected
     * @type {HDKey}
     */
    this._account = account

    /**
     * Whether this account has been disposed. dispose() short-circuits
     * to a no-op when true; public methods short-circuit through
     * _assertNotDisposed().
     *
     * @private
     * @type {boolean}
     */
    this._disposed = false
  }

  /**
   * Throws if this account has been disposed. Called at the top of
   * every public method that touches the private key so post-dispose
   * calls fail loudly instead of hitting `sodium_memzero(undefined)`
   * or signing with garbage state.
   *
   * @private
   */
  _assertNotDisposed () {
    if (this._disposed) {
      throw new Error('Cannot use disposed wallet account')
    }
  }

  /**
   * The derivation path's index of this account.
   *
   * @type {number}
   */
  get index () {
    return +this._path.split('/').pop()
  }

  /**
   * The derivation path of this account (see [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)).
   *
   * @type {string}
   */
  get path () {
    return this._path
  }

  /**
   * The account's key pair.
   *
   * @type {KeyPair}
   */
  get keyPair () {
    this._assertNotDisposed()
    return {
      privateKey: this._account.privateKey,
      publicKey: this._account.publicKey
    }
  }

  /**
   * Signs a message.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The message's signature.
   */
  async sign (message) {
    this._assertNotDisposed()
    const messageBytes = Buffer.from(message, 'utf8')
    const prefix = Buffer.from(`\x19TRON Signed Message:\n${messageBytes.length}`, 'utf8')
    const messageWithPrefixBytes = Buffer.concat([prefix, messageBytes])
    const hash = keccak_256(messageWithPrefixBytes)

    const signature = secp256k1.sign(hash, this._account.privateKey)
    const signatureWithRecovery = new Uint8Array([...signature.toCompactRawBytes(), 27 + signature.recovery])
    const hex = Buffer.from(signatureWithRecovery).toString('hex')

    return '0x' + hex
  }

  /**
   * Signs a transaction.
   *
   * Two modes:
   *   - Plain TRX transfer (default): pass `{ to, value }`. Builds a
   *     `TransferContract` via tronweb's `sendTrx`.
   *   - Smart-contract call: pass `{ to, value, data, feeLimit }` where
   *     `data` is the full ABI-encoded calldata (selector + args). Builds
   *     a `TriggerSmartContract` with the raw `data` field set verbatim,
   *     via `transactionBuilder.triggerSmartContract` with an empty
   *     function selector and the `input` option. `value` becomes
   *     `callValue` (sun); `feeLimit` is the per-tx energy cap.
   *
   * @param {TronTransaction} tx - The transaction to sign.
   * @returns {Promise<SignedTransaction>} The signed transaction.
   */
  async signTransaction ({ to, value, data, feeLimit, memo }) {
    this._assertNotDisposed()
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to sign transactions.')
    }

    const transaction = await this._buildTronTransaction({ to, value, data, feeLimit, memo })
    return await this._signTransaction(transaction)
  }

  /**
   * Sends a transaction.
   *
   * Same dispatch as `signTransaction` — plain TRX when `data` is
   * omitted, smart-contract call when supplied. See `signTransaction`
   * for the full options reference.
   *
   * The reported `fee` is the bandwidth cost for plain transfers (the
   * pre-broadcast amount upstream returns). For contract calls the
   * actual energy burn is wallet-side and known only after the tx
   * lands on-chain; we surface `feeLimit` (the per-tx cap committed
   * to the transaction) as the conservative upper bound, falling back
   * to bandwidth when `feeLimit` is unset.
   *
   * @param {TronTransaction} tx - The transaction.
   * @returns {Promise<TransactionResult>} The transaction's result.
   */
  async sendTransaction ({ to, value, data, feeLimit, memo }) {
    this._assertNotDisposed()
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to send transactions.')
    }

    const transaction = await this._buildTronTransaction({ to, value, data, feeLimit, memo })

    const bandwidth = await this._getBandwidthCost(transaction)
    const signedTransaction = await this._signTransaction(transaction)

    const { txid } = await this._tronWeb.trx.sendRawTransaction(signedTransaction)

    // For contract calls we don't know the actual energy burn before
    // confirmation. Reporting feeLimit gives the caller the worst
    // case the wallet committed to. For TransferContract paths
    // (plain TRX with or without memo) the bandwidth estimate is the
    // accurate pre-broadcast cost.
    const fee = data && feeLimit !== undefined
      ? BigInt(feeLimit)
      : BigInt(bandwidth)

    return { hash: txid, fee }
  }

  /**
   * @private
   * Build one of three TRON tx shapes from caller options:
   *   - `data` set:                       TriggerSmartContract (raw calldata)
   *   - `data` unset, `memo` set:         TransferContract w/ raw_data.data = memo
   *                                       (the THORChain inbound-vault inbound pattern
   *                                       — used when the router contract isn't
   *                                       deployed and routing has to ride on the
   *                                       tx memo, à la Bitcoin OP_RETURN)
   *   - neither set:                      plain TransferContract via sendTrx
   */
  async _buildTronTransaction ({ to, value, data, feeLimit, memo }) {
    const address = await this.getAddress()

    if (!data) {
      // Plain TransferContract — sendTrx returns the unsigned tx
      // envelope; if a memo is supplied we attach it via
      // addUpdateData, which mutates raw_data.data AND recomputes
      // txID (the memo is part of the hash preimage so this must
      // happen before _signTransaction).
      const transferTx = await this._tronWeb.transactionBuilder.sendTrx(to, value, address)
      if (typeof memo === 'string' && memo.length > 0) {
        return await this._tronWeb.transactionBuilder.addUpdateData(
          transferTx,
          memo,
          'utf8',
        )
      }
      return transferTx
    }

    // Smart-contract call with raw calldata.
    //
    // tronweb's `triggerSmartContract` accepts `options.input` as the
    // full hex calldata when the `functionSelector` argument is empty;
    // see `TransactionBuilder._getTriggerSmartContractArgs` (line ~825
    // in tronweb@6.2.0: `else if (options.input) args.data = options.input;`).
    const addressHex = this._tronWeb.address.toHex(address)
    const inputHex = String(data).replace(/^0x/, '')
    const callValue = value !== undefined ? Number(value) : 0
    const energyCap = feeLimit !== undefined
      ? Number(feeLimit)
      : this._tronWeb.feeLimit

    const { transaction } = await this._tronWeb.transactionBuilder.triggerSmartContract(
      to,
      '',
      {
        feeLimit: energyCap,
        callValue,
        input: inputHex
      },
      [],
      addressHex
    )

    return transaction
  }

  /**
   * Transfers a token to another address.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<TransferResult>} The transfer's result.
   */
  async transfer ({ token, recipient, amount }) {
    this._assertNotDisposed()
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to transfer tokens.')
    }

    const { fee } = await this.quoteTransfer({ token, recipient, amount })

    if (this._config.transferMaxFee !== undefined && fee >= this._config.transferMaxFee) {
      throw new Error('Exceeded maximum fee cost for transfer operations.')
    }

    const address = await this.getAddress()
    const addressHex = this._tronWeb.address.toHex(address)

    const options = {
      feeLimit: Number(fee),
      callValue: 0
    }

    const parameters = [
      { type: 'address', value: this._tronWeb.address.toHex(recipient) },
      { type: 'uint256', value: amount }
    ]

    const { transaction } = await this._tronWeb.transactionBuilder
      .triggerSmartContract(token, 'transfer(address,uint256)', options, parameters, addressHex)

    const signedTransaction = await this._signTransaction(transaction)

    const { txid } = await this._tronWeb.trx.sendRawTransaction(signedTransaction)

    return { hash: txid, fee }
  }

  /**
   * Returns a read-only copy of the account.
   *
   * @returns {Promise<WalletAccountReadOnlyTron>} The read-only account.
   */
  async toReadOnlyAccount () {
    if (!this._tronReadOnlyAccount) {
      const address = await this.getAddress()
      this._tronReadOnlyAccount = new WalletAccountReadOnlyTron(address, this._config)
    }

    return this._tronReadOnlyAccount
  }

  /**
   * Whether this account has been disposed.
   *
   * @type {boolean}
   */
  get isDisposed () {
    return this._disposed
  }

  /**
   * Disposes the wallet account, erasing the private key from memory.
   * Idempotent — a second call is a no-op. Before this guard the
   * second call would hit `sodium_memzero(undefined)` and crash.
   */
  dispose () {
    if (this._disposed) {
      return
    }

    // Zero the cached private-key bytes first.
    sodium_memzero(this._account.privKeyBytes)
    this._account.privKeyBytes = undefined
    this._account.privKey = undefined

    // @scure/bip32 HDKey.wipePrivateData() ONLY clears privKey /
    // privKeyBytes — verified against node_modules/@scure/bip32/lib/
    // index.js (the method body sets privKey=undefined and fills/
    // releases privKeyBytes, nothing else). chainCode is NOT touched,
    // even though knowledge of the chainCode + any descendant pubkey
    // lets an attacker walk the BIP-32 tree.
    //
    // So we call wipePrivateData() (for forward-compat in case upstream
    // adds more cleanup later) AND explicitly zero + clear chainCode
    // ourselves. The null assignment mirrors the HDKey constructor's
    // default; checks like `if (this.chainCode)` in @scure/bip32 then
    // fail loudly post-dispose.
    if (typeof this._account.wipePrivateData === 'function') {
      this._account.wipePrivateData()
    }
    if (this._account.chainCode instanceof Uint8Array) {
      sodium_memzero(this._account.chainCode)
    }
    this._account.chainCode = null

    this._disposed = true
  }

  /** @private */
  async _signTransaction (transaction) {
    const transactionBytes = Buffer.from(transaction.txID, 'hex')

    const signature = secp256k1.sign(transactionBytes, this._account.privateKey, { lowS: true })

    const r = signature.r.toString(16).padStart(64, '0')
    const s = signature.s.toString(16).padStart(64, '0')
    const v = signature.recovery.toString(16).padStart(2, '0')

    const serializedSignature = r + s + v

    return {
      ...transaction,
      signature: [serializedSignature]
    }
  }
}
