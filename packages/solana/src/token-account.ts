import { type Address, address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import { TOKEN_PROGRAMS, type TokenProgram } from "./mints";

/**
 * The standard account that holds `mint` for `owner`: where wallets send that token by default.
 * The token program is part of the address, so a Token-2022 mint needs its own program here.
 */
export async function associatedTokenAddress({
  owner,
  mint,
  tokenProgram,
}: {
  owner: string;
  mint: string;
  tokenProgram: TokenProgram;
}): Promise<Address> {
  const [account] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: address(mint),
    tokenProgram: address(TOKEN_PROGRAMS[tokenProgram]),
  });
  return account;
}
