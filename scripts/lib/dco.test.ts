import { describe, expect, test } from "bun:test";
import { findUnsignedCommits, isSignedOffBy, parseGitLog, parseSignOffs } from "./dco";

const AUTHOR = "ada@example.com";

describe("isSignedOffBy", () => {
  const cases: { name: string; message: string; author?: string; expected: boolean }[] = [
    {
      name: "sign-off matches the author",
      message: "feat(api): add x\n\nSigned-off-by: Ada Lovelace <ada@example.com>\n",
      expected: true,
    },
    {
      name: "no sign-off",
      message: "feat(api): add x\n",
      expected: false,
    },
    {
      name: "sign-off by someone else",
      message: "feat(api): add x\n\nSigned-off-by: Bob <bob@example.com>\n",
      expected: false,
    },
    {
      name: "one of several sign-offs matches",
      message:
        "fix(db): y\n\nSigned-off-by: Bob <bob@example.com>\nSigned-off-by: Ada <ada@example.com>\n",
      expected: true,
    },
    {
      name: "email comparison ignores case",
      message: "fix(db): y\n\nSigned-off-by: Ada <Ada@Example.COM>\n",
      expected: true,
    },
    {
      name: "trailer key ignores case",
      message: "fix(db): y\n\nsigned-off-by: Ada <ada@example.com>\n",
      expected: true,
    },
    {
      name: "windows line endings",
      message: "fix(db): y\r\n\r\nSigned-off-by: Ada <ada@example.com>\r\n",
      expected: true,
    },
    {
      name: "commented-out sign-off does not count",
      message: "fix(db): y\n\n# Signed-off-by: Ada <ada@example.com>\n",
      expected: false,
    },
    {
      name: "sign-off inside a sentence does not count",
      message: "fix(db): y\n\nI forgot to add Signed-off-by: Ada <ada@example.com>\n",
      expected: false,
    },
    {
      name: "sign-off without a name",
      message: "fix(db): y\n\nSigned-off-by: <ada@example.com>\n",
      expected: false,
    },
    {
      name: "sign-off without angle brackets",
      message: "fix(db): y\n\nSigned-off-by: Ada ada@example.com\n",
      expected: false,
    },
    {
      name: "empty author email",
      message: "fix(db): y\n\nSigned-off-by: Ada <ada@example.com>\n",
      author: "  ",
      expected: false,
    },
  ];

  for (const { name, message, author, expected } of cases) {
    test(name, () => {
      expect(isSignedOffBy(message, author ?? AUTHOR)).toBe(expected);
    });
  }
});

describe("parseSignOffs", () => {
  test("returns every sign-off with a trimmed name", () => {
    const message =
      "chore(repo): z\n\nSigned-off-by:   Ada Lovelace   <ada@example.com>\nSigned-off-by: Bob <bob@example.com>\n";
    expect(parseSignOffs(message)).toEqual([
      { name: "Ada Lovelace", email: "ada@example.com" },
      { name: "Bob", email: "bob@example.com" },
    ]);
  });

  test("returns nothing for a message without sign-offs", () => {
    expect(parseSignOffs("chore(repo): z\n\nSome body text.\n")).toEqual([]);
  });
});

// Builds output the way `git log` prints GIT_LOG_FORMAT: fields split by \x1f, records end with \x1e.
function gitLogOutput(commits: [sha: string, email: string, message: string][]): string {
  return commits.map((fields) => `${fields.join("\x1f")}\x1e`).join("\n");
}

describe("parseGitLog", () => {
  test("splits records and fields and keeps multi-line messages", () => {
    const output = gitLogOutput([
      [
        "aaa111",
        "ada@example.com",
        "feat(api): a\n\nBody line.\n\nSigned-off-by: Ada <ada@example.com>\n",
      ],
      ["bbb222", "bob@example.com", "fix(web): b\n"],
    ]);
    expect(parseGitLog(output)).toEqual([
      {
        sha: "aaa111",
        authorEmail: "ada@example.com",
        message: "feat(api): a\n\nBody line.\n\nSigned-off-by: Ada <ada@example.com>\n",
      },
      { sha: "bbb222", authorEmail: "bob@example.com", message: "fix(web): b\n" },
    ]);
  });

  test("returns nothing for empty output", () => {
    expect(parseGitLog("")).toEqual([]);
    expect(parseGitLog("\n")).toEqual([]);
  });
});

describe("findUnsignedCommits", () => {
  test("returns only the commits without a matching sign-off", () => {
    const commits = parseGitLog(
      gitLogOutput([
        ["aaa111", "ada@example.com", "feat(api): a\n\nSigned-off-by: Ada <ada@example.com>\n"],
        ["bbb222", "bob@example.com", "fix(web): b\n"],
        ["ccc333", "cy@example.com", "docs(docs): c\n\nSigned-off-by: Ada <ada@example.com>\n"],
      ]),
    );
    expect(findUnsignedCommits(commits).map((commit) => commit.sha)).toEqual(["bbb222", "ccc333"]);
  });

  test("returns nothing when every commit is signed off", () => {
    const commits = parseGitLog(
      gitLogOutput([
        ["aaa111", "ada@example.com", "feat(api): a\n\nSigned-off-by: Ada <ada@example.com>\n"],
      ]),
    );
    expect(findUnsignedCommits(commits)).toEqual([]);
  });
});
