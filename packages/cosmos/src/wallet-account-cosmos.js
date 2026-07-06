'use strict'

// SwapDK fork note: this file is mostly the upstream
// @base58-io/wdk-wallet-cosmos@1.0.0-beta.2 verbatim. Modifications:
//   - import the THORChain/MAYAChain MsgDeposit Registry (below)
//   - import bech32 decode helper to derive raw signer bytes from the
//     account's address
//   - new public method `deposit(...)` near the bottom of the class,
//     which signs and broadcasts a `types.MsgDeposit` against the
//     connected RPC. The rest of the class is untouched.

import { Slip10, Slip10Curve, stringToPath } from '@cosmjs/crypto'
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing'
import { SigningStargateClient, StargateClient } from '@cosmjs/stargate'
import { fromBech32 } from '@cosmjs/encoding'
import * as bip39 from 'bip39'
import { resolveChainConfig } from './chain-config-resolver.js'
import {
  DEFAULT_GAS_PRICE_STEP,
  DEFAULT_TRANSFER_GAS_LIMIT,
  calculateFeeAmountFromGasPrice,
  extractGasPrice,
} from './gas-fee-utils.js'
import SecureBuffer from './memory-safe/secure-buffer.js'
import { withFallback } from './rpc-fallback.js'
import { createThorMayaRegistry } from './proto/registry.js'
import {
  TYPE_URL_MSG_DEPOSIT,
  parseAssetString,
  Coin,
} from './proto/thorchain-types.js'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */
/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').Transaction} Transaction */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */
/** @typedef {import('@tetherto/wdk-wallet').IWalletAccountReadOnly} IWalletAccountReadOnly */

/**
 * @typedef {Object} CosmosTransaction
 * @property {string} to - The recipient address.
 * @property {Array<{denom: string, amount: string}>} amount - The amount to send.
 * @property {string} [memo] - Optional transaction memo.
 */

/**
 * @typedef {Object} CosmosWalletConfig
 * @property {string} [chainName] - The chain name from chain-registry (e.g. 'juno', 'osmosis').
 * @property {string[]} [rpcEndpoints] - Array of RPC endpoint URLs for fallback.
 * @property {number} [retryCount] - Max retry rounds for RPC fallback (default: 3).
 * @property {number} [retryDelay] - Base delay in ms for exponential backoff (default: 150).
 * @property {string} [addressPrefix] - The Bech32 address prefix (overrides registry, default: 'cosmos').
 * @property {string} [nativeDenom] - The native token denomination (overrides registry, default: 'uatom').
 * @property {number} [coinType] - The BIP-44 coin type (overrides registry, default: 118).
 * @property {string} [gasPrice] - The gas price with denom (e.g. '0.025uatom').
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfer operations.
 * @property {Record<string, { sourceChannel: string }>} [ibcChannels] - Optional IBC channel map keyed by destination Bech32 prefix.
 */

/**
 * @typedef {import('./chain-config-resolver.js').ResolvedChainConfig} ResolvedChainConfig
 */

const BIP_44_COSMOS_DERIVATION_PATH_PREFIX = "m/44'"

// Default gas limit for simple token transfers
// In production, this should be estimated per-transaction via simulation
const DEFAULT_GAS_LIMIT = DEFAULT_TRANSFER_GAS_LIMIT.toString()

/** @implements {IWalletAccount} */
export default class WalletAccountCosmos {
  /**
   * Use WalletAccountCosmos.create() instead of constructor.
   *
   * @param {DirectSecp256k1Wallet} wallet - The initialized wallet.
   * @param {SecureBuffer} privateKey - The private key in secure buffer.
   * @param {Uint8Array} publicKey - The public key.
   * @param {string} address - The account address.
   * @param {string} path - The full derivation path.
   * @param {ResolvedChainConfig} resolvedConfig - The resolved configuration object.
   */
  constructor(wallet, privateKey, publicKey, address, path, resolvedConfig) {
    /**
     * The resolved wallet configuration.
     *
     * @protected
     * @type {ResolvedChainConfig}
     */
    this._config = resolvedConfig

    /**
     * The full derivation path.
     *
     * @protected
     * @type {string}
     */
    this._path = path

    /**
     * The address prefix for Bech32 encoding.
     *
     * @protected
     * @type {string}
     */
    this._prefix = resolvedConfig.addressPrefix

    /**
     * The wallet instance.
     *
     * @protected
     * @type {DirectSecp256k1Wallet}
     */
    this._wallet = wallet

    /**
     * The derived private key in a memory-safe buffer.
     *
     * @protected
     * @type {SecureBuffer}
     */
    this._privateKey = privateKey

    /**
     * The public key.
     *
     * @protected
     * @type {Uint8Array}
     */
    this._publicKey = publicKey

    /**
     * The account address.
     *
     * @protected
     * @type {string}
     */
    this._address = address

    /**
     * Whether this account has been disposed.
     *
     * @protected
     * @type {boolean}
     */
    this._disposed = false
  }

