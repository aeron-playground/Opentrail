// The same rules check pull request titles in CI, because the title becomes the squash commit.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 72],
    "scope-empty": [2, "never"],
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "perf", "refactor", "test", "docs", "chore", "ci", "build", "revert"],
    ],
    "scope-enum": [
      2,
      "always",
      [
        "web",
        "api",
        "indexer",
        "docs",
        "db",
        "shared",
        "solana",
        "pnl",
        "format",
        "api-client",
        "ci",
        "deps",
        "repo",
        "release",
      ],
    ],
  },
};
