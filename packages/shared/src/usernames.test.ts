import { describe, expect, test } from "bun:test";
import { USERNAME_PATTERN } from "./constants";
import {
  ADJECTIVES,
  ANIMALS,
  normalizeUsername,
  RESERVED_USERNAMES,
  randomUsername,
  secureRandomInt,
  usernameProblem,
} from "./usernames";

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

describe("secureRandomInt", () => {
  test.each([1, 2, 3, 53, 100, 2 ** 31])("draws whole numbers below %p", (max) => {
    for (let draw = 0; draw < 500; draw += 1) {
      const value = secureRandomInt(max);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(max);
    }
  });

  test("reaches every value", () => {
    const seen = new Set(Array.from({ length: 300 }, () => secureRandomInt(3)));
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  test.each([0, -1, 1.5, 2 ** 31 + 1, Number.NaN])("refuses %p as the limit", (max) => {
    expect(() => secureRandomInt(max)).toThrow(RangeError);
  });
});

describe("normalizeUsername", () => {
  test("lowercases the name, the form it's saved and compared in", () => {
    expect(normalizeUsername("Maya_K")).toBe("maya_k");
  });
});

describe("usernameProblem", () => {
  test.each([
    "maya",
    "kiran_2",
    "calm_otter_42",
    "badminton",
    "apple_pie",
    "helpful_hen",
    "teammate",
    "supporter",
    "application",
    "mood_ring",
    "rootbeer",
    "model_x",
    "open_door",
    "trail_runner",
  ])("allows %s", (name) => {
    expect(usernameProblem(name)).toBeNull();
  });

  test.each([
    ["ab", "too short"],
    ["a".repeat(21), "too long"],
    ["2maya", "starts with a digit"],
    ["Maya", "not normalized"],
    ["maya-k", "has a hyphen"],
    ["", "empty"],
  ])("calls %s invalid (%s)", (name) => {
    expect(usernameProblem(name)).toBe("invalid");
  });

  test.each([...RESERVED_USERNAMES])("reserves %s", (name) => {
    expect(usernameProblem(name)).toBe("reserved");
  });

  test.each([
    ["adm1n", "a digit for a letter"],
    ["supp0rt", "a zero for an o"],
    ["offic1al", "a one for an i"],
    ["heip", "an i for an l"],
    ["t34m", "several digits"],
    ["s0lana", "a zero in a partner's name"],
    ["pr1vy", "a one in a partner's name"],
    ["adrnin", "rn for m"],
    ["vvallet", "vv for w"],
    ["suppor7", "a digit for a letter at the end"],
    ["admin42", "digits after the word"],
    ["admin_42", "digits as their own part"],
    ["fees_2026", "a year as its own part"],
    ["admin_team", "two reserved parts"],
    ["maya_support", "a reserved part after a name"],
    ["the_official", "a reserved part at the end"],
    ["a_d_m_i_n", "underscores between letters"],
    ["sup_port", "an underscore inside the word"],
    ["opentrail", "the product name"],
    ["opentrails", "the product name with more after it"],
    ["opentrail_fan", "the product name as a part"],
    ["open_trail", "the product name split in two"],
    ["the_0pentrai1", "the product name with look-alikes"],
    ["my_opentrail_42", "the product name in the middle"],
  ])("reserves %s (%s)", (name) => {
    expect(usernameProblem(name)).toBe("reserved");
  });

  test("allows every random name", () => {
    for (const adjective of ADJECTIVES) {
      for (const animal of ANIMALS) {
        expect(usernameProblem(`${adjective}_${animal}_42`)).toBeNull();
      }
    }
    for (let number = 0; number < 100; number += 1) {
      const name = randomUsername((max) => (max === 100 ? number : 0));
      expect(usernameProblem(name)).toBeNull();
    }
  });
});
