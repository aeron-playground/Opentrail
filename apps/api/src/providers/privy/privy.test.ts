import { beforeAll, describe, expect, test } from "bun:test";
import { fakeSolanaAddress } from "./fake";
import { createPrivy, embeddedSolanaWallet, PRIVY_API_URL } from "./privy";

const APP_ID = "test-app-id";
const APP_SECRET = "test-app-secret";
const PRIVY_DID = "did:privy:test-person";

type Claims = Record<string, unknown>;

const base64url = (data: string | Uint8Array) => Buffer.from(data).toString("base64url");

// Privy signs access tokens with ES256. These tests sign their own with a local key pair, so the
// real verification code runs without the network.
async function createSigner() {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const spki = Buffer.from(await crypto.subtle.exportKey("spki", publicKey)).toString("base64");
  const pem = `-----BEGIN PUBLIC KEY-----\n${spki}\n-----END PUBLIC KEY-----`;

  async function sign(claims: Claims, header: Claims = { alg: "ES256", typ: "JWT" }) {
    const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
    const signature = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      privateKey,
      new TextEncoder().encode(input),
    );
    return `${input}.${base64url(new Uint8Array(signature))}`;
  }

  return { pem, sign };
}

function validClaims(): Claims {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: "privy.io",
    aud: APP_ID,
    sub: PRIVY_DID,
    sid: "test-session",
    iat: now,
    exp: now + 3600,
  };
}

describe("verifyAccessToken", () => {
  let signer: Awaited<ReturnType<typeof createSigner>>;
  let otherSigner: Awaited<ReturnType<typeof createSigner>>;

  beforeAll(async () => {
    signer = await createSigner();
    otherSigner = await createSigner();
  });

  const privy = () =>
    createPrivy({ appId: APP_ID, appSecret: APP_SECRET, verificationKey: signer.pem });

  test("gives the Privy user id for a valid token", async () => {
    const token = await signer.sign(validClaims());
    expect(await privy().verifyAccessToken(token)).toBe(PRIVY_DID);
  });

  const invalid: { name: string; token: () => Promise<string> }[] = [
    {
      name: "an expired token",
      token: () => signer.sign({ ...validClaims(), exp: Math.floor(Date.now() / 1000) - 60 }),
    },
    {
      name: "a token for another app",
      token: () => signer.sign({ ...validClaims(), aud: "other" }),
    },
    {
      name: "a token from another issuer",
      token: () => signer.sign({ ...validClaims(), iss: "evil.example" }),
    },
    { name: "a token signed with another key", token: () => otherSigner.sign(validClaims()) },
    {
      name: "an unsigned token",
      token: async () => {
        const signed = await signer.sign(validClaims(), { alg: "none", typ: "JWT" });
        return `${signed.split(".").slice(0, 2).join(".")}.`;
      },
    },
    {
      name: "a token without a session id",
      token: () => signer.sign({ ...validClaims(), sid: undefined }),
    },
    { name: "a token without a subject", token: () => signer.sign({ ...validClaims(), sub: "" }) },
    { name: "text that isn't a token", token: async () => "not-a-token" },
  ];

  for (const { name, token } of invalid) {
    test(`refuses ${name}`, async () => {
      expect(await privy().verifyAccessToken(await token())).toBeNull();
    });
  }
});

describe("getSolanaWallet", () => {
  test("reads the person from Privy's API with the app's credentials", async () => {
    const address = fakeSolanaAddress();
    const requests: Request[] = [];
    const privy = createPrivy({
      appId: APP_ID,
      appSecret: APP_SECRET,
      fetch: async (input, init) => {
        requests.push(new Request(String(input), init));
        return Response.json({ id: PRIVY_DID, linked_accounts: [solanaWallet({ address })] });
      },
    });

    expect(await privy.getSolanaWallet(PRIVY_DID)).toBe(address);
    expect(requests).toHaveLength(1);
    const [request] = requests;
    const url = new URL(String(request?.url));
    expect(url.origin).toBe(PRIVY_API_URL);
    expect(decodeURIComponent(url.pathname)).toBe(`/v1/users/${PRIVY_DID}`);
    expect(request?.method).toBe("GET");
    expect(request?.headers.get("privy-app-id")).toBe(APP_ID);
    expect(request?.headers.get("authorization")).toBe(`Basic ${btoa(`${APP_ID}:${APP_SECRET}`)}`);
  });

  test("passes Privy's errors on", async () => {
    const privy = createPrivy({
      appId: APP_ID,
      appSecret: APP_SECRET,
      fetch: async () => Response.json({ error: "User not found" }, { status: 404 }),
    });
    await expect(privy.getSolanaWallet(PRIVY_DID)).rejects.toThrow();
  });
});

function solanaWallet(overrides: Claims = {}): Claims {
  return {
    type: "wallet",
    chain_type: "solana",
    connector_type: "embedded",
    wallet_client: "privy",
    wallet_client_type: "privy",
    wallet_index: 0,
    address: fakeSolanaAddress(),
    ...overrides,
  };
}

describe("embeddedSolanaWallet", () => {
  const address = fakeSolanaAddress();
  const second = fakeSolanaAddress();
  const email = { type: "email", address: "person@example.com" };

  const cases: { name: string; accounts: Claims[]; expected: string | null }[] = [
    { name: "no linked accounts", accounts: [], expected: null },
    { name: "only an email", accounts: [email], expected: null },
    {
      name: "an external Solana wallet, such as Phantom",
      accounts: [solanaWallet({ connector_type: "solana_adapter", wallet_client_type: "phantom" })],
      expected: null,
    },
    {
      name: "an embedded Ethereum wallet",
      accounts: [solanaWallet({ chain_type: "ethereum", address: "0x0" })],
      expected: null,
    },
    {
      name: "an embedded Solana wallet",
      accounts: [email, solanaWallet({ address })],
      expected: address,
    },
    {
      name: "two embedded Solana wallets, the first one listed last",
      accounts: [solanaWallet({ address: second, wallet_index: 1 }), solanaWallet({ address })],
      expected: address,
    },
  ];

  for (const { name, accounts, expected } of cases) {
    test(`gives ${expected === null ? "null" : "the address"} for ${name}`, () => {
      expect(embeddedSolanaWallet({ linked_accounts: accounts })).toBe(expected);
    });
  }

  const malformed: { name: string; user: unknown }[] = [
    { name: "an answer without linked accounts", user: { id: PRIVY_DID } },
    {
      name: "a wallet with an address that isn't Solana",
      user: { linked_accounts: [solanaWallet({ address: "0xabc" })] },
    },
    {
      name: "a wallet from another wallet client",
      user: { linked_accounts: [solanaWallet({ wallet_client_type: "other" })] },
    },
    {
      name: "a wallet without an index",
      user: { linked_accounts: [solanaWallet({ wallet_index: undefined })] },
    },
  ];

  for (const { name, user } of malformed) {
    test(`throws for ${name}`, () => {
      expect(() => embeddedSolanaWallet(user)).toThrow();
    });
  }
});
