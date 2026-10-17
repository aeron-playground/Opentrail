import { describe, expect, test } from "bun:test";
import { createLogger, errorHandler, notFound, requestId } from "@repo/server";
import { ERRORS } from "@repo/shared";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "./auth";
import { limitPerUser } from "./rate-limit";

// The person comes from a header here; in the app, requireAuth sets it from the access token.
function appWith(options: Parameters<typeof limitPerUser>[0]) {
  const guarded = createRouter<AuthEnv>();
  guarded.use("/costly", async (c, next) => {
    c.set("privyDid", c.req.header("x-person") ?? "nobody");
    await next();
  });
  guarded.use("/costly", limitPerUser(options));
  guarded.post("/costly", (c) => c.json({ ok: true }));

  const app = createRouter();
  app.use(requestId());
  app.route("/", guarded);
  app.notFound(notFound);
  app.onError(errorHandler(createLogger("silent")));
  return app;
}

const as = (app: ReturnType<typeof appWith>, person: string) =>
  app.request("/costly", { method: "POST", headers: { "x-person": person } });

describe("limitPerUser", () => {
  test("lets the limit through, then refuses with RATE_LIMITED and when to come back", async () => {
    let time = 1_000_000;
    const app = appWith({ limit: 3, windowMs: 60_000, now: () => time });
    for (let n = 0; n < 3; n += 1) {
      expect((await as(app, "maya")).status).toBe(200);
    }
    time += 20_500;

    const refused = await as(app, "maya");
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBe("40");
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe("RATE_LIMITED");
    expect(ERRORS.RATE_LIMITED.status).toBe(429);
  });

  test("counts each person on their own", async () => {
    const app = appWith({ limit: 1, windowMs: 60_000, now: () => 0 });
    expect((await as(app, "maya")).status).toBe(200);
    expect((await as(app, "omar")).status).toBe(200);
    expect((await as(app, "maya")).status).toBe(429);
  });

  test("starts a fresh count once the window has passed", async () => {
    let time = 0;
    const app = appWith({ limit: 1, windowMs: 60_000, now: () => time });
    expect((await as(app, "maya")).status).toBe(200);
    time = 59_999;
    expect((await as(app, "maya")).status).toBe(429);
    time = 60_000;
    expect((await as(app, "maya")).status).toBe(200);
  });

  test("forgets the oldest person when it counts too many, so memory stays bounded", async () => {
    const app = appWith({ limit: 1, windowMs: 60_000, now: () => 0, maxPeople: 2 });
    await as(app, "maya");
    await as(app, "omar");
    await as(app, "lena");
    // Maya, the oldest, was forgotten, so she starts over. Lena, the newest, is still counted.
    expect((await as(app, "maya")).status).toBe(200);
    expect((await as(app, "lena")).status).toBe(429);
  });
});
