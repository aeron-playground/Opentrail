// Developer Certificate of Origin: https://developercertificate.org
// A commit counts as signed off when a `Signed-off-by: Name <email>` line matches the author's email.

export type SignOff = { name: string; email: string };

const SIGN_OFF_LINE = /^signed-off-by:[ \t]*(.*?)[ \t]*<([^<>\s@]+@[^<>\s@]+)>[ \t]*$/i;

export function parseSignOffs(message: string): SignOff[] {
  const signOffs: SignOff[] = [];
  for (const line of message.split(/\r?\n/)) {
    const match = SIGN_OFF_LINE.exec(line);
    const name = match?.[1]?.trim();
    const email = match?.[2];
    if (name && email) {
      signOffs.push({ name, email });
    }
  }
  return signOffs;
}

export function isSignedOffBy(message: string, authorEmail: string): boolean {
  const author = authorEmail.trim().toLowerCase();
  if (author === "") {
    return false;
  }
  return parseSignOffs(message).some((signOff) => signOff.email.toLowerCase() === author);
}

export type Commit = { sha: string; authorEmail: string; message: string };

const RECORD_SEPARATOR = "\x1e";
const FIELD_SEPARATOR = "\x1f";

// The log format uses ASCII separators so any text in a commit message stays intact.
export const GIT_LOG_FORMAT = "--format=%H%x1f%ae%x1f%B%x1e";

export function parseGitLog(output: string): Commit[] {
  return output
    .split(RECORD_SEPARATOR)
    .map((record) => record.replace(/^\r?\n/, ""))
    .filter((record) => record.trim() !== "")
    .map((record) => {
      const [sha = "", authorEmail = "", message = ""] = record.split(FIELD_SEPARATOR);
      return { sha, authorEmail, message };
    });
}

// Who GitHub says opened a pull request, as its event carries it.
export type PullRequestOpener = { type: string; id: string; login: string };

// Bots sign off with their own address (Dependabot: support@github.com), not the GitHub address
// their commits are written with, so their sign-off never matches the author. When GitHub says a
// bot opened the pull request, this is that bot's commit address; otherwise null. Nobody can open
// a pull request as a bot, so typing a bot's email into a commit gains a person nothing.
export function botCommitEmail({ type, id, login }: PullRequestOpener): string | null {
  if (type !== "Bot" || !/^\d+$/.test(id) || !/^[a-z0-9-]+\[bot\]$/i.test(login)) {
    return null;
  }
  return `${id}+${login}@users.noreply.github.com`;
}

// A commit is signed off by its author, or, in a pull request a bot opened, it is that bot's own
// commit and carries a sign-off.
export function findUnsignedCommits(commits: Commit[], botEmail: string | null = null): Commit[] {
  const bot = botEmail?.toLowerCase();
  return commits.filter((commit) => {
    if (isSignedOffBy(commit.message, commit.authorEmail)) {
      return false;
    }
    const byBot = bot !== undefined && commit.authorEmail.trim().toLowerCase() === bot;
    return !(byBot && parseSignOffs(commit.message).length > 0);
  });
}
