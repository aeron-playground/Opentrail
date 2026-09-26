import { type ApiClient, createApiClient } from "@repo/api-client";

export type { ApiClient };

// An answer from the API that isn't a success. `code` is the stable error code, such as
// UNAUTHORIZED; `message` is the sentence the API wrote for people.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function isApiError(error: unknown, code: string): error is ApiError {
  return error instanceof ApiError && error.code === code;
}

// Every request carries the person's access token when they're signed in.
export function createWebApi(
  baseUrl: string,
  getAccessToken: () => Promise<string | null>,
  fetchImpl?: (request: Request) => Promise<Response>,
): ApiClient {
  const client = createApiClient(baseUrl, fetchImpl ? { fetch: fetchImpl } : {});
  client.use({
    async onRequest({ request }) {
      const token = await getAccessToken();
      if (token) {
        request.headers.set("Authorization", `Bearer ${token}`);
      }
      return request;
    },
  });
  return client;
}

type Result<T> = { data?: T; error?: unknown; response: Response };

// The data of a successful answer, or an ApiError built from the shared error shape.
export function unwrap<T>({ data, error, response }: Result<T>): T {
  if (response.ok && data !== undefined) {
    return data;
  }
  const body = (error as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
  throw new ApiError(
    response.status,
    typeof body?.code === "string" ? body.code : "UNKNOWN",
    typeof body?.message === "string" ? body.message : "Something went wrong. Try again.",
  );
}
