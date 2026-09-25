import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Glob } from "bun";

const DIR = join(import.meta.dir, "docs/developers/decisions");
const RECORDS = Array.from(new Glob("[0-9][0-9][0-9][0-9]-*.mdx").scanSync({ cwd: DIR })).sort();
const INDEX = readFileSync(join(DIR, "index.mdx"), "utf8");
const SECTIONS = ["## Status", "## Context", "## Decision", "## Consequences"];

test("records are numbered from 0001 with no gaps", () => {
  expect(RECORDS.length).toBeGreaterThan(0);
  expect(RECORDS.map((file) => Number(file.slice(0, 4)))).toEqual(
    RECORDS.map((_, index) => index + 1),
  );
});

describe.each(RECORDS)("%s", (file) => {
  const text = readFileSync(join(DIR, file), "utf8");
  const number = file.slice(0, 4);

  test("has a title with its number", () => {
    expect(text).toMatch(new RegExp(`^---\\ntitle: "ADR ${number}: .+"\\n`));
  });

  test("follows the template: status, context, decision, consequences", () => {
    const positions = SECTIONS.map((heading) => text.indexOf(`\n${heading}\n`));
    expect(positions.every((position) => position > 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test("has a status with a date", () => {
    expect(text).toMatch(
      /## Status\n\n(Proposed|Accepted|Superseded|Deprecated)\b[^\n]*\d{4}-\d{2}-\d{2}/,
    );
  });

  test("is listed on the index page", () => {
    expect(INDEX).toContain(`(./${file})`);
  });
});
