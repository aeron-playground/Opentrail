import { expect, test } from "bun:test";
import { join } from "node:path";
import { Glob } from "bun";

const ROOT = join(import.meta.dir, "..");
const DOCKERFILES = [".devcontainer/Dockerfile", "apps/*/Dockerfile"];

// Bun's version is written in several places. If they drift apart, local, CI, dev container and
// image builds run different Bun versions against the same lockfile.
test("every Dockerfile uses the Bun version from packageManager in package.json", async () => {
  const { packageManager } = (await Bun.file(join(ROOT, "package.json")).json()) as {
    packageManager: string;
  };
  const expected = packageManager.replace(/^bun@/, "");

  const dockerfiles = DOCKERFILES.flatMap((pattern) =>
    Array.from(new Glob(pattern).scanSync({ cwd: ROOT, dot: true })),
  ).sort();
  expect(dockerfiles).toEqual(
    expect.arrayContaining([".devcontainer/Dockerfile", "apps/api/Dockerfile"]),
  );

  const found: { file: string; version: string | undefined }[] = [];
  for (const file of dockerfiles) {
    const text = await Bun.file(join(ROOT, file)).text();
    for (const match of text.matchAll(/oven\/bun:(\d+\.\d+\.\d+)/g)) {
      found.push({ file, version: match[1] });
    }
  }
  expect(found.length).toBeGreaterThanOrEqual(dockerfiles.length);
  expect(found).toEqual(found.map(({ file }) => ({ file, version: expected })));
});
