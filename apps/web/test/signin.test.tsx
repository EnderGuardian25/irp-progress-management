import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DevIdentityPicker } from "@/app/(auth)/signin/dev-identity-picker";
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
