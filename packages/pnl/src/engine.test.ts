import { describe, expect, test } from "bun:test";
import {
  applyBuy,
  applyEvent,
  applySell,
  applyTransferIn,
  applyTransferOut,
  type ChainOrder,
  compareChainOrder,
  EMPTY_POSITION,
  InsufficientQuantityError,
  type LedgerEvent,
  marketValue,
  type Position,
  replay,
  unrealized,
} from "./engine";

// Events without a place on the chain, applied in the order written.
type Step = LedgerEvent extends infer E
  ? E extends ChainOrder
    ? Omit<E, keyof ChainOrder>
    : never
  : never;

function run(steps: Step[]): Position {
  return steps.reduce(
    (position, step, index) =>
      applyEvent(position, { ...step, slot: index, signature: `s${index}` }),
    EMPTY_POSITION,
  );
}

// Amounts: tokens with 6 decimals (1 token = 1_000_000n units) and micro-USDC ($1 = 1_000_000n).
describe("average cost", () => {
  const cases: { name: string; steps: Step[]; expected: Position }[] = [
    {
      name: "the worked example on the docs page",
      steps: [
        { kind: "buy", quantity: 10_000_000n, cost: 5_000_000n },
        { kind: "buy", quantity: 10_000_000n, cost: 7_000_000n },
        { kind: "sell", quantity: 5_000_000n, proceeds: 4_000_000n },
      ],
      expected: { quantity: 15_000_000n, costBasis: 9_000_000n, realized: 1_000_000n },
    },
    {
      name: "selling everything leaves no cost and realizes the whole difference",
      steps: [
        { kind: "buy", quantity: 3n, cost: 1_000n },
        { kind: "sell", quantity: 3n, proceeds: 700n },
      ],
      expected: { quantity: 0n, costBasis: 0n, realized: -300n },
    },
    {
      name: "a partial sale at a loss",
      steps: [
        { kind: "buy", quantity: 100n, cost: 1_000n },
        { kind: "sell", quantity: 40n, proceeds: 300n },
      ],
      expected: { quantity: 60n, costBasis: 600n, realized: -100n },
    },
    {
      name: "rounding never loses money: the realized total equals proceeds minus cost",
      steps: [
        { kind: "buy", quantity: 3n, cost: 10n },
        { kind: "sell", quantity: 1n, proceeds: 4n },
        { kind: "sell", quantity: 1n, proceeds: 4n },
        { kind: "sell", quantity: 1n, proceeds: 4n },
      ],
      expected: { quantity: 0n, costBasis: 0n, realized: 2n },
    },
    {
      name: "tokens that arrive are neither a gain nor a loss",
      steps: [
        { kind: "transfer_in", quantity: 50n, value: 500n },
        { kind: "sell", quantity: 50n, proceeds: 500n },
      ],
      expected: { quantity: 0n, costBasis: 0n, realized: 0n },
    },
    {
      name: "tokens that leave take their share of the cost and realize nothing",
      steps: [
        { kind: "buy", quantity: 100n, cost: 1_000n },
        { kind: "transfer_out", quantity: 25n },
        { kind: "sell", quantity: 75n, proceeds: 900n },
      ],
      expected: { quantity: 0n, costBasis: 0n, realized: 150n },
    },
    {
      name: "tokens that cost nothing, like an airdrop bought at zero",
      steps: [{ kind: "buy", quantity: 10n, cost: 0n }],
      expected: { quantity: 10n, costBasis: 0n, realized: 0n },
    },
  ];

  for (const { name, steps, expected } of cases) {
    test(name, () => {
      expect(run(steps)).toEqual(expected);
    });
  }

  test("every step returns a new position and leaves the old one alone", () => {
    const bought = applyBuy(EMPTY_POSITION, { quantity: 10n, cost: 100n });
    const before = { ...bought };
    applySell(bought, { quantity: 5n, proceeds: 60n });
    applyTransferIn(bought, { quantity: 5n, value: 50n });
    applyTransferOut(bought, { quantity: 5n });
    expect(bought).toEqual(before);
    expect(EMPTY_POSITION).toEqual({ quantity: 0n, costBasis: 0n, realized: 0n });
  });
});

describe("refusals", () => {
  const held = applyBuy(EMPTY_POSITION, { quantity: 10n, cost: 100n });

  test.each([
    [
      "selling from an empty position",
      () => applySell(EMPTY_POSITION, { quantity: 1n, proceeds: 1n }),
    ],
    ["selling more than is held", () => applySell(held, { quantity: 11n, proceeds: 1n })],
    ["sending more than is held", () => applyTransferOut(held, { quantity: 11n })],
  ])("%s is an InsufficientQuantityError", (_, act) => {
    expect(act).toThrow(InsufficientQuantityError);
    expect(act).toThrow(RangeError);
  });

  test.each([
    ["a buy of zero", () => applyBuy(held, { quantity: 0n, cost: 1n })],
    ["a negative cost", () => applyBuy(held, { quantity: 1n, cost: -1n })],
    ["a sale of zero", () => applySell(held, { quantity: 0n, proceeds: 1n })],
    ["negative proceeds", () => applySell(held, { quantity: 1n, proceeds: -1n })],
    ["an arrival of zero", () => applyTransferIn(held, { quantity: 0n, value: 1n })],
    ["a negative value", () => applyTransferIn(held, { quantity: 1n, value: -1n })],
    ["a departure of zero", () => applyTransferOut(held, { quantity: 0n })],
    ["a negative market quantity", () => marketValue(-1n, 6, "1")],
    ["a price that isn't a decimal", () => marketValue(1n, 6, "1e3")],
    ["negative decimals", () => marketValue(1n, -1, "1")],
  ])("refuses %s", (_, act) => {
    expect(act).toThrow(RangeError);
  });

  test("the error names itself", () => {
    expect(() => applyTransferOut(EMPTY_POSITION, { quantity: 1n })).toThrow(
      expect.objectContaining({ name: "InsufficientQuantityError" }),
    );
  });
});

