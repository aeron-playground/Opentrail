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

export function findUnsignedCommits(commits: Commit[]): Commit[] {
  return commits.filter((commit) => !isSignedOffBy(commit.message, commit.authorEmail));
}
