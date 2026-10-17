// A Solana for tests: balances live in memory, and nothing touches the network.
import {
  type Address,
  type AddressesByLookupTableAddress,
  type Blockhash,
  getBase64Encoder,
  getSignatureFromTransaction,
  getTransactionDecoder,
} from "@solana/kit";
import type {
  BlockhashLifetime,
  SignatureStatus,
  Simulation,
  SolanaReader,
  SolanaSender,
  TokenAccount,
} from "./types";

// 32 zero bytes: a blockhash in the right shape that no real block has.
const FAKE_BLOCKHASH = "11111111111111111111111111111111" as Blockhash;

export type FakeSolana = SolanaReader & {
  setSol(owner: string, lamports: bigint): void;
  setToken(owner: string, mint: string, raw: bigint): void;
  setTokenAccount(account: string, details: TokenAccount): void;
  setBlockhash(lifetime: BlockhashLifetime): void;
  setLookupTable(table: string, addresses: Address[]): void;
  /** How the next simulations answer; by default every run succeeds using 50,000 units. */
  simulateWith(answer: (base64: string) => Simulation): void;
  setPriorityFees(fees: bigint[]): void;
  /** Every transaction simulated so far, in order. */
  readonly simulations: readonly string[];
  /** How many reads reached "Solana". */
  readonly reads: number;
  /** Makes the next reads fail, as if the RPC server were down. */
  fail(error: Error | null): void;
};

export function createFakeSolana(): FakeSolana {
  const sol = new Map<string, bigint>();
  const tokens = new Map<string, bigint>();
  const tokenAccounts = new Map<string, TokenAccount>();
  const lookupTables = new Map<string, Address[]>();
  const simulations: string[] = [];
  let lifetime: BlockhashLifetime = { blockhash: FAKE_BLOCKHASH, lastValidBlockHeight: 1_000n };
  let simulation = (_base64: string): Simulation => ({
    error: null,
    unitsConsumed: 50_000n,
    logs: [],
  });
  let priorityFees: bigint[] = [];
  let reads = 0;
  let failure: Error | null = null;

  const read = <T>(value: T): Promise<T> => {
    reads += 1;
    return failure ? Promise.reject(failure) : Promise.resolve(value);
  };

  return {
    getSolBalance: (owner) => read(sol.get(owner) ?? 0n),
    getTokenBalance: (owner, mint) => read(tokens.get(`${owner}:${mint}`) ?? 0n),
    getTokenAccount: (account) => read(tokenAccounts.get(account) ?? null),
    getLatestBlockhash: () => read(lifetime),
    getLookupTables: async (tables) => {
      const found: AddressesByLookupTableAddress = {};
      for (const table of tables) {
        const addresses = lookupTables.get(table);
        if (!addresses) {
          throw new Error(`No lookup table at ${table}`);
        }
        found[table as Address] = addresses;
      }
      return read(found);
    },
    simulate: (base64) => {
      simulations.push(base64);
      return read(simulation(base64));
    },
    getRecentPriorityFees: () => read(priorityFees),
    setSol: (owner, lamports) => {
      sol.set(owner, lamports);
    },
    setToken: (owner, mint, raw) => {
      tokens.set(`${owner}:${mint}`, raw);
    },
    setTokenAccount: (account, details) => {
      tokenAccounts.set(account, details);
    },
    setBlockhash: (next) => {
      lifetime = next;
    },
    setLookupTable: (table, addresses) => {
      lookupTables.set(table, addresses);
    },
    simulateWith: (answer) => {
      simulation = answer;
    },
    setPriorityFees: (fees) => {
      priorityFees = fees;
    },
    simulations,
    get reads() {
      return reads;
    },
    fail: (error) => {
      failure = error;
    },
  };
}

export type FakeSolanaSender = SolanaSender & {
  /** Every transaction sent so far, in order, repeats included. */
  readonly sent: readonly string[];
  /** How status reads answer; by default no node has seen the transaction. */
  statusWith(answer: (signature: string) => SignatureStatus | null): void;
  setBlockHeight(height: bigint): void;
  /** Makes the next sends fail, as if the node refused them. */
  failSends(error: Error | null): void;
};

// A Solana that takes transactions for tests: nothing is sent anywhere.
export function createFakeSolanaSender(): FakeSolanaSender {
  const sent: string[] = [];
  let status = (_signature: string): SignatureStatus | null => null;
  let blockHeight = 0n;
  let sendError: Error | null = null;

  return {
    async sendTransaction(base64) {
      sent.push(base64);
      if (sendError) {
        throw sendError;
      }
      // The same id a real node answers with: the wallet's signature.
      return getSignatureFromTransaction(
        getTransactionDecoder().decode(getBase64Encoder().encode(base64)),
      );
    },
    getSignatureStatus: async (signature) => status(signature),
    getBlockHeight: async () => blockHeight,
    statusWith: (answer) => {
      status = answer;
    },
    setBlockHeight: (height) => {
      blockHeight = height;
    },
    failSends: (error) => {
      sendError = error;
    },
    sent,
  };
}
