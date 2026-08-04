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
    // The mount-time DOM reconciliation (below) reads the live attribute too,
    // so it is set here to agree with `current` — exactly as it does in the
    // real app, where both are read from the same cookie on the same request.
    document.documentElement.dataset.theme = "dark";
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
    // Set BEFORE render, matching `current`: the mount-time DOM reconciliation
    // (below) would otherwise read the beforeEach-cleared attribute, disagree
    // with "dark", flip `selected` to "system", and leave the "Follow system"
    // radio already checked — at which point clicking it fires no change
    // event at all and the assertion below would pass for the wrong reason
    // (nothing happened) rather than the right one (choose() ran).
    document.documentElement.dataset.theme = "dark";
    render(<ThemeControl current="dark" />);
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
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/not a theme/i);
      // The reversion clause must name the ORIGINAL current prop ("system" ->
      // "Follow system"), not the newly clicked option ("dark" -> "Dark"). The
      // positive assertion alone would stay green even if the component were
      // edited to close over the new selection instead of `current` — the
      // negative half is what actually pins that distinction.
      expect(alert).toHaveTextContent(/Follow system/i);
      expect(alert).not.toHaveTextContent(/\bDark\b/);
    });
  });

  // Plan 7B, Task 9: seeding the radio from a stale server prop alone is what
  // let it read as nothing-checked after a browser back-navigation, since
  // Next's client router cache can replay an older `current` prop than what
  // is actually stamped on <html> at that moment (docs/interview-and-prd.md
  // O-16). These pin the mount-time DOM reconciliation that fixes the radio
  // group specifically — it does not and cannot fix the page-repaint half of
  // O-16, which needs its own ADR.
  it("reconciles from the live DOM after mount, overriding a stale server prop", () => {
    // The DOM says dark; the prop says system — the disagreement a stale
    // router-cache replay of `current` produces while <html data-theme> has
    // already moved on.
    document.documentElement.dataset.theme = "dark";
    render(<ThemeControl current="system" />);
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Follow system" })).not.toBeChecked();
  });

  it("reconciles to Follow system when the live DOM carries no data-theme attribute", () => {
    // "system" is stamped by ABSENCE, never the literal string — mirroring
    // layout.tsx and the `choose` function above.
    delete document.documentElement.dataset.theme;
    render(<ThemeControl current="dark" />);
    expect(screen.getByRole("radio", { name: "Follow system" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Dark" })).not.toBeChecked();
  });
});
