import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MentorToday } from "@/app/(app)/mentor-today";

const { apiClient } = vi.hoisted(() => ({ apiClient: vi.fn() }));
vi.mock("@/lib/api-client", () => ({ apiClient }));

const { listBatches, getBatchDashboardToday } = vi.hoisted(() => ({
  listBatches: vi.fn(),
  getBatchDashboardToday: vi.fn(),
}));
vi.mock("@irp/client", () => ({ listBatches, getBatchDashboardToday }));

const BATCH = { id: "b1", name: "Batch Aurora", startDate: "2026-05-10", endDate: "2026-11-09" };

const dashboard = (over: Record<string, unknown> = {}) => ({
  batchId: "b1",
  batchName: "Batch Aurora",
  date: "2026-08-03",
  isFallbackDay: false,
  dayNumber: 17,
  cycle: { seq: 3, startDate: "2026-07-10", endDate: "2026-08-09", requiredDayCount: 22 },
  counts: { date: "2026-08-03", enrolled: 10, submitted: 8, late: 2, absent: 1, missed: 0, pending: 1 },
  extraCount: 3,
  days: [
    { date: "2026-07-31", enrolled: 10, submitted: 10, late: 0, absent: 0, missed: 0, pending: 0 },
    { date: "2026-08-03", enrolled: 10, submitted: 8, late: 2, absent: 1, missed: 0, pending: 1 },
  ],
  extraAfter: ["2026-07-31"],
  ...over,
});

describe("MentorToday", () => {
  // Every test sets its own mock return values, but vi.fn() call COUNTS
  // accumulate across tests without this -- and one test asserts a mock was
  // never called, which silently reads the previous tests' calls otherwise.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders FR-28's figures — N of M, late, absent — for each batch", async () => {
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardToday.mockResolvedValue({ data: dashboard(), error: undefined });

    render(await MentorToday({ displayName: "Dev Mentor", role: "Admin" }));

    // The batch name is the section's accessible name, not a standalone text
    // node -- it is rendered inside the ribbon's composite label. This is also
    // the locator Task 10's Playwright suite uses.
    expect(screen.getByRole("region", { name: "Batch Aurora" })).toBeInTheDocument();
    expect(screen.getByTestId("submitted-count-b1")).toHaveTextContent("8 of 10 submitted");
    expect(screen.getByTestId("late-count-b1")).toHaveTextContent("2 late");
    expect(screen.getByTestId("absent-count-b1")).toHaveTextContent("1 absent");
    expect(screen.getByTestId("missed-count-b1")).toHaveTextContent("0 missed");
  });

  it("labels the day as an earlier one when isFallbackDay is set — a weekend must not read as today", async () => {
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardToday.mockResolvedValue({
      data: dashboard({ isFallbackDay: true, date: "2026-07-31" }),
      error: undefined,
    });

    render(await MentorToday({ displayName: "Dev Mentor", role: "Admin" }));

    expect(screen.getByTestId("day-label-b1")).toHaveTextContent(/Friday 31 July/);
    expect(screen.getByTestId("day-label-b1")).toHaveTextContent(/last required day/i);
  });

  it("renders one ribbon per batch, with the cycle label and the required-day count", async () => {
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH, { ...BATCH, id: "b2", name: "Batch Basalt" }] });
    getBatchDashboardToday.mockResolvedValue({ data: dashboard(), error: undefined });

    render(await MentorToday({ displayName: "Dev Mentor", role: "Admin" }));

    expect(screen.getAllByRole("figure")).toHaveLength(2);
    expect(screen.getAllByText(/Cycle 3 · Day 17 of 22/).length).toBeGreaterThan(0);
  });

  it("says the cycle has not opened when seq is null, rather than printing Cycle null", async () => {
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardToday.mockResolvedValue({
      data: dashboard({ cycle: { seq: null, startDate: "2026-11-10", endDate: "2026-12-09", requiredDayCount: 22 } }),
      error: undefined,
    });

    render(await MentorToday({ displayName: "Dev Mentor", role: "Admin" }));

    expect(screen.getByText(/first evaluated cycle/i)).toBeInTheDocument();
    expect(screen.queryByText(/Cycle null/)).not.toBeInTheDocument();
  });

  it("renders the problem detail and still keeps the identity testids when listBatches itself errors", async () => {
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({
      data: undefined,
      error: { type: "about:blank", title: "Internal Server Error", status: 500, detail: "Could not load batches." },
    });

    render(await MentorToday({ displayName: "Dev Mentor", role: "Admin" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Could not load batches.");
    expect(screen.getByTestId("user-name")).toHaveTextContent("Dev Mentor");
    expect(screen.getByTestId("user-role")).toHaveTextContent("Admin");
  });

  it("shows an empty state pointing at Students when there are no batches", async () => {
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [] });

    render(await MentorToday({ displayName: "Dev Mentor", role: "Admin" }));

    expect(screen.getByText("No batches yet.")).toBeInTheDocument();
    expect(getBatchDashboardToday).not.toHaveBeenCalled();
  });

  it("renders a problem detail per failing batch, without losing the batches that loaded", async () => {
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH, { ...BATCH, id: "b2", name: "Batch Basalt" }] });
    getBatchDashboardToday
      .mockResolvedValueOnce({ data: dashboard(), error: undefined })
      .mockResolvedValueOnce({
        data: undefined,
        error: { type: "about:blank", title: "Internal Server Error", status: 500, detail: "Aggregation failed." },
      });

    render(await MentorToday({ displayName: "Dev Mentor", role: "Admin" }));

    expect(screen.getByTestId("submitted-count-b1")).toHaveTextContent("8 of 10 submitted");
    expect(screen.getByRole("alert")).toHaveTextContent("Aggregation failed.");
  });

  it("omits the extra-this-cycle line when extraCount is zero", async () => {
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardToday.mockResolvedValue({ data: dashboard({ extraCount: 0 }), error: undefined });

    render(await MentorToday({ displayName: "Dev Mentor", role: "Admin" }));

    expect(screen.queryByText(/extra this cycle/)).not.toBeInTheDocument();
  });

  it("keeps the sign-in chain's identity testids on the mentor branch", async () => {
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [] });

    render(await MentorToday({ displayName: "Dev Mentor", role: "Admin" }));

    expect(screen.getByTestId("user-name")).toHaveTextContent("Dev Mentor");
    expect(screen.getByTestId("user-role")).toHaveTextContent("Admin");
  });
});
