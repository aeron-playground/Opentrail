import {
  type Address,
  getBase64Encoder,
  getPublicKeyFromAddress,
  getSignatureFromTransaction,
  getTransactionDecoder,
  type Transaction,
  verifySignature,
} from "@solana/kit";
import { MAX_TRANSACTION_BYTES, messageHash } from "./transaction";

export type SignedTransactionCheck =
  | { ok: true; signature: string }
  | { ok: false; reason: "unreadable" | "changed" | "unsigned" | "bad_signature" };

// Base64 of the biggest transaction Solana accepts: anything longer is refused before decoding.
const MAX_BASE64_LENGTH = Math.ceil(MAX_TRANSACTION_BYTES / 3) * 4;

/**
 * Checks a transaction that comes back signed (ADR 0006): it's the exact message the API built
 * (its hash matches), and the person's signature on it is valid. Each check runs only after the
 * cheaper one before it passed. On success, gives the transaction's signature, its id on Solana.
 */
export async function checkSignedTransaction({
  base64,
  messageHash: expected,
  signer,
}: {
  base64: string;
  messageHash: string;
  signer: Address;
}): Promise<SignedTransactionCheck> {
  if (base64.length === 0 || base64.length > MAX_BASE64_LENGTH) {
    return { ok: false, reason: "unreadable" };
  }
  let transaction: Transaction;
  try {
    transaction = getTransactionDecoder().decode(getBase64Encoder().encode(base64));
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if ((await messageHash(transaction.messageBytes)) !== expected) {
    return { ok: false, reason: "changed" };
  }
  // An unsigned slot arrives as null, or as 64 zero bytes.
  const signature = transaction.signatures[signer];
  if (!signature || signature.every((byte) => byte === 0)) {
    return { ok: false, reason: "unsigned" };
  }
  const valid = await verifySignature(
    await getPublicKeyFromAddress(signer),
    signature,
    transaction.messageBytes,
  );
  if (!valid) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true, signature: getSignatureFromTransaction(transaction) };
}