  /**
   * Creates a new Cosmos wallet account.
   *
   * @param {string | Uint8Array} seed - The wallet's BIP-39 seed phrase or seed bytes.
   * @param {string} path - The BIP-44 derivation path (e.g. "0'/0/0").
   * @param {CosmosWalletConfig} [config] - The configuration object.
   * @returns {Promise<WalletAccountCosmos>} The wallet account instance.
   */
  static async create(seed, path, config = {}) {
    // Resolve chain configuration from registry or custom config
    const resolvedConfig = resolveChainConfig(config)

    if (typeof seed === 'string') {
      if (!bip39.validateMnemonic(seed)) {
        throw new Error('The seed phrase is invalid.')
      }
      seed = bip39.mnemonicToSeedSync(seed)
    }

    // Build full derivation path with resolved coinType
    const fullPath = `${BIP_44_COSMOS_DERIVATION_PATH_PREFIX}/${resolvedConfig.coinType}'/${path}`

    const derivationPath = stringToPath(fullPath)
    const { privkey } = Slip10.derivePath(
      Slip10Curve.Secp256k1,
      seed,
      derivationPath
    )

    const privateKey = new SecureBuffer(privkey)
    const wallet = await DirectSecp256k1Wallet.fromKey(
      privkey,
      resolvedConfig.addressPrefix
    )
    const [account] = await wallet.getAccounts()

    return new WalletAccountCosmos(
      wallet,
      privateKey,
      account.pubkey,
      account.address,
      fullPath,
      resolvedConfig
    )
  }

  /**
   * Throws an error if this account has been disposed.
   *
   * @protected
   * @throws {Error} If the account has been disposed.
   */
  _assertNotDisposed() {
    if (this._disposed) {
      throw new Error('Cannot use disposed wallet account')
    }
  }

  /**
   * Returns the account's address.
   *
   * @returns {Promise<string>} The address.
   */
  async getAddress() {
    this._assertNotDisposed()
    return this._address
  }

  /**
   * Returns the account's balance.
   *
   * @param {string} [denom] - The denomination to check (defaults to chain's native denom).
   * @returns {Promise<bigint>} The balance in base units.
   */
  async getBalance(denom) {
    const denomination = denom || this._config.nativeDenom
    this._assertNotDisposed()

    if (!this._config.rpcEndpoints || this._config.rpcEndpoints.length === 0) {
      throw new Error('The wallet must be configured with an RPC endpoint.')
    }

    const address = await this.getAddress()

    const balance = await withFallback(
      this._config.rpcEndpoints,
      async endpoint => {
        const client = await StargateClient.connect(endpoint)
        return client.getBalance(address, denomination)
      },
      {
        retryCount: this._config.retryCount,
        retryDelay: this._config.retryDelay,
      }
    )

    return BigInt(balance.amount)
  }

  /**
   * Parses the gas price from config into denom and amount.
   *
   * @protected
   * @returns {{gasDenom: string, gasAmount: string}} The parsed gas price.
   */
  _parseGasPrice() {
    const gasPriceStep = this._config.gasPriceStep
    if (
      gasPriceStep &&
      Number.isFinite(gasPriceStep.average) &&
      gasPriceStep.average > 0
    ) {
      const gasAmount = calculateFeeAmountFromGasPrice(
        gasPriceStep.average,
        DEFAULT_TRANSFER_GAS_LIMIT
      )
      if (gasAmount) {
        return {
          gasDenom: gasPriceStep.denom,
          gasAmount: gasAmount.toString(),
        }
      }
    }

    const extractedGasPrice = extractGasPrice(this._config.gasPrice)
    if (extractedGasPrice) {
      const gasAmount = calculateFeeAmountFromGasPrice(
        extractedGasPrice.gasPriceAmount,
        DEFAULT_TRANSFER_GAS_LIMIT
      )
      if (gasAmount) {
        return {
          gasDenom: extractedGasPrice.gasPriceDenomination,
          gasAmount: gasAmount.toString(),
        }
      }
    }

    const defaultGasAmount = calculateFeeAmountFromGasPrice(
      DEFAULT_GAS_PRICE_STEP.average,
      DEFAULT_TRANSFER_GAS_LIMIT
    )

    return {
      gasDenom: this._config.nativeDenom,
      gasAmount: defaultGasAmount ? defaultGasAmount.toString() : '0',
    }
  }

