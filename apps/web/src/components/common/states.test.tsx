import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { OfflineBanner } from "./offline-banner";

describe("EmptyState", () => {
  test("shows one line and its action", () => {
    render(
      <EmptyState message="Nothing here yet." action={<button type="button">Add one</button>} />,
    );
    expect(screen.getByText("Nothing here yet.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Add one" })).toBeDefined();
  });
});

describe("ErrorState", () => {
  test("says what happened, and Try again retries", () => {
    const onRetry = mock(() => {});
    render(<ErrorState onRetry={onRetry} />);
    expect(screen.getByRole("alert").textContent).toContain("Something went wrong on our side.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("can say something more specific", () => {
    render(<ErrorState message="Prices didn't load. Try again." onRetry={() => {}} />);
    expect(screen.getByRole("alert").textContent).toContain("Prices didn't load.");
  });
});

describe("OfflineBanner", () => {
  // happy-dom's navigator is always online; tests switch it through this property.
  const original = Object.getOwnPropertyDescriptor(navigator, "onLine");
  function setOnline(online: boolean) {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
    act(() => {
      window.dispatchEvent(new Event(online ? "online" : "offline"));
    });
  }

  afterEach(() => {
    if (original) {
      Object.defineProperty(navigator, "onLine", original);
    } else {
      Reflect.deleteProperty(navigator, "onLine");
    }
  });

  test("stays silent while online, speaks up when the connection drops, then clears", () => {
    render(<OfflineBanner />);
    const region = screen.getByRole("status");
    expect(region.textContent).toBe("");

    setOnline(false);
    expect(region.textContent).toContain("You're offline.");

    setOnline(true);
    expect(region.textContent).toBe("");
  });
});
