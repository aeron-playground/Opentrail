import createClient, { type Client, type ClientOptions } from "openapi-fetch";
import type { paths } from "./schema";

export type { components, paths } from "./schema";

export type ApiClient = Client<paths>;

// A typed client for the API. Paths, parameters and response bodies all come from the
// committed openapi.json, so a route change that breaks a caller fails the typecheck.
export function createApiClient(
  baseUrl: string,
  options: Omit<ClientOptions, "baseUrl"> = {},
): ApiClient {
  return createClient<paths>({ ...options, baseUrl });
}