describe("marketValue", () => {
  test.each([
    ["1.5 of a 6-decimal token at $1", 1_500_000n, 6, "1", 1_500_000n],
    ["2.5 SOL (9 decimals) at $142.35", 2_500_000_000n, 9, "142.35", 355_875_000n],
    ["1,000,000 BONK (5 decimals) at $0.0000123", 100_000_000_000n, 5, "0.0000123", 12_300_000n],
    ["a dust amount that rounds to zero", 1n, 9, "0.5", 0n],
    ["an exact half of a micro-USDC rounds up", 1n, 6, "0.5", 1n],
    ["nothing held", 0n, 6, "123.45", 0n],
  ])("%s", (_, quantity, decimals, price, expected) => {
    expect(marketValue(quantity, decimals, price)).toBe(expected);
  });
});

describe("unrealized", () => {
  test("the worked example: 15 tokens bought for $9.00 are worth $10.50 at $0.70", () => {
    const position = { quantity: 15_000_000n, costBasis: 9_000_000n, realized: 1_000_000n };
    expect(unrealized(position, 6, "0.70")).toBe(1_500_000n);
  });

  test("below the average cost it's a loss", () => {
    const position = applyBuy(EMPTY_POSITION, { quantity: 1_000_000n, cost: 2_000_000n });
    expect(unrealized(position, 6, "1.5")).toBe(-500_000n);
  });
});

describe("compareChainOrder", () => {
  test.each([
    ["an earlier slot first", { slot: 1, signature: "b" }, { slot: 2, signature: "a" }, -1],
    ["a later slot last", { slot: 3, signature: "a" }, { slot: 2, signature: "b" }, 1],
    [
      "in one slot, the position in the block",
      { slot: 1, indexInBlock: 2, signature: "a" },
      { slot: 1, indexInBlock: 1, signature: "b" },
      1,
    ],
    [
      "without both positions, the signature",
      { slot: 1, indexInBlock: 2, signature: "a" },
      { slot: 1, signature: "b" },
      -1,
    ],
    [
      "the same position in the block, then the signature",
      { slot: 1, indexInBlock: 1, signature: "b" },
      { slot: 1, indexInBlock: 1, signature: "a" },
      1,
    ],
    ["the same event", { slot: 1, signature: "a" }, { slot: 1, signature: "a" }, 0],
  ] as const)("%s", (_, a, b, sign) => {
    expect(Math.sign(compareChainOrder(a, b))).toBe(sign);
  });
});

describe("replay", () => {
  test("nothing happened: an empty position", () => {
    expect(replay([])).toEqual(EMPTY_POSITION);
  });

  test("a sale that arrives before its buy still counts, once the history is rebuilt", () => {
    const sell: LedgerEvent = {
      kind: "sell",
      quantity: 5n,
      proceeds: 80n,
      slot: 20,
      signature: "b",
    };
    const buy: LedgerEvent = { kind: "buy", quantity: 10n, cost: 100n, slot: 10, signature: "a" };
    expect(() => applyEvent(EMPTY_POSITION, sell)).toThrow(InsufficientQuantityError);
    expect(replay([sell, buy])).toEqual({ quantity: 5n, costBasis: 50n, realized: 30n });
  });

  // A small, seeded generator, so a failure always shows the same history.
  function random(seed: number) {
    let state = seed;
    return (below: number) => {
      state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
      return state % below;
    };
  }

  function history(seed: number): LedgerEvent[] {
    const next = random(seed);
    const events: LedgerEvent[] = [];
    let held = 0n;
    for (let slot = 0; slot < 60; slot++) {
      const order = { slot, indexInBlock: next(3), signature: `sig-${seed}-${slot}` };
      const amount = BigInt(1 + next(1_000));
      const choice = held === 0n ? next(2) * 2 : next(4);
      if (choice === 0) {
        events.push({ kind: "buy", quantity: amount, cost: BigInt(next(5_000)), ...order });
        held += amount;
      } else if (choice === 1) {
        const quantity = 1n + (amount % held);
        events.push({ kind: "sell", quantity, proceeds: BigInt(next(5_000)), ...order });
        held -= quantity;
      } else if (choice === 2) {
        events.push({
          kind: "transfer_in",
          quantity: amount,
          value: BigInt(next(5_000)),
          ...order,
        });
        held += amount;
      } else {
        const quantity = 1n + (amount % held);
        events.push({ kind: "transfer_out", quantity, ...order });
        held -= quantity;
      }
    }
    return events;
  }

  function shuffled<T>(items: T[], seed: number): T[] {
    const next = random(seed);
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index--) {
      const other = next(index + 1);
      [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
    }
    return copy;
  }

  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    test(`history ${seed}: rebuilding from scratch equals updating step by step`, () => {
      const events = history(seed);
      const stepByStep = events.reduce(applyEvent, EMPTY_POSITION);
      expect(replay(shuffled(events, seed + 100))).toEqual(stepByStep);
    });
  }
});
