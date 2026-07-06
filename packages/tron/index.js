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

// SwapDK fork note: re-exports match upstream
// @tetherto/wdk-wallet-tron@1.0.0-beta.5. The fork adds optional
// `data` (raw calldata) + `feeLimit` to WalletAccountTron's
// sendTransaction / signTransaction — see src/wallet-account-tron.js
// for the modified code paths.

/** @typedef {import('tronweb').TransactionInfo} TronTransactionReceipt */

/** @typedef {import('@tetherto/wdk-wallet').FeeRates} FeeRates */

/** @typedef {import('@tetherto/wdk-wallet').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet').TransferOptions} TransferOptions */
/** @typedef {import('@tetherto/wdk-wallet').TransferResult} TransferResult */

/** @typedef {import('./src/wallet-account-read-only-tron.js').TronTransaction} TronTransaction */
/** @typedef {import('./src/wallet-account-read-only-tron.js').TronWalletConfig} TronWalletConfig */

export { default } from './src/wallet-manager-tron.js'

export { default as WalletAccountReadOnlyTron } from './src/wallet-account-read-only-tron.js'

export { default as WalletAccountTron } from './src/wallet-account-tron.js'
