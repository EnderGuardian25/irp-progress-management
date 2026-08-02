import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EntryComposer } from "@/app/(app)/entry-composer";

// vi.mock's factory is hoisted above this file's other statements, so it
// cannot close over a plain top-level `const` -- vi.hoisted() runs first and
// hands back a reference the factory can use safely.
const { submitEntry } = vi.hoisted(() => ({ submitEntry: vi.fn() }));

// entry-composer.tsx imports submitEntry via the relative specifier
// "./entry-actions". Vitest's mock registry keys by resolved absolute
// module, so mocking through the "@/" alias here replaces the same file
// regardless of which specifier each side spells it with.
vi.mock("@/app/(app)/entry-actions", () => ({ submitEntry }));

describe("EntryComposer", () => {
  it("offers only the given target dates as options, most recent first", () => {
    render(<EntryComposer targetDates={["2026-07-31", "2026-07-30"]} />);
    const select = screen.getByLabelText("Entry date");
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.getAttribute("value"));
    expect(options).toEqual(["2026-07-31", "2026-07-30"]);
  });

  it("defaults to the oldest offered date -- the one whose grace closes soonest", () => {
    render(<EntryComposer targetDates={["2026-07-31", "2026-07-30"]} />);
    expect(screen.getByLabelText("Entry date")).toHaveValue("2026-07-30");
  });

  it("renders no error before any submission", () => {
    render(<EntryComposer targetDates={["2026-07-31"]} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces the action's error message as a role=alert on failure", async () => {
    submitEntry.mockResolvedValueOnce({ error: "The entry was not accepted." });
    render(<EntryComposer targetDates={["2026-07-31"]} />);

    fireEvent.change(screen.getByLabelText("Entry text"), {
      target: { value: "Worked on the composer." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit update" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The entry was not accepted.");
  });

  it("submits the selected date and body through the action", async () => {
    submitEntry.mockResolvedValueOnce(null);
    render(<EntryComposer targetDates={["2026-07-31"]} />);

    fireEvent.change(screen.getByLabelText("Entry text"), {
      target: { value: "Worked on the composer." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit update" }));

    await screen.findByRole("button", { name: "Submit update" });
    expect(submitEntry).toHaveBeenCalled();
    const [, formData] = submitEntry.mock.calls[0] as [unknown, FormData];
    expect(formData.get("entryDate")).toBe("2026-07-31");
    expect(formData.get("body")).toBe("Worked on the composer.");
  });
});
