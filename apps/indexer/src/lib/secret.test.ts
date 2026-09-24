import { expect, test } from "bun:test";
import { secretsMatch } from "./secret";

const SECRET = "a-webhook-secret-that-is-long-enough-123";

const cases: { name: string; given: string | undefined; matches: boolean }[] = [
  { name: "the same secret", given: SECRET, matches: true },
  {
    name: "a different secret of the same length",
    given: SECRET.replace("a", "b"),
    matches: false,
  },
  { name: "a prefix of the secret", given: SECRET.slice(0, 10), matches: false },
  { name: "the secret plus more", given: `${SECRET}x`, matches: false },
  { name: "the secret with a Bearer prefix", given: `Bearer ${SECRET}`, matches: false },
  { name: "an empty value", given: "", matches: false },
  { name: "no value", given: undefined, matches: false },
];

for (const { name, given, matches } of cases) {
  test(`${matches ? "accepts" : "refuses"} ${name}`, () => {
    expect(secretsMatch(given, SECRET)).toBe(matches);
  });
}