  /**
   * Extracts Bech32 prefix from an address.
   *
   * @param {string} address - The Bech32 address.
   * @returns {string} The Bech32 prefix.
   */
  _getBech32Prefix(address) {
    const separatorIndex = address.indexOf('1')
    if (separatorIndex <= 0) {
      throw new Error('Invalid Bech32 address format.')
    }
    return address.slice(0, separatorIndex)
  }

  /**
   * Returns IBC channel config for a destination Bech32 prefix.
   *
   * @param {string} prefix - The destination Bech32 prefix.
   * @returns {{ sourceChannel: string }} The IBC channel configuration.
   */
  _getIbcChannelConfigForPrefix(prefix) {
    const ibcChannels = this._config.ibcChannels
    if (!ibcChannels) {
      throw new Error(
        'IBC channels configuration is not available for this wallet.'
      )
    }

    const channelConfig = ibcChannels[prefix]
    if (!channelConfig || !channelConfig.sourceChannel) {
      throw new Error(
        `IBC channel configuration not found for destination prefix: ${prefix}`
      )
    }

    return channelConfig
  }

  /**
   * Returns the account balance for a specific token.
   *
   * @param {string} denom - The token denomination.
   * @returns {Promise<bigint>} The token balance in base units.
   */
  async getTokenBalance(denom) {
    return await this.getBalance(denom)
  }

  /**
   * Returns the account balances for a list of tokens.
   *
   * @param {string[]} denoms - The token denominations.
   * @returns {Promise<Record<string, bigint>>} The token balances (in base unit).
   */
  async getTokenBalances(denoms) {
    this._assertNotDisposed()

    if (!this._config.rpcEndpoints || this._config.rpcEndpoints.length === 0) {
      throw new Error('The wallet must be configured with an RPC endpoint.')
    }

    const address = await this.getAddress()

    const balances = await withFallback(
      this._config.rpcEndpoints,
      async endpoint => {
        const client = await StargateClient.connect(endpoint)
        return client.getAllBalances(address)
      },
      {
        retryCount: this._config.retryCount,
        retryDelay: this._config.retryDelay,
      }
    )

    /** @type {Record<string, bigint>} */
    const result = {}
    for (const balance of balances) {
      if (denoms.includes(balance.denom)) {
        result[balance.denom] = BigInt(balance.amount)
      }
    }
    return result
  }

