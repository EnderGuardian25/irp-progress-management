import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SettingsPage from "@/app/(app)/settings/page";

const { getCurrentUserOrRedirect, apiClient } = vi.hoisted(() => ({
  getCurrentUserOrRedirect: vi.fn(),
  apiClient: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ getCurrentUserOrRedirect, apiClient }));

// The page reads listBatches for RegisterForm's batch select; the forms' own
// actions call createUser/createBatch. All four are mocked so the whole tree
// runs with no client and no network — the students-page.test.tsx pattern.
const { listBatches, createUser, createBatch } = vi.hoisted(() => ({
  listBatches: vi.fn(),
  createUser: vi.fn(),
  createBatch: vi.fn(),
}));
vi.mock("@irp/client", () => ({ listBatches, createUser, createBatch }));

const { cookies } = vi.hoisted(() => ({ cookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ADMIN_USER = { id: "1", email: "m@x.test", displayName: "Dev Mentor", role: "Admin" as const };
const STUDENT_USER = { id: "2", email: "s@x.test", displayName: "Dev Student", role: "Student" as const };
const BATCH = { id: "b1", name: "Batch 1", startDate: "2026-05-10", endDate: "2026-11-09" };

beforeEach(() => {
  vi.clearAllMocks();
  apiClient.mockResolvedValue({});
  listBatches.mockResolvedValue({ data: [BATCH], error: undefined });
  cookies.mockResolvedValue({ get: () => ({ name: "irp-theme", value: "dark" }) });
});

describe("SettingsPage", () => {
  it("shows Appearance to a mentor", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    render(await SettingsPage());
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  });

  it("shows Appearance to a student — it must NOT redirect them away", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT_USER);
    render(await SettingsPage());
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  });

  it("shows Register and Create batch to a mentor", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    render(await SettingsPage());
    expect(screen.getByLabelText("Role")).toBeInTheDocument();
    expect(screen.getByLabelText("Batch name")).toBeInTheDocument();
  });

  it("omits Register and Create batch from a student's markup entirely", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT_USER);
    render(await SettingsPage());
    // Absent, not hidden: the assertion is that the admin controls were never
    // serialised into a student's page, which CSS hiding would not give.
    expect(screen.queryByLabelText("Role")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Batch name")).not.toBeInTheDocument();
  });

  it("does not even fetch batches for a student", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT_USER);
    render(await SettingsPage());
    // A student is not authorised to list batches. Gating only the RENDER would
    // still issue the request and could surface a 403 on their settings page.
    expect(listBatches).not.toHaveBeenCalled();
  });

  it("falls back to system when no theme cookie is set", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT_USER);
    cookies.mockResolvedValue({ get: () => undefined });
    render(await SettingsPage());
    expect(screen.getByRole("radio", { name: "Follow system" })).toBeChecked();
  });
});
