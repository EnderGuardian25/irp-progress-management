import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AbsenceToggle } from "@/app/(app)/absence-toggle";

// absence-toggle.tsx imports markAbsent/removeAbsence via the relative
// specifier "./entry-actions"; mocking through the "@/" alias resolves to
// the same absolute file, same pattern as entry-composer.test.tsx.
const { markAbsent, removeAbsence } = vi.hoisted(() => ({
  markAbsent: vi.fn(),
  removeAbsence: vi.fn(),
}));

vi.mock("@/app/(app)/entry-actions", () => ({ markAbsent, removeAbsence }));

describe("AbsenceToggle", () => {
  it("offers a mark-absent form when nothing is recorded, with a 500-char reason cap", () => {
    render(<AbsenceToggle date="2026-07-31" absenceReason={null} />);
    const reason = screen.getByLabelText("Absence reason for 2026-07-31");
    expect(reason).toHaveAttribute("maxlength", "500");
    expect(screen.getByRole("button", { name: "Mark absent" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("shows the recorded reason and a Remove control once marked", () => {
    render(<AbsenceToggle date="2026-07-31" absenceReason="Medical appointment" />);
    expect(screen.getByText("Marked absent — Medical appointment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark absent" })).not.toBeInTheDocument();
  });

  it("surfaces markAbsent's error as role=alert -- the earlier plain-form wiring discarded this", async () => {
    markAbsent.mockResolvedValueOnce({ error: "The absence was not recorded." });
    render(<AbsenceToggle date="2026-07-31" absenceReason={null} />);

    fireEvent.change(screen.getByLabelText("Absence reason for 2026-07-31"), {
      target: { value: "Sick" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Mark absent" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The absence was not recorded.");
  });

  it("surfaces removeAbsence's error as role=alert", async () => {
    removeAbsence.mockResolvedValueOnce({ error: "The absence was not removed." });
    render(<AbsenceToggle date="2026-07-31" absenceReason="Medical appointment" />);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The absence was not removed.");
  });

  it("binds the fixed date into removeAbsence rather than reading it from form data", async () => {
    removeAbsence.mockResolvedValueOnce(null);
    render(<AbsenceToggle date="2026-07-31" absenceReason="Medical appointment" />);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await screen.findByRole("button", { name: "Remove" });
    expect(removeAbsence).toHaveBeenCalledWith("2026-07-31", null, expect.any(FormData));
  });
});