  /**
   * Transfers tokens to another address.
   *
   * @param {TransferOptions & { memo?: string }} options - The transfer's
   *   options. `memo` is a SwapDK extension to the standard WDK
   *   `TransferOptions`: when set, it overrides the default tx memo
   *   (`'Transfer via WDK'` for same-prefix transfers, `'Transfer via
   *   WDK (IBC)'` for IBC). Required for THORChain/MAYAChain swap
   *   deposits routed via `MsgSend` to an inbound vault, where the
   *   memo encodes the swap intent and an empty memo would lose funds.
   * @returns {Promise<TransferResult>} The transfer's result.
   */
  async transfer(options) {
    this._assertNotDisposed()

    if (!this._config.rpcEndpoints || this._config.rpcEndpoints.length === 0) {
      throw new Error(
        'The wallet must be configured with an RPC endpoint to transfer tokens.'
      )
    }

    const { token, recipient, amount, memo } = options
    const address = await this.getAddress()

    const recipientPrefix = this._getBech32Prefix(recipient)
    const isSamePrefix = recipientPrefix === this._config.addressPrefix

    const sendAmount = {
      denom: token,
      amount: amount.toString(),
    }

    const { gasDenom, gasAmount } = this._parseGasPrice()
    const fee = {
      amount: [{ denom: gasDenom, amount: gasAmount }],
      gas: DEFAULT_GAS_LIMIT,
    }

    // Enforce transferMaxFee BEFORE broadcasting. The fee is fully
    // determined by _parseGasPrice() above (deterministic from chain
    // config), so we can reject upfront. Previously this check ran
    // after signAndBroadcast — the tx was already in the mempool when
    // the throw fired, making the cap unenforceable.
    const plannedFee = BigInt(gasAmount)
    if (
      this._config.transferMaxFee !== undefined &&
      plannedFee >= this._config.transferMaxFee
    ) {
      throw new Error('Exceeded maximum fee cost for transfer operation.')
    }

    const wallet = this._wallet
    const channelConfig = isSamePrefix
      ? null
      : this._getIbcChannelConfigForPrefix(recipientPrefix)

    const result = await withFallback(
      this._config.rpcEndpoints,
      async endpoint => {
        const client = await SigningStargateClient.connectWithSigner(
          endpoint,
          wallet
        )

        if (isSamePrefix) {
          return client.sendTokens(
            address,
            recipient,
            [sendAmount],
            fee,
            memo ?? 'Transfer via WDK'
          )
        }

        const timeoutSeconds = 600
        const timeoutTimestampNanoseconds = String(
          (Date.now() + timeoutSeconds * 1000) * 1_000_000
        )

        const ibcMemo = memo ?? 'Transfer via WDK (IBC)'
        const msgTransfer = {
          typeUrl: '/ibc.applications.transfer.v1.MsgTransfer',
          value: {
            sourcePort: 'transfer',
            sourceChannel: /** @type {{ sourceChannel: string }} */ (
              channelConfig
            ).sourceChannel,
            token: sendAmount,
            sender: address,
            receiver: recipient,
            timeoutHeight: undefined,
            timeoutTimestamp: timeoutTimestampNanoseconds,
            memo: ibcMemo,
          },
        }

        const broadcastResult = await client.signAndBroadcast(
          address,
          [msgTransfer],
          fee,
          ibcMemo
        )

        return {
          transactionHash: broadcastResult.transactionHash,
        }
      },
      {
        retryCount: this._config.retryCount,
        retryDelay: this._config.retryDelay,
      }
    )

    // fee was pre-validated against transferMaxFee above; re-derive
    // the bigint here just for the result shape.
    const totalFee = BigInt(fee.amount[0].amount)

    return {
      hash: result.transactionHash,
      fee: totalFee,
    }
  }

  /**
   * Quotes the costs of a transfer operation.
   *
   * @param {TransferOptions} options - The transfer's options.
   * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
   */
  async quoteTransfer(options) {
    this._assertNotDisposed()

    if (!this._config.rpcEndpoints || this._config.rpcEndpoints.length === 0) {
      throw new Error(
        'The wallet must be configured with an RPC endpoint to transfer tokens.'
      )
    }

    const { recipient } = options
    const recipientPrefix = this._getBech32Prefix(recipient)
    const isSamePrefix = recipientPrefix === this._config.addressPrefix

    if (!isSamePrefix) {
      this._getIbcChannelConfigForPrefix(recipientPrefix)
    }

    const { gasAmount } = this._parseGasPrice()
    const estimatedFee = BigInt(gasAmount)

    if (
      this._config.transferMaxFee !== undefined &&
      estimatedFee >= this._config.transferMaxFee
    ) {
      throw new Error('Exceeded maximum fee cost for transfer operation.')
    }

    return {
      fee: estimatedFee,
    }
  }

  /**
   * The account's key pair.
   *
   * @type {KeyPair}
   */
  get keyPair() {
    this._assertNotDisposed()

    return {
      privateKey: this._privateKey.buffer,
      publicKey: this._publicKey,
    }
  }

  /**
   * Signs a message.
   *
   * @param {string} _message - The message to sign.
   * @returns {Promise<string>} The message's signature.
   * @throws {Error} Not implemented for Cosmos.
   */
  async sign(_message) {
    throw new Error('Message signing is not implemented for Cosmos.')
  }

  /**
   * Verifies a message's signature.
   *
   * @param {string} _message - The original message.
   * @param {string} _signature - The signature to verify.
   * @returns {Promise<boolean>} True if the signature is valid.
   * @throws {Error} Not implemented for Cosmos.
   */
  async verify(_message, _signature) {
    throw new Error('Message verification is not implemented for Cosmos.')
  }

