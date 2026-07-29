import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageShell } from "@/app/layout";

describe("PageShell", () => {
  it("renders its children", () => {
    render(<PageShell><p>hello</p></PageShell>);
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("enforces the desktop-only minimum width from NFR-13", () => {
    const { container } = render(<PageShell><span /></PageShell>);
    const shell = container.firstElementChild;
    expect(shell?.className).toContain("min-w-[1280px]");
    expect(shell?.className).toContain("min-h-dvh");
  });
});
