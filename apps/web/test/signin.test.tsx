import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DevIdentityPicker } from "@/app/(auth)/signin/dev-identity-picker";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
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
