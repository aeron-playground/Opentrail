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
