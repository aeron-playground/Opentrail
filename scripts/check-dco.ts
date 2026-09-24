// Checks DCO sign-offs.
//   --message-file <path>    commit-msg hook: the commit being made
//   --range <base>..<head>   CI: every non-merge commit in a pull request
import { findUnsignedCommits, GIT_LOG_FORMAT, isSignedOffBy, parseGitLog } from "./lib/dco";

const USAGE = "Usage: bun scripts/check-dco.ts --message-file <path> | --range <base>..<head>";
const DCO_URL = "https://developercertificate.org";

const [mode, value] = Bun.argv.slice(2);

if (mode === "--message-file" && value !== undefined) {
  await checkMessageFile(value);
} else if (mode === "--range" && value !== undefined) {
  checkRange(value);
} else {
  console.error(USAGE);
  process.exit(2);
}

async function checkMessageFile(path: string): Promise<void> {
  const message = await Bun.file(path).text();
  const authorEmail = readAuthorEmail();
  if (isSignedOffBy(message, authorEmail)) {
    return;
  }
  console.error(
    [
      `This commit has no sign-off for ${authorEmail || "the author"}.`,
      "Commit again with: git commit -s",
      `Signing off means you have the right to submit this change: ${DCO_URL}`,
    ].join("\n"),
  );
  process.exit(1);
}

function checkRange(range: string): void {
  const commits = parseGitLog(git(["log", "--no-merges", GIT_LOG_FORMAT, range]));
  const unsigned = findUnsignedCommits(commits);
  if (unsigned.length === 0) {
    console.log(`All ${commits.length} commits are signed off.`);
    return;
  }
  const base = range.split("..")[0] ?? "<base>";
  console.error(
    `${unsigned.length} of ${commits.length} commits have no sign-off by their author:`,
  );
  for (const commit of unsigned) {
    const subject = commit.message.split("\n")[0] ?? "";
    console.error(`  ${commit.sha.slice(0, 12)}  ${subject}  (author: ${commit.authorEmail})`);
  }
  console.error(
    [
      "",
      "Add a sign-off to every commit, then update the pull request:",
      `  git rebase --signoff ${base}`,
      "  git push --force-with-lease",
      `Signing off means you have the right to submit this change: ${DCO_URL}`,
    ].join("\n"),
  );
  process.exit(1);
}

// `git var` gives the identity git will record as the author, including GIT_AUTHOR_EMAIL overrides.
function readAuthorEmail(): string {
  return /<([^>]*)>/.exec(git(["var", "GIT_AUTHOR_IDENT"]))?.[1] ?? "";
}

function git(args: string[]): string {
  const result = Bun.spawnSync(["git", ...args]);
  if (result.exitCode !== 0) {
    console.error(`git ${args.join(" ")} failed:\n${result.stderr.toString()}`);
    process.exit(2);
  }
  return result.stdout.toString();
}
