import { describe, expect, test } from "bun:test";
import type { SafetyLevel } from "@repo/db";
import { type SafetyChecks, safetyLevel } from "./safety-level";

// A token that passes every check.
const SAFE: SafetyChecks = {
  isVerified: true,
  liquidityUsd: "5877443.91",
  mintAuthorityRevoked: true,
  freezeAuthorityRevoked: true,
  hasReviewedNote: false,
};

describe("safetyLevel", () => {
  const cases: [string, Partial<SafetyChecks>, SafetyLevel][] = [
    ["every check passes", {}, "ok"],
    ["exactly $1M in its pools", { liquidityUsd: "1000000" }, "ok"],
    [
      "an authority kept, with a reviewed note",
      { mintAuthorityRevoked: false, hasReviewedNote: true },
      "ok",
    ],
    [
      "both kept, with a reviewed note",
      { mintAuthorityRevoked: false, freezeAuthorityRevoked: false, hasReviewedNote: true },
      "ok",
    ],
    ["just under $1M", { liquidityUsd: "999999.99" }, "caution"],
    ["exactly $100K", { liquidityUsd: "100000" }, "caution"],
    ["liquidity unknown", { liquidityUsd: null }, "caution"],
    ["the mint authority kept, no note", { mintAuthorityRevoked: false }, "caution"],
    ["the freeze authority kept, no note", { freezeAuthorityRevoked: false }, "caution"],
    [
      "a note doesn't excuse thin liquidity",
      { liquidityUsd: "500000", hasReviewedNote: true },
      "caution",
    ],
    ["just under $100K", { liquidityUsd: "99999.99" }, "high_risk"],
    ["no liquidity at all", { liquidityUsd: "0" }, "high_risk"],
    ["not verified by Jupiter", { isVerified: false }, "high_risk"],
    ["not verified, even with a note", { isVerified: false, hasReviewedNote: true }, "high_risk"],
  ];

  test.each(cases)("%s: %p is %p", (_, changes, level) => {
    expect(safetyLevel({ ...SAFE, ...changes })).toBe(level);
  });
});
