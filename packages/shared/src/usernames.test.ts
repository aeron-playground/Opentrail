import { describe, expect, test } from "bun:test";
import { USERNAME_PATTERN } from "./constants";
import { ADJECTIVES, ANIMALS, randomUsername } from "./usernames";

describe("word lists", () => {
  for (const [name, words] of [
    ["ADJECTIVES", ADJECTIVES],
    ["ANIMALS", ANIMALS],
  ] as const) {
    test(`${name} holds plain lowercase words, each once`, () => {
      for (const word of words) {
        expect(word).toMatch(/^[a-z]+$/);
      }
      expect(new Set(words).size).toBe(words.length);
    });
  }

  test("the longest possible name still fits the username rules", () => {
    const longest = (words: readonly string[]) =>
      words.reduce((a, b) => (b.length > a.length ? b : a));
    const name = `${longest(ADJECTIVES)}_${longest(ANIMALS)}_99`;
    expect(USERNAME_PATTERN.test(name)).toBe(true);
  });
});

describe("randomUsername", () => {
  test("joins an adjective, an animal and two digits", () => {
    expect(randomUsername(() => 0)).toBe(`${ADJECTIVES[0]}_${ANIMALS[0]}_00`);
  });

  test("can reach the last word of each list and 99", () => {
    expect(randomUsername((max) => max - 1)).toBe(`${ADJECTIVES.at(-1)}_${ANIMALS.at(-1)}_99`);
  });

  test("keeps the leading zero of one-digit numbers", () => {
    expect(randomUsername((max) => (max === 100 ? 7 : 0))).toEndWith("_07");
  });

  test("asks for a number below each list's length", () => {
    const asked: number[] = [];
    randomUsername((max) => {
      asked.push(max);
      return 0;
    });
    expect(asked).toEqual([ADJECTIVES.length, ANIMALS.length, 100]);
  });

  test.each([
    ["too large", (max: number) => max],
    ["negative", () => -1],
    ["not whole", () => 0.5],
  ])("refuses a random number that is %s", (_, randomInt) => {
    expect(() => randomUsername(randomInt)).toThrow(RangeError);
  });

  test("random names fit the username rules and vary", () => {
    const names = Array.from({ length: 200 }, () => randomUsername());
    for (const name of names) {
      expect(USERNAME_PATTERN.test(name)).toBe(true);
    }
    expect(new Set(names).size).toBeGreaterThan(150);
  });
});
