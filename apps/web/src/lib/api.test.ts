import { describe, expect, test } from "bun:test";
import { ApiError, createWebApi, isApiError, unwrap } from "./api";

function recordingFetch(response: () => Response) {
  const requests: Request[] = [];
  return {
    requests,
    fetch: async (request: Request) => {
      requests.push(request);
      return response();
    },
  };
}

const health = () => Response.json({ status: "ok", checks: { database: "ok" } });

describe("createWebApi", () => {
  test("sends the access token when there is one", async () => {
    const recorder = recordingFetch(health);
    const api = createWebApi("http://api.test", async () => "token-123", recorder.fetch);
    await api.GET("/v1/health");
    expect(recorder.requests[0]?.headers.get("authorization")).toBe("Bearer token-123");
  });

  test("sends no Authorization header when nobody is signed in", async () => {
    const recorder = recordingFetch(health);
    const api = createWebApi("http://api.test", async () => null, recorder.fetch);
    await api.GET("/v1/health");
    expect(recorder.requests[0]?.headers.get("authorization")).toBeNull();
  });
});

describe("unwrap", () => {
  test("gives the data of a success", async () => {
    const api = createWebApi(
      "http://api.test",
      async () => null,
      async () => health(),
    );
    expect(unwrap(await api.GET("/v1/health")).status).toBe("ok");
  });

  test("turns the shared error shape into an ApiError", async () => {
    const body = {
      error: {
        code: "WALLET_NOT_READY",
        message: "Your wallet is still being set up.",
        requestId: "r",
      },
    };
    const api = createWebApi(
      "http://api.test",
      async () => "t",
      async () => Response.json(body, { status: 409 }),
    );
    const error = await Promise.resolve()
      .then(async () => unwrap(await api.GET("/v1/me")))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: "WALLET_NOT_READY" });
    expect(isApiError(error, "WALLET_NOT_READY")).toBe(true);
    expect(isApiError(error, "UNAUTHORIZED")).toBe(false);
  });

  test("uses UNKNOWN for an answer without the shared shape", () => {
    const response = new Response("Bad gateway", { status: 502 });
    expect(() => unwrap({ response })).toThrow(ApiError);
    try {
      unwrap({ response });
    } catch (error) {
      expect(error).toMatchObject({ status: 502, code: "UNKNOWN" });
    }
  });
});
