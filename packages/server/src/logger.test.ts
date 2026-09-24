import { expect, test } from "bun:test";
import { createLogger } from "./logger";

function capture() {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger("info", {
    write: (line) => {
      lines.push(JSON.parse(line));
    },
  });
  return { logger, lines };
}

test("writes JSON lines with a level name and an ISO time", () => {
  const { logger, lines } = capture();
  logger.info("hello");
  expect(lines[0]).toMatchObject({ level: "info", msg: "hello" });
  expect(new Date(String(lines[0]?.time)).toISOString()).toBe(String(lines[0]?.time));
});

test("redacts secrets at the top level and one level down", () => {
  const { logger, lines } = capture();
  logger.info(
    {
      authorization: "Bearer top-secret",
      headers: { authorization: "Bearer nested-secret", cookie: "session=cookie-secret" },
      token: "token-secret",
    },
    "request",
  );
  expect(JSON.stringify(lines[0])).not.toMatch(
    /top-secret|nested-secret|cookie-secret|token-secret/,
  );
  expect(lines[0]).toMatchObject({
    authorization: "[redacted]",
    headers: { authorization: "[redacted]", cookie: "[redacted]" },
    token: "[redacted]",
  });
});

test("writes nothing when silent", () => {
  const lines: string[] = [];
  const logger = createLogger("silent", { write: (line) => void lines.push(line) });
  logger.error("not written");
  expect(lines).toEqual([]);
});
