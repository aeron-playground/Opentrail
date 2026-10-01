import { describe, expect, test } from "bun:test";
import {
  AccountRole,
  type Blockhash,
  generateKeyPairSigner,
  getBase58Decoder,
  getBase64Decoder,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
  type SignatureBytes,
  signBytes,
  signTransaction,
} from "@solana/kit";
import { TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { buildSwapTransaction } from "./transaction";
import { checkSignedTransaction } from "./verify";

// A throwaway key made for these tests; it holds nothing and never touches a network.
const person = await generateKeyPairSigner();
const stranger = await generateKeyPairSigner();
const lifetime = {
  blockhash: (await generateKeyPairSigner()).address as string as Blockhash,
  lastValidBlockHeight: 1n,
};
const swap = {
  programAddress: TOKEN_PROGRAM_ADDRESS,
  accounts: [{ address: stranger.address, role: AccountRole.READONLY }],
  data: new Uint8Array([9]),
};

const built = await buildSwapTransaction({
  side: "buy",
  fee: null,
  parts: { setup: [], swap, cleanup: [] },
  computeUnitLimit: 50_000,
  priorityMicroLamports: 0n,
  payer: person.address,
  lifetime,
  lookupTables: {},
});
if (!built.fits) throw new Error("the test transaction should fit");
const unsigned = getTransactionDecoder().decode(getBase64Encoder().encode(built.base64));
const signed = await signTransaction([person.keyPair], unsigned);
const signedBase64 = getBase64EncodedWireTransaction(signed);
const check = (base64: string) =>
  checkSignedTransaction({ base64, messageHash: built.messageHash, signer: person.address });

// The wire format: a 1-byte signature count, the 64-byte signature, then the message.
const MESSAGE_START = 1 + 64;
const withByte = (base64: string, index: number, change: (byte: number) => number) => {
  const bytes = new Uint8Array(getBase64Encoder().encode(base64));
  bytes[index] = change(bytes[index] ?? 0);
  return getBase64Decoder().decode(bytes);
};

describe("checkSignedTransaction", () => {
  test("accepts the transaction it built, signed by the person, and gives its signature", async () => {
    const result = await check(signedBase64);
    expect(result).toEqual({
      ok: true,
      signature: getBase58Decoder().decode(signed.signatures[person.address] as SignatureBytes),
    });
  });

  test("says it was changed when one byte of the message differs", async () => {
    expect(await check(withByte(signedBase64, MESSAGE_START + 40, (b) => b ^ 1))).toEqual({
      ok: false,
      reason: "changed",
    });
  });

  test("says it isn't signed when the signature is missing", async () => {
    expect(await check(built.base64)).toEqual({ ok: false, reason: "unsigned" });
  });

  test("refuses a damaged signature", async () => {
    expect(await check(withByte(signedBase64, 1, (b) => b ^ 1))).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  test("refuses a signature made with another key", async () => {
    const forged = {
      ...signed,
      signatures: {
        [person.address]: await signBytes(stranger.keyPair.privateKey, signed.messageBytes),
      },
    };
    expect(await check(getBase64EncodedWireTransaction(forged as typeof signed))).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  test("says it was changed when the message asks for a second signer", async () => {
    const twoSigners = await buildSwapTransaction({
      side: "buy",
      fee: null,
      parts: {
        setup: [],
        swap: {
          ...swap,
          accounts: [{ address: stranger.address, role: AccountRole.READONLY_SIGNER }],
        },
        cleanup: [],
      },
      computeUnitLimit: 50_000,
      priorityMicroLamports: 0n,
      payer: person.address,
      lifetime,
      lookupTables: {},
    });
    if (!twoSigners.fits) throw new Error("the test transaction should fit");
    const both = await signTransaction(
      [person.keyPair, stranger.keyPair],
      getTransactionDecoder().decode(getBase64Encoder().encode(twoSigners.base64)),
    );
    expect(await check(getBase64EncodedWireTransaction(both))).toEqual({
      ok: false,
      reason: "changed",
    });
  });

  test("can't read a second signature slot added outside the message", async () => {
    const bytes = getBase64Encoder().encode(signedBase64);
    const extra = new Uint8Array([
      2,
      ...bytes.slice(1, MESSAGE_START),
      ...new Uint8Array(64),
      ...bytes.slice(MESSAGE_START),
    ]);
    expect(await check(getBase64Decoder().decode(extra))).toEqual({
      ok: false,
      reason: "unreadable",
    });
  });

  test.each([
    ["text that isn't base64", "not a transaction ~~"],
    ["nothing", ""],
    ["far more bytes than a transaction can hold", "A".repeat(4_000)],
  ])("can't read %s", async (_, base64) => {
    expect(await check(base64)).toEqual({ ok: false, reason: "unreadable" });
  });
});
