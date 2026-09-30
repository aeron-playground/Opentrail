import { describe, expect, test } from "bun:test";
import type { WsServerMessage } from "@repo/shared/ws";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createFakeApi, FAKE_TOKENS } from "../../test/fake-api";
import { createFakeAuth, FAKE_TOKEN } from "../../test/fake-auth";
import { fakeSockets } from "../../test/fake-socket";
import { renderRoute } from "../../test/render-route";
import type { TokenListItem } from "./use-tokens";

async function explore({ api = createFakeApi(), signedIn = false } = {}) {
  const sockets = fakeSockets();
  const rendered = await renderRoute("/explore", {
    api,
    auth: createFakeAuth({ status: signedIn ? "signed-in" : "signed-out" }),
    liveSocket: sockets.create,
  });
  return { ...rendered, sockets, user: userEvent.setup() };
}

// What a screen reader reads: the text, without the parts marked aria-hidden (the icon's
// letter, the arrows).
function spoken(node: Node): string {
  if (node instanceof Element && node.getAttribute("aria-hidden") === "true") {
    return "";
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  return [...node.childNodes].map(spoken).join(" ");
}

// Each token row's words. The phone and desktop layouts are both in the page here, so a row
// reads its change twice.
const rows = () =>
  within(screen.getByRole("list", { name: "Tokens" }))
    .getAllByRole("listitem")
    .map((row) => spoken(row).replace(/\s+/g, " ").trim());
const symbols = () => rows().map((row) => row.split(" ")[0]);

// Ranked against both sort orders: by change JUP leads, by price SOL leads, and Bonk has
// neither.
const CHANGES: Record<string, Partial<TokenListItem>> = {
  SOL: { rank: 3 },
  JUP: { rank: 2, change24hPct: "5" },
  Bonk: { rank: 1 },
};
const RERANKED = FAKE_TOKENS.map((token) => ({ ...token, ...CHANGES[token.symbol] }));

describe("Explore", () => {
  test("lists the tokens in rank order, with price, 24-hour change and 7-day trend", async () => {
    await explore();
    await screen.findByText("Wrapped SOL");

    expect(rows()).toEqual([
      expect.stringMatching(/^SOL Wrapped SOL \$118\.93 \+0\.40%/),
      expect.stringMatching(/^JUP Jupiter \$0\.3250 −4\.82%/),
      expect.stringMatching(/^Bonk Bonk No price yet No 24-hour change yet/),
    ]);
    expect(screen.getByRole("img", { name: "7-day trend: up 2.5%" })).toBeDefined();
    expect(screen.getByRole("img", { name: "7-day trend: down 4.4%" })).toBeDefined();
    expect(screen.getByText("Chart data: GeckoTerminal")).toBeDefined();
  });

  test("shows a loading list until the tokens arrive", async () => {
    await explore();
    expect(screen.getByText("Loading tokens")).toBeDefined();
    await screen.findByText("Wrapped SOL");
    expect(screen.queryByText("Loading tokens")).toBeNull();
  });

  test("searches by name or symbol", async () => {
    const { user } = await explore();
    await screen.findByText("Wrapped SOL");
    const search = screen.getByLabelText("Search");

    await user.type(search, "jup");
    expect(symbols()).toEqual(["JUP"]);

    await user.clear(search);
    await user.type(search, "wrapped");
    expect(symbols()).toEqual(["SOL"]);
  });

  test("says when nothing matches, and clears the search", async () => {
    const { user } = await explore();
    await screen.findByText("Wrapped SOL");

    await user.type(screen.getByLabelText("Search"), "zzz");
    expect(screen.getByText('No tokens match "zzz".')).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(symbols()).toEqual(["SOL", "JUP", "Bonk"]);
  });

  test("sorts by 24-hour change or price, with unpriced tokens last", async () => {
    const { user } = await explore({ api: createFakeApi({ tokens: RERANKED }) });
    await screen.findByText("Wrapped SOL");
    expect(symbols()).toEqual(["Bonk", "JUP", "SOL"]);
    const sort = screen.getByLabelText("Sort by");

    await user.selectOptions(sort, "change");
    expect(symbols()).toEqual(["JUP", "SOL", "Bonk"]);

    await user.selectOptions(sort, "price");
    expect(symbols()).toEqual(["SOL", "JUP", "Bonk"]);

    await user.selectOptions(sort, "rank");
    expect(symbols()).toEqual(["Bonk", "JUP", "SOL"]);
  });

  test("says when the list can't load, and tries again", async () => {
    const api = createFakeApi({ tokensFail: true });
    const { user } = await explore({ api });
    // One retry first, as every query does.
    expect(
      await screen.findByText("We couldn't load the tokens. Try again.", {}, { timeout: 3000 }),
    ).toBeDefined();

    api.setTokensFail(false);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Wrapped SOL")).toBeDefined();
  });

  test("says when no token is listed", async () => {
    await explore({ api: createFakeApi({ tokens: [] }) });
    expect(await screen.findByText("No tokens are listed yet.")).toBeDefined();
  });
});

describe("live prices on Explore", () => {
  const price = (items: { mint: string; priceUsd: string; change24hPct: string | null }[]) =>
    JSON.stringify({ v: 1, type: "price", items } satisfies WsServerMessage);

  test("subscribe to prices without sign-in, and update a row as a price arrives", async () => {
    const { sockets } = await explore();
    await screen.findByText("Wrapped SOL");
    await waitFor(() => expect(sockets.all).toHaveLength(1));
    const socket = sockets.latest();
    await act(async () => socket.opened());
    await waitFor(() => expect(socket.sent).toEqual([{ type: "subscribe", channel: "prices" }]));

    await act(async () =>
      socket.receive(
        price([{ mint: FAKE_TOKENS[0]?.mint ?? "", priceUsd: "121.5", change24hPct: "2.5" }]),
      ),
    );

    // The query tells the page about new data a moment later, not at once.
    await waitFor(() => expect(rows()[0]).toMatch(/^SOL Wrapped SOL \$121\.50 \+2\.50%/));
    expect(rows()[1]).toMatch(/^JUP Jupiter \$0\.3250 /);
  });

  test("close a signed-out visitor's connection when they leave Explore", async () => {
    const { sockets, router } = await explore();
    await waitFor(() => expect(sockets.all).toHaveLength(1));

    await act(() => router.navigate({ to: "/" }));

    await waitFor(() => expect(sockets.latest().closedWith).toBe(1000));
  });

  test("add prices to a signed-in connection, keeping it", async () => {
    const { sockets } = await explore({ signedIn: true });
    await waitFor(() => expect(sockets.all).toHaveLength(1));
    const socket = sockets.latest();
    await act(async () => socket.opened());

    await waitFor(() =>
      expect(socket.sent).toEqual([
        { type: "auth", token: FAKE_TOKEN },
        { type: "subscribe", channel: "me" },
        { type: "subscribe", channel: "prices" },
      ]),
    );
  });
});
