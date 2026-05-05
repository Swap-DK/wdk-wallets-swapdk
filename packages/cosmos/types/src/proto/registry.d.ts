/**
 * Build a Registry with the standard Cosmos message types plus
 * THORChain/MAYAChain `MsgDeposit`. SigningStargateClient uses this to
 * encode the message before signing and broadcasting.
 *
 * @returns {Registry}
 */
export function createThorMayaRegistry(): Registry;
import { Registry } from '@cosmjs/proto-signing';