  /**
   * Sends a transaction.
   *
   * @param {Transaction} transaction - The transaction to send (use CosmosTransaction format).
   * @returns {Promise<TransactionResult>} The transaction's result.
   */
  async sendTransaction(transaction) {
    const cosmosTransaction = this._toCosmosTransaction(transaction)
    this._assertNotDisposed()

    if (!this._config.rpcEndpoints || this._config.rpcEndpoints.length === 0) {
      throw new Error(
        'The wallet must be configured with an RPC endpoint to send transactions.'
      )
    }

    const { gasDenom, gasAmount } = this._parseGasPrice()
    const fee = {
      amount: [{ denom: gasDenom, amount: gasAmount }],
      gas: DEFAULT_GAS_LIMIT,
    }

    const wallet = this._wallet
    const senderAddress = this._address

    const result = await withFallback(
      this._config.rpcEndpoints,
      async endpoint => {
        const client = await SigningStargateClient.connectWithSigner(
          endpoint,
          wallet
        )

        return client.sendTokens(
          senderAddress,
          cosmosTransaction.to,
          cosmosTransaction.amount,
          fee,
          cosmosTransaction.memo
        )
      },
      {
        retryCount: this._config.retryCount,
        retryDelay: this._config.retryDelay,
      }
    )

    return {
      hash: result.transactionHash,
      fee: BigInt(fee.amount[0].amount),
    }
  }

  /**
   * SwapDK addition (not in upstream `@base58-io/wdk-wallet-cosmos`).
   *
   * Sign and broadcast a THORChain / MAYAChain `MsgDeposit` against the
   * connected RPC. This is the canonical way to initiate a swap from
   * native RUNE / CACAO; the upstream's `sendTransaction` only emits
   * bank-module `MsgSend`, which won't trigger a THORChain swap even
   * with a memo attached.
   *
   * @param {Object} options
   * @param {string} options.asset - SwapKit-style asset string of the
   *   coin being deposited, e.g. `"THOR.RUNE"` or `"MAYA.CACAO"`.
   * @param {bigint | string} options.amount - Amount in the asset's
   *   1e8 base units (e.g. `100000000n` for 1 RUNE).
   * @param {string} options.memo - THORChain swap memo, e.g.
   *   `"=:BTC.BTC:bc1q…:0/1/0"`.
   * @param {Object} [overrides] - Optional fee overrides.
   * @param {string} [overrides.gas] - Custom gas limit (default:
   *   `DEFAULT_TRANSFER_GAS_LIMIT`). Deposit txs sometimes need more
   *   gas than a plain MsgSend; bump this if a tx fails with
   *   "out of gas".
   * @returns {Promise<TransactionResult>}
   */
  async deposit({ asset, amount, memo }, overrides = {}) {
    this._assertNotDisposed()

    if (!this._config.rpcEndpoints || this._config.rpcEndpoints.length === 0) {
      throw new Error(
        'The wallet must be configured with an RPC endpoint to send transactions.'
      )
    }
    if (!asset) throw new Error('deposit: asset is required.')
    if (amount === undefined || amount === null) {
      throw new Error('deposit: amount is required.')
    }
    if (typeof memo !== 'string' || memo.length === 0) {
      throw new Error('deposit: memo is required and must be a non-empty string.')
    }

    const senderAddress = this._address
    const { data: signerBytes } = fromBech32(senderAddress)

    const coin = Coin.fromPartial({
      asset: parseAssetString(asset),
      amount: String(amount),
      decimals: BigInt(0), // THORChain accepts 0; the asset's native scale is implied
    })

    const msg = {
      typeUrl: TYPE_URL_MSG_DEPOSIT,
      value: {
        coins: [coin],
        memo,
        signer: signerBytes,
      },
    }

    const { gasDenom, gasAmount } = this._parseGasPrice()
    const fee = {
      amount: [{ denom: gasDenom, amount: gasAmount }],
      gas: String(overrides.gas ?? DEFAULT_TRANSFER_GAS_LIMIT),
    }

    // Enforce transferMaxFee BEFORE broadcasting (same reasoning as
    // transfer() above — the fee is deterministic from chain config so
    // the post-broadcast throw the original code did was unenforceable).
    const plannedFee = BigInt(gasAmount)
    if (
      this._config.transferMaxFee !== undefined &&
      plannedFee >= this._config.transferMaxFee
    ) {
      throw new Error('Exceeded maximum fee cost for deposit operation.')
    }

    const wallet = this._wallet
    const registry = createThorMayaRegistry()

    const result = await withFallback(
      this._config.rpcEndpoints,
      async endpoint => {
        const client = await SigningStargateClient.connectWithSigner(
          endpoint,
          wallet,
          { registry }
        )
        return client.signAndBroadcast(senderAddress, [msg], fee, memo)
      },
      {
        retryCount: this._config.retryCount,
        retryDelay: this._config.retryDelay,
      }
    )

    // fee was pre-validated against transferMaxFee above.
    const totalFee = BigInt(fee.amount[0].amount)

    return {
      hash: result.transactionHash,
      fee: totalFee,
    }
  }

