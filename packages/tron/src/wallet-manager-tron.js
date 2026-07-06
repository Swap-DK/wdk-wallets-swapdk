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

import WalletManager from '@tetherto/wdk-wallet'

import { TronWeb } from 'tronweb'

import { sodium_memzero } from 'sodium-universal'

import WalletAccountTron from './wallet-account-tron.js'

/** @typedef {import("@tetherto/wdk-wallet").FeeRates} FeeRates */

/** @typedef {import('./wallet-account-tron.js').TronWalletConfig} TronWalletConfig */

export default class WalletManagerTron extends WalletManager {
  /**
   * Multiplier for normal fee rate calculations (in %).
   *
   * @protected
   * @type {bigint}
   */
  static _FEE_RATE_NORMAL_MULTIPLIER = 110n

  /**
   * Multiplier for fast fee rate calculations (in %).
   *
   * @protected
   * @type {bigint}
   */
  static _FEE_RATE_FAST_MULTIPLIER = 200n

  /**
   * Creates a new wallet manager for the tron blockchain.
   *
   * @param {string | Uint8Array} seed - The wallet's BIP-39 seed phrase.
   * @param {TronWalletConfig} [config] - The configuration object.
   */
  constructor (seed, config = {}) {
    super(seed, config)

    /**
     * The tron wallet configuration.
     *
     * @protected
     * @type {TronWalletConfig}
     */
    this._config = config

    const { provider } = config

    if (provider) {
      /**
       * The tron web client.
       *
       * @protected
       * @type {TronWeb | undefined}
       */
      this._tronWeb = typeof provider === 'string'
        ? new TronWeb({ fullHost: provider })
        : provider
    }

    /**
     * Whether dispose() has been called. Makes manager-dispose
     * idempotent (matches the BTC + Cosmos forks).
     *
     * @private
     * @type {boolean}
     */
    this._disposed = false
  }

  /**
   * Whether this manager has been disposed.
   *
   * @type {boolean}
   */
  get isDisposed () {
    return this._disposed
  }

  /**
   * Throws if this manager has been disposed. Called at the top of
   * every public method that derives or returns secret material so
   * post-dispose calls fail loudly instead of silently producing a
   * deterministic key derived from the now-zeroed seed buffer.
   *
   * @private
   */
  _assertNotDisposed () {
    if (this._disposed) {
      throw new Error('Cannot use disposed wallet manager')
    }
  }

  /**
   * Returns the wallet account at a specific index (see [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)).
   *
   * @example
   * // Returns the account with derivation path m/44'/195'/0'/0/1
   * const account = await wallet.getAccount(1);
   * @param {number} [index] - The index of the account to get (default: 0).
   * @returns {Promise<WalletAccountTron>} The account.
   */
  async getAccount (index = 0) {
    this._assertNotDisposed()
    return await this.getAccountByPath(`0'/0/${index}`)
  }

  /**
   * Returns the wallet account at a specific BIP-44 derivation path.
   *
   * @example
   * // Returns the account with derivation path m/44'/195'/0'/0/1
   * const account = await wallet.getAccountByPath("0'/0/1");
   * @param {string} path - The derivation path (e.g. "0'/0/0").
   * @returns {Promise<WalletAccountTron>} The account.
   */
  async getAccountByPath (path) {
    this._assertNotDisposed()
    if (!this._accounts[path]) {
      const account = new WalletAccountTron(this.seed, path, this._config)

      this._accounts[path] = account
    }

    return this._accounts[path]
  }

  /**
   * Returns the current fee rates.
   *
   * @returns {Promise<FeeRates>} The fee rates (in suns).
   */
  async getFeeRates () {
    this._assertNotDisposed()
    if (!this._tronWeb) {
      throw new Error('The wallet must be connected to tron web to get fee rates.')
    }

    const chainParameters = await this._tronWeb.trx.getChainParameters()
    const getTransactionFee = chainParameters.find(({ key }) => key === 'getTransactionFee')
    const fee = BigInt(getTransactionFee.value)

    return {
      normal: fee * WalletManagerTron._FEE_RATE_NORMAL_MULTIPLIER / 100n,
      fast: fee * WalletManagerTron._FEE_RATE_FAST_MULTIPLIER / 100n
    }
  }

  /**
   * Disposes all accounts and zeroes the BIP-39-derived seed buffer.
   *
   * Does NOT call super.dispose() because the base WalletManager's
   * iterator reads `account.keyPair.privateKey` to decide whether to
   * dispose each account — but the per-account `_assertNotDisposed()`
   * guard now causes keyPair to throw on already-disposed accounts.
   * We iterate ourselves and call `account.dispose()` directly; per-
   * account dispose is idempotent so accounts the caller already
   * disposed get a no-op second call.
   *
   * Zeroes `this._seed` (64 bytes from `mnemonicToSeedSync`) — the
   * base class doesn't, leaving key material in V8 heap dumps /
   * swap files / coredumps long after dispose() returned.
   */
  dispose () {
    if (this._disposed) {
      return
    }

    for (const account of Object.values(this._accounts)) {
      if (account && typeof account.dispose === 'function') {
        account.dispose()
      }
    }
    this._accounts = {}

    if (this._seed instanceof Uint8Array) {
      sodium_memzero(this._seed)
    }

    this._disposed = true
  }
}
