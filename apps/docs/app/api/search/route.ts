import { createFromSource } from "fumadocs-core/search/server";
import { source } from "../../../lib/source";

// Written out as a static file at build time; the browser downloads it and searches locally.
export const revalidate = false;

export const { staticGET: GET } = createFromSource(source, { language: "english" });
