// Commit-msg hook: rejects a commit whose message has no DCO sign-off by its author.
import { isSignedOffBy } from "./lib/dco";

const [flag, messageFile] = Bun.argv.slice(2);
if (flag !== "--message-file" || messageFile === undefined) {
  console.error("Usage: bun scripts/check-dco.ts --message-file <path>");
  process.exit(2);
}

const message = await Bun.file(messageFile).text();
const authorEmail = readAuthorEmail();

if (!isSignedOffBy(message, authorEmail)) {
  console.error(
    [
      `This commit has no sign-off for ${authorEmail || "the author"}.`,
      "Commit again with: git commit -s",
      "Signing off means you have the right to submit this change: https://developercertificate.org",
    ].join("\n"),
  );
  process.exit(1);
}

// `git var` gives the identity git will record as the author, including GIT_AUTHOR_EMAIL overrides.
function readAuthorEmail(): string {
  const ident = Bun.spawnSync(["git", "var", "GIT_AUTHOR_IDENT"]).stdout.toString();
  return /<([^>]*)>/.exec(ident)?.[1] ?? "";
}
