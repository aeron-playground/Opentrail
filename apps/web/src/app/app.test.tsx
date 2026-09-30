import { expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import { TOKENS_QUERY_KEY } from "../features/tokens/query-keys";
import { BALANCES_QUERY_KEY } from "../features/wallet/query-keys";
import { createFakeAuth } from "../test/fake-auth";
import { renderRoute } from "../test/render-route";

test("signing out removes the person's data, and keeps data that's the same for everyone", async () => {
  const auth = createFakeAuth({ status: "signed-in" });
  const { queryClient } = await renderRoute("/explore", { auth });
  await screen.findByText("Wrapped SOL");
  queryClient.setQueryData(BALANCES_QUERY_KEY, { items: [] });

  await auth.setState({ status: "signed-out" });

  expect(queryClient.getQueryData(BALANCES_QUERY_KEY)).toBeUndefined();
  expect(queryClient.getQueryData(TOKENS_QUERY_KEY)).toBeDefined();
});
