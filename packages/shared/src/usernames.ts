// Random usernames such as calm_otter_42: every new account gets one, and people can change it.

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
