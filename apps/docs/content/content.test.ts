import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, normalize } from "node:path";
import { APP_NAME } from "@repo/shared";
import { Glob } from "bun";
import { API_PAGES } from "../lib/openapi";
import { pageFrontmatter } from "../lib/page-frontmatter";

const ROOT = join(import.meta.dir, "docs");
const PAGES = Array.from(new Glob("**/*.mdx").scanSync({ cwd: ROOT })).sort();
const METAS = Array.from(new Glob("**/meta.json").scanSync({ cwd: ROOT })).sort();

function readPage(page: string) {
  const text = readFileSync(join(ROOT, page), "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  return {
    frontmatter: match?.[1] === undefined ? undefined : Bun.YAML.parse(match[1]),
    text,
    body: match ? text.slice(match[0].length) : text,
  };
}

// Prose only: code and addresses may spell the name, like a repository URL or an image name.
function prose(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/https?:\/\/\S+/g, "");
}

// A link to another page resolves to an .mdx file, a folder with an index page, or the API
// reference that is built from the contract.
function linkTargetExists(page: string, href: string) {
  const path = href.split("#")[0] ?? "";
  if (path === "") {
    return true;
  }
  const target = path.startsWith("/")
    ? normalize(path.slice(1))
    : normalize(join(dirname(page), path));
  if (target.startsWith(API_PAGES.baseDir)) {
    return true;
  }
  const withoutExtension = target.replace(/\.mdx$/, "");
  return [`${withoutExtension}.mdx`, join(withoutExtension, "index.mdx")].some((candidate) =>
    existsSync(join(ROOT, candidate)),
  );
}

test("the page tree has the guides, how-it-works and developer pages", () => {
  expect(PAGES).toEqual(
    expect.arrayContaining([
      "index.mdx",
      "getting-started/create-account.mdx",
      "how-it-works/fees.mdx",
      "developers/local-setup.mdx",
      "developers/api/index.mdx",
    ]),
  );
});

describe.each(PAGES)("%s", (page) => {
  const { frontmatter, text, body } = readPage(page);

  test("has a title and a description", () => {
    expect(pageFrontmatter.safeParse(frontmatter).error?.issues).toBeUndefined();
  });

  test("writes %APP_NAME% instead of the product name", () => {
    expect(prose(text).toLowerCase()).not.toContain(APP_NAME.toLowerCase());
  });

  test("links only to pages that exist", () => {
    const hrefs = Array.from(body.matchAll(/\]\(([^)\s]+)\)/g), (match) => match[1] ?? "");
    const internal = hrefs.filter((href) => !/^(https?:|mailto:|#)/.test(href));
    expect(internal.filter((href) => !linkTargetExists(page, href))).toEqual([]);
  });
});

describe.each(METAS)("%s", (meta) => {
  const folder = dirname(meta) === "." ? "" : dirname(meta);
  const { pages } = JSON.parse(readFileSync(join(ROOT, meta), "utf8")) as { pages?: string[] };

  test("lists only pages and folders that exist", () => {
    const missing = (pages ?? []).filter(
      (entry) =>
        !existsSync(join(ROOT, folder, `${entry}.mdx`)) &&
        !existsSync(join(ROOT, folder, entry)) &&
        !(folder === "developers" && entry === "api"),
    );
    expect(missing).toEqual([]);
  });

  // A folder with its own order hides every page that isn't in the list.
  test("lists every page in its folder", () => {
    if (pages === undefined) {
      return;
    }
    const here = PAGES.filter((page) => dirname(page) === (folder || "."))
      .map((page) => basename(page, ".mdx"))
      .filter((name) => name !== "index" || folder === "");
    const subfolders = new Set(
      PAGES.filter((page) => folder === "" || page.startsWith(`${folder}/`))
        .map((page) => page.slice(folder === "" ? 0 : folder.length + 1).split("/"))
        .filter((parts) => parts.length > 1)
        .map((parts) => parts[0] ?? ""),
    );
    expect([...here, ...subfolders].filter((name) => !pages.includes(name))).toEqual([]);
  });
});
