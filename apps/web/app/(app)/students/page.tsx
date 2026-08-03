import Link from "next/link";
import { redirect } from "next/navigation";
import { listBatches, listUsers } from "@irp/client";
import { getCurrentUserOrRedirect, apiClient } from "@/lib/api-client";
import { PageTitle } from "@/components/ui/page-title";
import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";
import { EmptyState } from "@/components/ui/empty-state";
import {
  RegisterForm,
  CreateBatchForm,
  TransferForm,
  ArchiveButton,
  RestoreButton,
} from "./forms";

/**
 * The mentor's directory of people and batches (FR-3, FR-5, FR-6, FR-8).
 * Admin-only, matching roster/page.tsx and review/[studentId]/page.tsx's
 * gate -- a Student hitting this route is bounced to "/" rather than shown
 * a 403 page.
 *
 * `?view=archived` renders the FR-5 archive list instead of the four working
 * panels -- names, emails, and a Restore control per row. It carries no other
 * actions: everything else (transfer, re-registration) needs an active user.
 */
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await getCurrentUserOrRedirect();
  if (user.role !== "Admin") redirect("/");

  const { view } = await searchParams;
  const client = await apiClient();

  if (view === "archived") {
    const { data: archived, error } = await listUsers({ client, query: { archived: true } });

    return (
      <div>
        <PageTitle>Archived</PageTitle>
        {error !== undefined && (
          <Panel>
            <p role="alert" style={{ color: "var(--st-missed)" }}>
              {error.detail ?? error.title ?? "Something went wrong."}
            </p>
          </Panel>
        )}
        {error === undefined && (archived === undefined || archived.length === 0) && (
          <Panel>
            <EmptyState title="No archived users." />
          </Panel>
        )}
        {error === undefined && archived !== undefined && archived.length > 0 && (
          <Panel sunk>
            <ul className="flex flex-col gap-2">
              {archived.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-4 border-b pb-2" style={{ borderColor: "var(--line)" }}>
                  <div>
                    <div style={{ color: "var(--ink)" }}>{u.displayName}</div>
                    <div className="text-sm" style={{ color: "var(--ink-muted)" }}>{u.email}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm" style={{ color: "var(--ink-muted)" }}>{u.role}</span>
                    {/* This view was read-only on the reasoning that an archived
                        user "has already lost access and there is nothing left
                        to do to one from here". That left archiving — a
                        one-click action — with no inverse anywhere in the
                        product, so an accidental archive could only be undone
                        with a direct database write. FR-5 never called for
                        that; it was an assumption, not a requirement. */}
                    <RestoreButton userId={u.id} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        )}
        <p className="mt-4">
          <Link href="/students" className="text-link">
            Back to Students
          </Link>
        </p>
      </div>
    );
  }

  // The default view's four panels (Register, Create batch, Transfer,
  // People) all draw from the same two reads -- every active (non-archived,
  // the default) user and every batch -- rather than each panel issuing its
  // own request.
  const [{ data: batches, error: batchesError }, { data: users, error: usersError }] =
    await Promise.all([
      listBatches({ client }),
      listUsers({ client }),
    ]);

  const batchOptions = (batches ?? []).map((b) => ({ id: b.id, name: b.name }));
  const studentOptions = (users ?? [])
    .filter((u) => u.role === "Student")
    .map((u) => ({ id: u.id, displayName: u.displayName, email: u.email }));

  return (
    <div>
      <PageTitle>Students</PageTitle>

      {batchesError !== undefined && (
        <Panel>
          <p role="alert" style={{ color: "var(--st-missed)" }}>
            {batchesError.detail ?? batchesError.title ?? "Something went wrong."}
          </p>
        </Panel>
      )}
      {usersError !== undefined && (
        <Panel>
          <p role="alert" style={{ color: "var(--st-missed)" }}>
            {usersError.detail ?? usersError.title ?? "Something went wrong."}
          </p>
        </Panel>
      )}

      <div className="grid grid-cols-2 gap-6">
        <Panel>
          <SectionLabel>Register</SectionLabel>
          <div className="mt-3">
            <RegisterForm batches={batchOptions} />
          </div>
        </Panel>

        <Panel>
          <SectionLabel>Create batch</SectionLabel>
          <div className="mt-3">
            <CreateBatchForm />
          </div>
        </Panel>

        <Panel>
          <SectionLabel>Transfer</SectionLabel>
          <div className="mt-3">
            {studentOptions.length === 0 || batchOptions.length === 0 ? (
              <EmptyState title="No active student or batch to transfer yet." />
            ) : (
              <TransferForm students={studentOptions} batches={batchOptions} />
            )}
          </div>
        </Panel>

        <Panel>
          <div className="flex items-center justify-between">
            <SectionLabel>People</SectionLabel>
            <Link href="/students?view=archived" className="text-link text-sm">
              View archived
            </Link>
          </div>
          <div className="mt-3">
            {usersError !== undefined ? null : (users === undefined || users.length === 0) ? (
              <EmptyState title="No one registered yet." hint="Use Register to add the first mentor or student." />
            ) : (
              <ul className="flex flex-col gap-2">
                {users.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 border-b pb-2" style={{ borderColor: "var(--line)" }}>
                    <div>
                      <div style={{ color: "var(--ink)" }}>{u.displayName}</div>
                      <div className="text-sm" style={{ color: "var(--ink-muted)" }}>{u.email} — {u.role}</div>
                    </div>
                    <ArchiveButton userId={u.id} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
