import { describe, expect, test } from "bun:test";
import { createLogger, errorHandler, notFound, REQUEST_ID_HEADER, requestId } from "@repo/server";
import { ERRORS } from "@repo/shared";
import { createRouter } from "../lib/router";
import { createFakePrivy } from "../providers/privy/fake";
import type { PrivyProvider } from "../providers/privy/types";
import { type AuthEnv, requireAuth } from "./auth";

// Built like the real app: the guarded routes sit in their own router inside the main one.
function appWith(verifier: Pick<PrivyProvider, "verifyAccessToken">) {
  const guarded = createRouter<AuthEnv>();
  guarded.use("/private", requireAuth(verifier));
  guarded.get("/private", (c) => c.json({ privyDid: c.var.privyDid }));

  const app = createRouter();
  app.use(requestId());
  app.route("/", guarded);
  app.notFound(notFound);
  app.onError(errorHandler(createLogger("silent")));
  return app;
}

function testApp() {
  const privy = createFakePrivy();
  let verifications = 0;
  const app = appWith({
    verifyAccessToken: (token) => {
      verifications += 1;
      return privy.verifyAccessToken(token);
    },
  });
  return { app, privy, verifications: () => verifications };
}

const get = (app: ReturnType<typeof appWith>, authorization?: string) =>
  app.request("/private", authorization === undefined ? {} : { headers: { authorization } });

describe("requireAuth", () => {
  test("lets a valid token through with the person's Privy id", async () => {
    const { app, privy } = testApp();
    const person = privy.signIn();
    const response = await get(app, `Bearer ${person.token}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ privyDid: person.privyDid });
  });

  test("accepts the scheme in any case", async () => {
    const { app, privy } = testApp();
    const person = privy.signIn();
    expect((await get(app, `bearer ${person.token}`)).status).toBe(200);
  });

  const refused: { name: string; header: string | undefined }[] = [
    { name: "no Authorization header", header: undefined },
    { name: "an empty header", header: "" },
    { name: "another scheme", header: "Basic dXNlcjpwYXNz" },
    { name: "a scheme without a token", header: "Bearer" },
    { name: "a token with a space in it", header: "Bearer abc def" },
    { name: "a token Privy didn't issue", header: "Bearer fake-token-unknown" },
  ];

  for (const { name, header } of refused) {
    test(`answers 401 for ${name}`, async () => {
      const response = await get(testApp().app, header);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: {
          code: "UNAUTHORIZED",
          message: ERRORS.UNAUTHORIZED.message,
          requestId: String(response.headers.get(REQUEST_ID_HEADER)),
        },
      });
    });
  }

  test("refuses a very long token without checking its signature", async () => {
    const { app, verifications } = testApp();
    const response = await get(app, `Bearer ${"a".repeat(4097)}`);
    expect(response.status).toBe(401);
    expect(verifications()).toBe(0);
  });

  test("answers 500, not 401, when checking the token fails for another reason", async () => {
    const app = appWith({ verifyAccessToken: () => Promise.reject(new Error("network down")) });
    const response = await get(app, "Bearer some-token");
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INTERNAL");
  });
});
