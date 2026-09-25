import { expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { renderRoute } from "../test/render-route";
import { ErrorPage } from "./error-page";
import { NotFoundPage } from "./not-found-page";
import { PendingPage } from "./pending-page";
import { createQueryClient } from "./query-client";
import { createAppRouter } from "./router";

test("the home path shows the landing page inside the main landmark", async () => {
  await renderRoute("/");
  const main = await screen.findByRole("main");
  expect(main.id).toBe("content");
  expect(screen.getByRole("heading", { level: 1 })).toBeDefined();
});

test("every page gets the app's loading, not-found and error screens", () => {
  const { options } = createAppRouter({ queryClient: createQueryClient() });
  expect(options.defaultPendingComponent).toBe(PendingPage);
  expect(options.defaultNotFoundComponent).toBe(NotFoundPage);
  expect(options.defaultErrorComponent).toBe(ErrorPage);
});
