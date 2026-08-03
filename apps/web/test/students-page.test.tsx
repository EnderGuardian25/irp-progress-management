import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StudentsPage from "@/app/(app)/students/page";

// Same pattern as roster-page.test.tsx / review-page.test.tsx: StudentsPage is
// an async server component. Calling it directly and awaiting the returned
// element is the only way to exercise its branches without a running Next
// server.
const { getCurrentUserOrRedirect, apiClient } = vi.hoisted(() => ({
  getCurrentUserOrRedirect: vi.fn(),
  apiClient: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({ getCurrentUserOrRedirect, apiClient }));

// admin-actions.ts (unmocked -- exercised for real, same as review-page.test's
// treatment of review-actions.ts) calls createUser/createBatch/
// transferStudent/archiveUser/restoreUser; page.tsx itself calls
// listBatches/listUsers. All seven are mocked here so the whole tree -- page,
// RegisterForm, CreateBatchForm, TransferForm, ArchiveButton, RestoreButton,
// and the server actions underneath them -- runs without a real client or
// network access.
const {
  listBatches,
  listUsers,
  createUser,
  createBatch,
  transferStudent,
  archiveUser,
  restoreUser,
} = vi.hoisted(() => ({
  listBatches: vi.fn(),
  listUsers: vi.fn(),
  createUser: vi.fn(),
  createBatch: vi.fn(),
  transferStudent: vi.fn(),
  archiveUser: vi.fn(),
  restoreUser: vi.fn(),
}));
vi.mock("@irp/client", () => ({
  listBatches,
  listUsers,
  createUser,
  createBatch,
  transferStudent,
  archiveUser,
  restoreUser,
}));

// redirect() in real Next never returns -- it throws a special NEXT_REDIRECT
// signal that framework internals catch. The mock reproduces just the
// "never returns normally" part with a private sentinel.
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

// admin-actions.ts runs for real and calls revalidatePath on every success
// path. Outside an actual Next request lifecycle that throws ("static
// generation store missing"), which a no-op stub avoids -- same treatment as
// review-page.test.tsx.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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

const STUDENT_DETAIL = {
  id: "s1",
  email: "a.perera@bistecglobal.com",
  displayName: "Amaya Perera",
  role: "Student" as const,
  archived: false,
};

const MENTOR_DETAIL = {
  id: "m1",
  email: "d.mentor@bistecglobal.com",
  displayName: "Dev Mentor",
  role: "Admin" as const,
  archived: false,
};

function searchParams(view?: string) {
  return Promise.resolve(view === undefined ? {} : { view });
}

function defaultReads() {
  listBatches.mockResolvedValue({ data: [BATCH], error: undefined });
  listUsers.mockResolvedValue({ data: [STUDENT_DETAIL, MENTOR_DETAIL], error: undefined });
}

describe("StudentsPage", () => {
  it("redirects a Student caller to / rather than rendering the page", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(STUDENT_USER);

    await expect(StudentsPage({ searchParams: searchParams() })).rejects.toBe(REDIRECT_SENTINEL);

    expect(redirect).toHaveBeenCalledWith("/");
    expect(listBatches).not.toHaveBeenCalled();
  });

  it("renders all four panels in the default view", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    apiClient.mockResolvedValue({});
    defaultReads();

    render(await StudentsPage({ searchParams: searchParams() }));

    expect(screen.getAllByText("Register").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Create batch").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Transfer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("People").length).toBeGreaterThan(0);
    // People lists both the active student and mentor read back.
    expect(screen.getByText("Amaya Perera")).toBeInTheDocument();
    expect(screen.getByText("Dev Mentor")).toBeInTheDocument();
  });

  it("renders the problem detail when a read errors -- must not silently fall through to an empty state", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    apiClient.mockResolvedValue({});
    listBatches.mockResolvedValue({
      data: undefined,
      error: { type: "about:blank", title: "Internal Server Error", status: 500, detail: "The batch list could not be loaded." },
    });
    listUsers.mockResolvedValue({ data: [STUDENT_DETAIL], error: undefined });

    render(await StudentsPage({ searchParams: searchParams() }));

    expect(screen.getByRole("alert")).toHaveTextContent("The batch list could not be loaded.");
  });

  it("archived view lists archived users with a Restore control, and links back", async () => {
    // This view was deliberately read-only, which left archiving -- a
    // one-click action -- with no inverse anywhere in the product. FR-5 asks
    // for an archive that keeps history; it never asked for that archive to
    // be one-way.
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    apiClient.mockResolvedValue({});
    listUsers.mockResolvedValue({
      data: [{ ...STUDENT_DETAIL, id: "s2", displayName: "Kavindu Silva", archived: true }],
      error: undefined,
    });

    render(await StudentsPage({ searchParams: searchParams("archived") }));

    expect(listUsers).toHaveBeenCalledWith({ client: {}, query: { archived: true } });
    expect(screen.getByText("Kavindu Silva")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
    // Restore is the only action here: everything else on the Students page
    // (transfer, archive, registration) needs an ACTIVE user.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Back to Students/ })).toHaveAttribute("href", "/students");
  });

  it("restores an archived user through the SDK and surfaces a failure", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    apiClient.mockResolvedValue({});
    listUsers.mockResolvedValue({
      data: [{ ...STUDENT_DETAIL, id: "s2", displayName: "Kavindu Silva", archived: true }],
      error: undefined,
    });
    restoreUser.mockResolvedValue({
      data: undefined,
      error: { title: "Not Found", detail: "That user no longer exists." },
    });

    render(await StudentsPage({ searchParams: searchParams("archived") }));
    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    // The problem detail has to reach the mentor -- a restore that silently
    // does nothing is the failure mode the bound-action shape exists to stop.
    expect(await screen.findByRole("alert")).toHaveTextContent("That user no longer exists.");
    expect(restoreUser).toHaveBeenCalledWith({ client: {}, path: { id: "s2" } });
  });

  it("RegisterForm hides batch/startDate for the Mentor role and omits the enrolment key entirely", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    apiClient.mockResolvedValue({});
    defaultReads();
    createUser.mockResolvedValue({ error: undefined, data: MENTOR_DETAIL });

    render(await StudentsPage({ searchParams: searchParams() }));

    // Student is the default role -- batch/start date are visible.
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

  it("surfaces an archive action's 409 self-archive error via role=alert", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    apiClient.mockResolvedValue({});
    defaultReads();
    archiveUser.mockResolvedValue({
      error: { type: "about:blank", title: "Conflict", status: 409, detail: "A mentor cannot archive their own account." },
    });

    render(await StudentsPage({ searchParams: searchParams() }));

    const archiveButtons = screen.getAllByRole("button", { name: "Archive" });
    fireEvent.click(archiveButtons[0]!);

    expect(await screen.findByRole("alert")).toHaveTextContent("A mentor cannot archive their own account.");
  });

  it("surfaces a successful batch creation with a role=status success line", async () => {
    getCurrentUserOrRedirect.mockResolvedValue(ADMIN_USER);
    apiClient.mockResolvedValue({});
    defaultReads();
    createBatch.mockResolvedValue({ error: undefined, data: BATCH });

    render(await StudentsPage({ searchParams: searchParams() }));

    fireEvent.change(screen.getByLabelText("Batch name"), { target: { value: "Batch Bramble" } });
    fireEvent.change(screen.getByLabelText("Batch start date"), { target: { value: "2026-09-10" } });
    fireEvent.change(screen.getByLabelText("Batch end date"), { target: { value: "2027-03-09" } });
    fireEvent.click(screen.getByRole("button", { name: "Create batch" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Batch created.");
  });
});
