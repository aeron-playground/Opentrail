import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Button } from "./button";

describe("Button", () => {
  test("is a plain button by default, so it never submits a form by accident", () => {
    render(<Button>Follow</Button>);
    expect(screen.getByRole("button", { name: "Follow" }).getAttribute("type")).toBe("button");
  });

  test("can be a submit button", () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("type")).toBe("submit");
  });

  const variants: {
    variant: "primary" | "secondary" | "ghost" | "buy" | "sell";
    has: string;
    lacks: string;
  }[] = [
    { variant: "primary", has: "bg-ink", lacks: "bg-gain" },
    { variant: "secondary", has: "border-line", lacks: "bg-ink" },
    { variant: "ghost", has: "hover:bg-paper-2", lacks: "bg-ink" },
    { variant: "buy", has: "bg-gain", lacks: "bg-loss" },
    { variant: "sell", has: "bg-loss", lacks: "bg-gain" },
  ];

  for (const { variant, has, lacks } of variants) {
    test(`${variant} uses its own colors`, () => {
      render(<Button variant={variant}>Go</Button>);
      const classes = screen.getByRole("button").className.split(" ");
      expect(classes).toContain(has);
      expect(classes).not.toContain(lacks);
    });
  }

  test("every size keeps the 44 px tap target", () => {
    render(
      <>
        <Button>Text</Button>
        <Button size="icon" aria-label="Close" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Text" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "Close" }).className).toContain("size-11");
  });

  test("a class from outside wins over the built-in one of the same kind", () => {
    render(<Button className="px-6">Wide</Button>);
    const classes = screen.getByRole("button").className.split(" ");
    expect(classes).toContain("px-6");
    expect(classes).not.toContain("px-4");
  });
});
