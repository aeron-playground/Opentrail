import { loader } from "fumadocs-core/source";
import { docs } from "../.source/server";
import { API_PAGES, openapi } from "./openapi";

// One page tree for the written pages and the API reference, which is built from the API
// contract at build time, so it can't drift from the routes.
export const source = loader({
  baseUrl: "/",
  source: {
    docs: docs.toFumadocsSource(),
    api: await openapi.staticSource(API_PAGES),
  },
  plugins: [openapi.loaderPlugin()],
});
