import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import RosterPage from "@/app/(app)/roster/page";

// Same pattern as today-page.test.tsx: RosterPage is an async server
// component. Calling it directly and awaiting the returned element is the
// only way to exercise its branches without a running Next server.
const { getCurrentUserOrRedirect, apiClient } = vi.hoisted(() => ({
  getCurrentUserOrRedirect: vi.fn(),
  apiClient: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ getCurrentUserOrRedirect, apiClient }));

const { listBatches, getBatchRoster } = vi.hoisted(() => ({
  listBatches: vi.fn(),
  getBatchRoster: vi.fn(),
}));
vi.mock("@irp/client", () => ({ listBatches, getBatchRoster }));

// redirect() in real Next never returns — it throws a special NEXT_REDIRECT
// signal that framework internals catch. The mock reproduces just the
// "never returns normally" part with a private sentinel, so a test can
// assert the page's promise rejects with it rather than resolving to a
// rendered element.
const { redirect, REDIRECT_SENTINEL } = vi.hoisted(() => {
  const REDIRECT_SENTINEL = new Error("REDIRECT_SENTINEL");
  return {
    REDIRECT_SENTINEL,
    redirect: vi.fn(() => {
      throw REDIRECT_SENTINEL;
    }),
  };
});
vi.mock("next/navigation", () => ({ redirect }));

const ADMIN_USER = {
  id: "1",
  email: "mentor@bistec.test",
  displayName: "Dev Mentor",
  role: "Admin" as const,
};

const STUDENT_USER = {
  id: "2",
  email: "student@bistec.test",
  displayName: "Dev Student",
  role: "Student" as const,
};

const BATCH = { id: "b1", name: "Batch Aurora", startDate: "2026-05-10", endDate: "2026-11-09" };

describe("RosterPage", () => {
  it("redirects a Student caller to / rather than rendering the roster", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT_USER);

    await expect(
      RosterPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toBe(REDIRECT_SENTINEL);

    expect(redirect).toHaveBeenCalledWith("/");
    expect(listBatches).not.toHaveBeenCalled();
  });

  it("shows an empty state pointing at Students when there are no batches", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [] });

    render(await RosterPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("No batches yet.")).toBeInTheDocument();
    expect(screen.getByText(/Students page/)).toBeInTheDocument();
    expect(getBatchRoster).not.toHaveBeenCalled();
  });

  it("renders a roster row with the student's name, status pill, and extra count", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchRoster.mockResolvedValue({
      data: [
        {
          student: {
            id: "s1",
            displayName: "Amaya Perera",
            email: "a.perera@bistecglobal.com",
          },
          day: {
            date: "2026-07-31",
            status: "onTime",
            reportStatus: "Submitted",
            reportId: "r1",
            absenceReason: null,
            entries: [
              {
                id: "e1",
                entryDate: "2026-07-31",
                body: "Implemented the roster endpoint.",
                submittedAt: "2026-07-31T04:00:00.000Z",
                isLate: false,
                isExtra: false,
              },
            ],
          },
          hasMentorRecord: true,
          extraCountThisCycle: 2,
        },
      ],
      error: undefined,
    });

    render(
      await RosterPage({
        searchParams: Promise.resolve({ batchId: "b1", date: "2026-07-31" }),
      }),
    );

    expect(getBatchRoster).toHaveBeenCalledWith({
      client: {},
      path: { id: "b1" },
      query: { date: "2026-07-31" },
    });
    expect(screen.getByText("Amaya Perera")).toBeInTheDocument();
    expect(screen.getByText("On time")).toBeInTheDocument();
    expect(screen.getByText("+2 extra")).toBeInTheDocument();
    expect(screen.getByText("✓ recorded")).toBeInTheDocument();
  });

  it("renders the problem detail in a Panel when the SDK call errors", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchRoster.mockResolvedValue({
      data: undefined,
      error: {
        type: "about:blank",
        title: "Not found",
        status: 404,
        detail: "The batch does not exist.",
      },
    });

    render(await RosterPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("alert")).toHaveTextContent("The batch does not exist.");
  });
});
