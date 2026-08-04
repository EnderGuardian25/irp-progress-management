import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeControl } from "@/app/(app)/settings/theme-control";

const { setTheme } = vi.hoisted(() => ({ setTheme: vi.fn() }));
vi.mock("@/app/(app)/settings/theme-actions", () => ({ setTheme }));

beforeEach(() => {
  vi.clearAllMocks();
  setTheme.mockResolvedValue(null);
  delete document.documentElement.dataset.theme;
});

describe("ThemeControl", () => {
  it("marks the current choice from its server-supplied prop", () => {
    render(<ThemeControl current="dark" />);
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Light" })).not.toBeChecked();
  });

  it("offers a text label per option, never colour alone (§12)", () => {
    render(<ThemeControl current="system" />);
    for (const name of ["Light", "Dark", "Follow system"]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
  });

  it("stamps the attribute IMMEDIATELY on choose, before the action resolves", () => {
    // A theme switch that waits for a round trip reads as broken. The action is
    // left unresolved here on purpose: the DOM must already be right.
    setTheme.mockReturnValue(new Promise(() => undefined));
    render(<ThemeControl current="system" />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("REMOVES the attribute for system rather than setting it to a string", () => {
    render(<ThemeControl current="dark" />);
    document.documentElement.dataset.theme = "dark";
    fireEvent.click(screen.getByRole("radio", { name: "Follow system" }));
    // data-theme="system" would in fact still work — the media query's
    // :not([data-theme="light"]) matches it. But absence is the contract the
    // server side uses (layout.tsx omits the attribute for system), and having
    // the client agree means one shape to reason about rather than two that
    // happen to behave alike.
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("persists the choice through the action", async () => {
    render(<ThemeControl current="system" />);
    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    await waitFor(() => {
      expect(setTheme).toHaveBeenCalledWith("light");
    });
  });

  it("surfaces a rejection instead of silently keeping the new look", async () => {
    setTheme.mockResolvedValue({ error: "That is not a theme this app offers." });
    render(<ThemeControl current="system" />);
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/not a theme/i);
    });
  });
});
