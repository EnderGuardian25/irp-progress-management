import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/app-frame/sidebar";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

describe("Sidebar Settings entry", () => {
  it("offers Settings to a mentor", () => {
    render(<Sidebar role="Admin" />);
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("offers Settings to a student too — the theme is theirs as much as a mentor's", () => {
    render(<Sidebar role="Student" />);
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("renders Settings LAST, after every primary destination", () => {
    render(<Sidebar role="Admin" />);
    const labels = screen.getAllByRole("link").map((a) => a.textContent?.trim());
    expect(labels.at(-1)).toBe("Settings");
  });

  it("does not add Settings to the primary role lists", () => {
    // Students see two primary destinations (Today, My month) plus Settings.
    render(<Sidebar role="Student" />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });
});
