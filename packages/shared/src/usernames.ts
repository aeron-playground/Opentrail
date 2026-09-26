// Usernames: the rules every app checks, and random names such as calm_otter_42, which every new
// account gets until the person chooses their own.
import { APP_NAME } from "./brand";
import { USERNAME_PATTERN } from "./constants";

// Short, friendly words. Trading slang (bull, bear, whale, ape…) stays out, so a name never reads
// like a claim about how someone trades.
export const ADJECTIVES = [
  "bold",
  "brave",
  "bright",
  "calm",
  "cheery",
  "clever",
  "cozy",
  "crisp",
  "curious",
  "daring",
  "eager",
  "fair",
  "fond",
  "gentle",
  "glad",
  "golden",
  "grand",
  "happy",
  "hardy",
  "honest",
  "humble",
  "jolly",
  "keen",
  "kind",
  "lively",
  "loyal",
  "lucky",
  "mellow",
  "merry",
  "misty",
  "modest",
  "neat",
  "nimble",
  "noble",
  "patient",
  "plucky",
  "polite",
  "quick",
  "quiet",
  "ready",
  "rosy",
  "rustic",
  "shiny",
  "silver",
  "sleek",
  "snowy",
  "steady",
  "sunny",
  "swift",
  "tidy",
  "upbeat",
  "vivid",
  "warm",
  "wise",
  "witty",
  "zesty",
] as const;

export const ANIMALS = [
  "alpaca",
  "badger",
  "beaver",
  "bison",
  "crane",
  "dolphin",
  "dove",
  "eagle",
  "falcon",
  "ferret",
  "finch",
  "fox",
  "gecko",
  "hare",
  "heron",
  "ibis",
  "jay",
  "kiwi",
  "koala",
  "lark",
  "lemur",
  "lynx",
  "marten",
  "moose",
  "newt",
  "ocelot",
  "orca",
  "osprey",
  "otter",
  "owl",
  "panda",
  "parrot",
  "pelican",
  "penguin",
  "puffin",
  "quail",
  "rabbit",
  "raven",
  "robin",
  "salmon",
  "seal",
  "sparrow",
  "stork",
  "swan",
  "tapir",
  "tiger",
  "toucan",
  "turtle",
  "walrus",
  "wombat",
  "wren",
  "yak",
  "zebra",
] as const;

const TWO_DIGITS = Array.from({ length: 100 }, (_, n) => String(n).padStart(2, "0"));

/** Returns a whole number from 0 up to, but not including, `max`. */
export type RandomInt = (max: number) => number;

/**
 * A secure random whole number below `max`, with every value equally likely: it keeps only the
 * bits a number below `max` needs, and draws again when the result is too large. (Modulo would
 * make the smaller numbers slightly more likely.)
 */
export const secureRandomInt: RandomInt = (max) => {
  // The mask works on 31 bits, and zero or a fraction would never end the loop.
  if (!Number.isInteger(max) || max < 1 || max > 2 ** 31) {
    throw new RangeError(`max must be a whole number from 1 to 2^31, not ${max}`);
  }
  const mask = 2 ** Math.ceil(Math.log2(max)) - 1;
  const values = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(values);
    const value = (values[0] ?? 0) & mask;
    if (value < max) {
      return value;
    }
  }
};

/** A random `adjective_animal_NN` username, such as `calm_otter_42`. It always fits the rules. */
export function randomUsername(randomInt: RandomInt = secureRandomInt): string {
  return [ADJECTIVES, ANIMALS, TWO_DIGITS].map((words) => pick(words, randomInt)).join("_");
}

function pick(words: readonly string[], randomInt: RandomInt): string {
  const word = words[randomInt(words.length)];
  if (word === undefined) {
    throw new RangeError("randomInt returned a number outside the list");
  }
  return word;
}

// Names that would let someone pass as the team, a partner or a broken client.
export const RESERVED_USERNAMES = [
  "admin",
  "administrator",
  "api",
  "app",
  "fees",
  "fomo",
  "help",
  "jupiter",
  "mod",
  "moderator",
  "null",
  "official",
  "privy",
  "root",
  "security",
  "solana",
  "staff",
  "support",
  "system",
  "team",
  "undefined",
  "wallet",
] as const;

// Characters people swap in to get a blocked name past a plain comparison: adm1n, supp0rt, adrnin.
// Both the name and the reserved words go through the same swaps, so only the shapes are compared.
const LOOK_ALIKES: readonly (readonly [RegExp, string])[] = [
  [/rn/g, "m"],
  [/vv/g, "w"],
  [/[1l]/g, "i"],
  [/0/g, "o"],
  [/3/g, "e"],
  [/4/g, "a"],
  [/5/g, "s"],
  [/7/g, "t"],
  [/8/g, "b"],
];

function shape(text: string): string {
  return LOOK_ALIKES.reduce((result, [pattern, letter]) => result.replace(pattern, letter), text);
}

const RESERVED_SHAPES = new Set<string>(RESERVED_USERNAMES.map(shape));
// Every form of the product name is blocked, anywhere in a name.
const BRAND_SHAPE = shape(APP_NAME.toLowerCase());

export type UsernameProblem = "invalid" | "reserved";

/** The name as it's saved and compared: usernames are lowercase. */
export function normalizeUsername(input: string): string {
  return input.toLowerCase();
}

/**
 * Why a name can't be used, or null when the rules allow it. Pass it through normalizeUsername
 * first. Whether someone already has the name is for the server to say.
 */
export function usernameProblem(name: string): UsernameProblem | null {
  if (!USERNAME_PATTERN.test(name)) {
    return "invalid";
  }
  return isReserved(name) ? "reserved" : null;
}

// A reserved word counts as a whole part between underscores (admin_team), as the whole name with
// the underscores taken out (a_d_m_i_n), and with digits at either end (admin42). Inside a longer
// word it doesn't count, so badminton and apple_pie stay allowed.
function isReserved(name: string): boolean {
  const parts = name.split("_").filter((part) => part !== "");
  const forms = [...parts, parts.join("")].flatMap((text) => [
    shape(text),
    shape(text.replace(/^\d+|\d+$/g, "")),
  ]);
  return forms.some((form) => RESERVED_SHAPES.has(form) || form.includes(BRAND_SHAPE));
}