  /**
   * Converts a generic transaction to a Cosmos transaction.
   *
   * @param {Transaction} transaction - The transaction to convert.
   * @returns {CosmosTransaction} The converted transaction.
   */
  _toCosmosTransaction(transaction) {
    const cosmosTransaction = {
      to: transaction.to,
      amount: [
        {
          denom: this._config.nativeDenom,
          amount: transaction.value.toString(),
        },
      ],
      memo: 'Transfer via WDK',
    }

    return cosmosTransaction
  }

  /**
   * Returns a read-only copy of the account.
   *
   * @returns {Promise<IWalletAccountReadOnly>} The read-only account.
   * @throws {Error} Not implemented for Cosmos.
   */
  async toReadOnlyAccount() {
    throw new Error('Read-only accounts are not implemented for Cosmos.')
  }

  /**
   * Quotes the cost of sending a transaction.
   *
   * @param {Transaction} _transaction - The transaction to quote (use CosmosTransaction format).
   * @returns {Promise<{fee: bigint}>} The estimated fee.
   */
  async quoteSendTransaction(_transaction) {
    this._assertNotDisposed()

    if (!this._config.rpcEndpoints || this._config.rpcEndpoints.length === 0) {
      throw new Error(
        'The wallet must be configured with an RPC endpoint to send transactions.'
      )
    }

    const { gasAmount } = this._parseGasPrice()
    const estimatedFee = BigInt(gasAmount)

    if (
      this._config.transferMaxFee !== undefined &&
      estimatedFee >= this._config.transferMaxFee
    ) {
      throw new Error('Exceeded maximum fee cost for transfer operation.')
    }

    return {
      fee: estimatedFee,
    }
  }

  /**
   * Returns the transaction receipt for a given transaction hash.
   *
   * @param {string} hash - The transaction hash.
   * @returns {Promise<object>} The transaction receipt.
   */
  async getTransactionReceipt(hash) {
    this._assertNotDisposed()

    if (!this._config.rpcEndpoints || this._config.rpcEndpoints.length === 0) {
      throw new Error(
        'The wallet must be configured with an RPC endpoint to get transaction receipts.'
      )
    }

    const transaction = await withFallback(
      this._config.rpcEndpoints,
      async endpoint => {
        const client = await StargateClient.connect(endpoint)
        return client.getTx(hash)
      },
      {
        retryCount: this._config.retryCount,
        retryDelay: this._config.retryDelay,
      }
    )

    if (!transaction) {
      throw new Error(`Transaction not found: ${hash}`)
    }

    return transaction
  }

  /**
   * The derivation path's index of this account.
   *
   * @type {number}
   */
  get index() {
    const pathParts = this._path.split('/')
    return parseInt(pathParts[pathParts.length - 1], 10)
  }

  /**
   * The derivation path of this account (see BIP-44).
   *
   * @type {string}
   */
  get path() {
    return this._path
  }

  /**
   * Whether this account has been disposed.
   *
   * @type {boolean}
   */
  get isDisposed() {
    return this._disposed
  }

  /**
   * Disposes the wallet account, securely erasing all sensitive data from memory.
   * After calling this method, the account can no longer be used.
   */
  dispose() {
    if (this._disposed) {
      return
    }

    if (this._privateKey) {
      this._privateKey.dispose()
    }

    this._disposed = true
  }
}
