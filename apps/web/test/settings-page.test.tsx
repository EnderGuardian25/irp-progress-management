import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("no longer carries Create batch — it went back to Students (ADR-0023)", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    render(await SettingsPage());
    expect(screen.queryByLabelText("Batch name")).not.toBeInTheDocument();
  });

  it("still carries Register for a mentor", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    render(await SettingsPage());
    expect(screen.getByLabelText("Role")).toBeInTheDocument();
  });

  it("surfaces a batch-read failure instead of rendering an empty select", async () => {
    // Deferred in Plan 7A because nothing else touched this page. This task
    // edits it, so the gap closes here.
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    listBatches.mockResolvedValue({
      data: undefined,
      error: { title: "Bad Gateway", detail: "Batch service unavailable." },
    });
    render(await SettingsPage());
    expect(screen.getByRole("alert")).toHaveTextContent("Batch service unavailable.");
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

  // Relocated from students-page.test.tsx by Task 7's fix round 1: RegisterForm
  // and CreateBatchForm moved to Settings (ADR-0022), and this behaviour is the
  // components' own -- unchanged by the move -- not the Students page's, so it
  // belongs wherever the components render now.
  it("RegisterForm hides batch/startDate for the Mentor role and omits the enrolment key entirely", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    createUser.mockResolvedValue({ error: undefined, data: { id: "m2" } });

    render(await SettingsPage());

    // Student is the default role -- assert batch/start date are actually
    // PRESENT first. Checking only the post-change Admin state would also
    // pass against a form that never rendered these fields at all.
    expect(screen.getByLabelText("Batch")).toBeInTheDocument();
    expect(screen.getByLabelText("Start date")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Admin" } });

    expect(screen.queryByLabelText("Batch")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Start date")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new.mentor@bistecglobal.com" } });
    fireEvent.change(screen.getByLabelText("Display name"), { target: { value: "New Mentor" } });
    fireEvent.change(screen.getByLabelText("External id"), { target: { value: "oid-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    await screen.findByRole("status");

    expect(createUser).toHaveBeenCalledTimes(1);
    const callArgs = createUser.mock.calls[0]?.[0] as { body: Record<string, unknown> } | undefined;
    expect(callArgs?.body.role).toBe("Admin");
    expect(callArgs?.body).not.toHaveProperty("enrolment");
  });
});
