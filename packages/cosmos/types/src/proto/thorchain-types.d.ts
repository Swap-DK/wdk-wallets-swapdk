/**
 * Parse a SwapKit-style asset string (e.g. "THOR.RUNE", "MAYA.CACAO",
 * "BTC.BTC", "ETH.USDC-0xA0b86991…") into an {@link Asset} object suitable
 * for inclusion in a `Coin`. Returns the parsed Asset, or throws if the
 * string can't be recognised as a valid asset reference.
 *
 * For our use case the asset is almost always THOR.RUNE or MAYA.CACAO
 * (because that's what the user is depositing for a swap), but the parser
 * handles any chain/symbol pair so it's reusable for future flows.
 *
 * @param {string} input - SwapKit asset string.
 * @returns {ReturnType<typeof Asset.fromPartial>}
 */
export function parseAssetString(input: string): ReturnType<typeof Asset.fromPartial>;
export const TYPE_URL_MSG_DEPOSIT: "/types.MsgDeposit";
export namespace Asset {
    function encode(message: any, writer?: Writer | import("protobufjs").BufferWriter): Writer | import("protobufjs").BufferWriter;
    function decode(input: any, length: any): {
        chain: string;
        symbol: string;
        ticker: string;
        synth: boolean;
        trade: boolean;
        secured: boolean;
    };
    function fromPartial(o: any): {
        chain: string;
        symbol: string;
        ticker: string;
        synth: boolean;
        trade: boolean;
        secured: boolean;
    };
}
export namespace Coin {
    function encode(message: any, writer?: Writer | import("protobufjs").BufferWriter): Writer | import("protobufjs").BufferWriter;
    function decode(input: any, length: any): {
        asset: undefined;
        amount: string;
        decimals: bigint;
    };
    function fromPartial(o: any): {
        asset: undefined;
        amount: string;
        decimals: bigint;
    };
}
export namespace MsgDeposit {
    function encode(message: any, writer?: Writer | import("protobufjs").BufferWriter): Writer | import("protobufjs").BufferWriter;
    function decode(input: any, length: any): {
        coins: never[];
        memo: string;
        signer: Uint8Array<ArrayBuffer>;
    };
    function fromPartial(o: any): {
        coins: never[];
        memo: string;
        signer: Uint8Array<ArrayBuffer>;
    };
}
import { Writer } from 'protobufjs/minimal.js';
