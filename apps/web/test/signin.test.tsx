import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DevIdentityPicker } from "@/app/(auth)/signin/dev-identity-picker";
import { SignInPanel } from "@/app/(auth)/signin/sign-in-panel";
import NotRegisteredPage from "@/app/(auth)/not-registered/page";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
}));

// Real next-auth (imported transitively via @/auth) needs `next/server`,
// which isn't resolvable under Vitest's environment — mock the app's thin
// wrapper instead of the whole next-auth package.
vi.mock("@/auth", () => ({
  signOut: vi.fn(),
}));

describe("DevIdentityPicker", () => {
  it("offers every dev identity as its own button", () => {
    render(<DevIdentityPicker />);
    expect(screen.getByRole("button", { name: /Mentor \(Admin\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Student$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Unregistered user/ })).toBeInTheDocument();
  });

  it("says plainly that the unregistered identity is expected to 403", () => {
    render(<DevIdentityPicker />);
    expect(screen.getByRole("button", { name: /expect 403/ })).toBeInTheDocument();
  });

  it("warns that this is a development bypass", () => {
    render(<DevIdentityPicker />);
    expect(screen.getByText(/development/i)).toBeInTheDocument();
  });
});

describe("NotRegisteredPage", () => {
  it("never links to /signin — a valid unregistered session would loop forever", () => {
    render(<NotRegisteredPage />);
    expect(screen.queryByRole("link", { name: /sign in/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });
});

describe("SignInPanel", () => {
  it("offers the dev identity picker when the bypass is on", () => {
    render(<SignInPanel bypassEnabled entraConfigured={false} signInAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Mentor \(Admin\)/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sign in with Microsoft/ })).not.toBeInTheDocument();
  });

  it("offers the Microsoft button when Entra is configured and the bypass is off", () => {
    render(<SignInPanel bypassEnabled={false} entraConfigured signInAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Sign in with Microsoft/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mentor \(Admin\)/ })).not.toBeInTheDocument();
  });

  // The deployed environment. This is the state that did not exist before Plan
  // 4B created an environment able to reach it.
  it("offers NO sign-in control when neither the bypass nor Entra is available", () => {
    render(<SignInPanel bypassEnabled={false} entraConfigured={false} signInAction={vi.fn()} />);
    // Assert NO button of ANY name, not just that these two specific labels are
    // absent — this is the state the whole task exists for, and a differently
    // labelled control is exactly the regression that matters. The two named
    // negatives stay as documentation of the states being ruled out.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Sign in with Microsoft/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mentor \(Admin\)/ })).not.toBeInTheDocument();
  });

  it("says plainly that sign-in is not configured, and names what is missing", () => {
    render(<SignInPanel bypassEnabled={false} entraConfigured={false} signInAction={vi.fn()} />);
    expect(screen.getByText(/not configured/i)).toBeInTheDocument();
    expect(screen.getByText(/AUTH_MICROSOFT_ENTRA_ID/)).toBeInTheDocument();
  });

  // The bypass must never win in a deployed environment. It cannot be set there
  // (ADR-0012's guard), but the panel should not be the thing relying on that.
  it("prefers the bypass over Entra when both are somehow present", () => {
    render(<SignInPanel bypassEnabled entraConfigured signInAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Mentor \(Admin\)/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sign in with Microsoft/ })).not.toBeInTheDocument();
  });
});

// This invariant is NOT covered by rendering tests: SignInPanel takes its flags
// as props, so deleting `export const dynamic = "force-dynamic"` from page.tsx
// leaves every other test passing while /signin silently returns to being
// statically prerendered — baking one of three states into signin.html at build
// time and breaking the config-only Entra cutover documented in the Plan 3 spec
// §7. Assert the export directly, since that is the thing a future edit would
// remove.
describe("the /signin route segment config", () => {
  it("is force-dynamic, so the three states follow runtime configuration", async () => {
    const page = await import("@/app/(auth)/signin/page");
    expect(page.dynamic).toBe("force-dynamic");
  });
});
