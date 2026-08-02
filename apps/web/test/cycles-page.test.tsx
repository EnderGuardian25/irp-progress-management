import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CyclesPage from "@/app/(app)/cycles/page";

const { getCurrentUserOrRedirect, apiClient } = vi.hoisted(() => ({
  getCurrentUserOrRedirect: vi.fn(),
  apiClient: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ getCurrentUserOrRedirect, apiClient }));

const { listBatches, getBatchDashboardSummary } = vi.hoisted(() => ({
  listBatches: vi.fn(),
  getBatchDashboardSummary: vi.fn(),
}));
vi.mock("@irp/client", () => ({ listBatches, getBatchDashboardSummary }));

const { redirect, REDIRECT_SENTINEL } = vi.hoisted(() => {
  const REDIRECT_SENTINEL = new Error("REDIRECT_SENTINEL");
  return { REDIRECT_SENTINEL, redirect: vi.fn(() => { throw REDIRECT_SENTINEL; }) };
});
vi.mock("next/navigation", () => ({ redirect }));

const ADMIN = { id: "1", email: "m@bistec.test", displayName: "Dev Mentor", role: "Admin" as const };
const STUDENT = { id: "2", email: "s@bistec.test", displayName: "Dev Student", role: "Student" as const };
const BATCH = { id: "b1", name: "Batch Aurora", startDate: "2026-05-10", endDate: "2026-11-09" };

const summary = (over: Record<string, unknown> = {}) => ({
  batchId: "b1",
  batchName: "Batch Aurora",
  cycle: { seq: 3, startDate: "2026-07-10", endDate: "2026-08-09", requiredDayCount: 22 },
  students: [
    {
      student: { id: "s1", displayName: "Amaya Wickramasinghe", email: "amaya@dev.local" },
      counts: {
        requiredDays: 22, settledDays: 17, onTime: 13, late: 2, absent: 1,
        missed: 1, pending: 1, extra: 2, complianceRate: 0.9412,
      },
      reviewProgress: { submitted: 4, inReview: 3, evaluated: 10 },
    },
  ],
  ...over,
});

describe("CyclesPage", () => {
  it("redirects a Student caller to / rather than rendering another student's figures", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT);
    await expect(CyclesPage({ searchParams: Promise.resolve({}) })).rejects.toBe(REDIRECT_SENTINEL);
    expect(redirect).toHaveBeenCalledWith("/");
    expect(listBatches).not.toHaveBeenCalled();
  });

  it("renders one row per student with the compliance percentage and the outcome split", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardSummary.mockResolvedValue({ data: summary(), error: undefined });

    render(await CyclesPage({ searchParams: Promise.resolve({ batchId: "b1" }) }));

    expect(screen.getByText("Amaya Wickramasinghe")).toBeInTheDocument();
    expect(screen.getByText("94%")).toBeInTheDocument();
    expect(screen.getByTestId("counts-s1")).toHaveTextContent("13 on time");
    expect(screen.getByTestId("counts-s1")).toHaveTextContent("1 missed");
    expect(screen.getByTestId("extra-s1")).toHaveTextContent("+2 extra");
  });

  it("renders a dash, not 0%, when no day has settled", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardSummary.mockResolvedValue({
      data: summary({
        students: [{
          student: { id: "s2", displayName: "Fresh Start", email: "fresh@dev.local" },
          counts: {
            requiredDays: 22, settledDays: 0, onTime: 0, late: 0, absent: 0,
            missed: 0, pending: 0, extra: 0, complianceRate: null,
          },
          reviewProgress: { submitted: 0, inReview: 0, evaluated: 0 },
        }],
      }),
      error: undefined,
    });

    render(await CyclesPage({ searchParams: Promise.resolve({ batchId: "b1" }) }));

    expect(screen.getByTestId("compliance-s2")).toHaveTextContent("—");
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("shows the awaiting-evaluation state for every student — no scores exist in this release", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardSummary.mockResolvedValue({ data: summary(), error: undefined });

    render(await CyclesPage({ searchParams: Promise.resolve({ batchId: "b1" }) }));

    expect(screen.getByTestId("evaluation-s1")).toHaveTextContent(/awaiting evaluation/i);
  });

  it("offers a cycle picker back to cycle 1 and carries the batch forward", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardSummary.mockResolvedValue({ data: summary(), error: undefined });

    render(await CyclesPage({ searchParams: Promise.resolve({ batchId: "b1" }) }));

    expect(screen.getByRole("link", { name: "Cycle 1" })).toHaveAttribute("href", "/cycles?batchId=b1&cycle=1");
    expect(screen.getByRole("link", { name: "Cycle 3" })).toHaveAttribute("aria-current", "page");
  });

  it("requests the cycle named in the query string", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardSummary.mockResolvedValue({
      data: summary({ cycle: { seq: 2, startDate: "2026-06-10", endDate: "2026-07-09", requiredDayCount: 22 } }),
      error: undefined,
    });

    render(await CyclesPage({ searchParams: Promise.resolve({ batchId: "b1", cycle: "2" }) }));

    expect(getBatchDashboardSummary).toHaveBeenCalledWith({
      client: {}, path: { id: "b1" }, query: { cycle: 2 },
    });
  });

  it("ignores a non-numeric cycle param rather than sending it to the API", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardSummary.mockResolvedValue({ data: summary(), error: undefined });

    render(await CyclesPage({ searchParams: Promise.resolve({ batchId: "b1", cycle: "banana" }) }));

    expect(getBatchDashboardSummary).toHaveBeenCalledWith({ client: {}, path: { id: "b1" }, query: {} });
  });

  it("renders the problem detail when the summary call errors", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({ data: [BATCH] });
    getBatchDashboardSummary.mockResolvedValue({
      data: undefined,
      error: { type: "about:blank", title: "Invalid cycle", status: 400, detail: "Cycle 9 has not started." },
    });

    render(await CyclesPage({ searchParams: Promise.resolve({ batchId: "b1", cycle: "9" }) }));

    expect(screen.getByRole("alert")).toHaveTextContent("Cycle 9 has not started.");
  });
});
