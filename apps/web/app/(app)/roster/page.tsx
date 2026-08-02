import Link from "next/link";
import { redirect } from "next/navigation";
import { listBatches, getBatchRoster } from "@irp/client";
import { getCurrentUserOrRedirect, apiClient } from "@/lib/api-client";
import { PageTitle } from "@/components/ui/page-title";
import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import { formatCivilDateLabel } from "../format-civil-date";

/**
 * The mentor's working view of a batch's roster for one date (FR-19,
 * FR-28 groundwork). Admin-only — see spec §4.1's Admin/Student split; a
 * Student hitting this route is bounced to "/" rather than shown a 403
 * page, matching the pattern the sidebar already enforces by omitting the
 * link entirely for that role.
 */
export default async function RosterPage({
  searchParams,
}: {
  searchParams: Promise<{ batchId?: string; date?: string }>;
}) {
  const user = await getCurrentUserOrRedirect();
  if (user.role !== "Admin") redirect("/");

  const { batchId, date: rawDate } = await searchParams;
  // The GET date form submits `date=""` once cleared -- an empty string is
  // not a valid civil date and must be treated exactly like "not supplied",
  // both for the roster query and for what the batch-switch links carry
  // forward. Normalised once, here, so every later read agrees.
  const date = rawDate === "" ? undefined : rawDate;

  const client = await apiClient();
  const { data: batches, error: batchesError } = await listBatches({ client });

  if (batchesError !== undefined) {
    return (
      <div>
        <PageTitle>Roster</PageTitle>
        <Panel>
          <p role="alert" style={{ color: "var(--st-missed)" }}>
            {batchesError.detail ?? batchesError.title}
          </p>
        </Panel>
      </div>
    );
  }

  if (batches === undefined || batches.length === 0) {
    return (
      <div>
        <PageTitle>Roster</PageTitle>
        <Panel>
          <EmptyState
            title="No batches yet."
            hint="Create one from the Students page."
          />
        </Panel>
      </div>
    );
  }

  const selected = batches.find((b) => b.id === batchId) ?? batches[0]!;
  const { data: rows, error } = await getBatchRoster({
    client,
    path: { id: selected.id },
    query: date === undefined ? {} : { date },
  });

  // The API defaults the roster date to "today" in Asia/Colombo when no
  // `date` query param is given. Every row carries that resolved date on
  // `day.date`, so read it back from the first row rather than guessing —
  // this is what the date <input>'s defaultValue and the heading label use
  // when the mentor hasn't picked an explicit date yet.
  const effectiveDate = date ?? rows?.[0]?.day.date;

  return (
    <div>
      <PageTitle>Roster</PageTitle>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionLabel>Batch</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-2">
            {batches.map((b) => {
              const isSelected = b.id === selected.id;
              return (
                <Link
                  key={b.id}
                  href={{
                    pathname: "/roster",
                    query: date === undefined ? { batchId: b.id } : { batchId: b.id, date },
                  }}
                  aria-current={isSelected ? "page" : undefined}
                  className="rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
                  style={{
                    borderColor: "var(--line)",
                    color: isSelected ? "var(--ink)" : "var(--ink-muted)",
                    background: isSelected ? "var(--surface-sunk)" : "transparent",
                  }}
                >
                  {b.name}
                </Link>
              );
            })}
          </div>
        </div>

        <form method="get" className="flex items-end gap-2">
          <input type="hidden" name="batchId" value={selected.id} />
          <div>
            <label htmlFor="roster-date" className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--ink-muted)" }}>
              Date
            </label>
            <input
              id="roster-date"
              type="date"
              name="date"
              defaultValue={effectiveDate}
              className="mt-2 block rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
              style={{ borderColor: "var(--line)", color: "var(--ink)" }}
            />
          </div>
          <Button type="submit" variant="quiet">
            Go
          </Button>
        </form>
      </div>

      {error !== undefined && (
        <Panel>
          <p role="alert" style={{ color: "var(--st-missed)" }}>
            {error.detail ?? error.title}
          </p>
        </Panel>
      )}

      {error === undefined && rows?.length === 0 && (
        <Panel>
          <EmptyState
            title="No students enrolled in this batch."
            hint="Enrol students from the Students page."
          />
        </Panel>
      )}

      {error === undefined && rows !== undefined && rows.length > 0 && (
        <Panel sunk>
          {effectiveDate !== undefined && (
            <div className="mb-3">
              <SectionLabel>{formatCivilDateLabel(effectiveDate)}</SectionLabel>
            </div>
          )}
          <table className="w-full text-[13px]" style={{ color: "var(--ink)" }}>
            <thead>
              <tr style={{ color: "var(--ink-muted)" }}>
                <th scope="col" className="px-2 py-2 text-left font-normal">Student</th>
                <th scope="col" className="px-2 py-2 text-left font-normal">Status</th>
                <th scope="col" className="px-2 py-2 text-left font-normal">Entries</th>
                <th scope="col" className="px-2 py-2 text-left font-normal">Extra</th>
                <th scope="col" className="px-2 py-2 text-left font-normal">Absence reason</th>
                <th scope="col" className="px-2 py-2 text-left font-normal">Recorded</th>
                <th scope="col" className="px-2 py-2 text-left font-normal">Review</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.student.id} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="px-2 py-2">
                    <div>{row.student.displayName}</div>
                    <div className="text-xs" style={{ color: "var(--ink-muted)" }}>
                      {row.student.email}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    {row.day.status === "none" ? (
                      <span style={{ color: "var(--ink-muted)" }}>—</span>
                    ) : (
                      <StatusPill status={row.day.status} reportStatus={row.day.reportStatus} />
                    )}
                  </td>
                  <td className="tabular px-2 py-2">{row.day.entries.length}</td>
                  <td className="px-2 py-2">
                    {row.extraCountThisCycle > 0 ? (
                      <span className="tabular" style={{ color: "var(--ink-muted)" }}>
                        +{row.extraCountThisCycle} extra
                      </span>
                    ) : (
                      <span style={{ color: "var(--ink-muted)" }}>—</span>
                    )}
                  </td>
                  <td className="px-2 py-2" style={{ color: "var(--ink-muted)" }}>
                    {row.day.absenceReason ?? "—"}
                  </td>
                  <td className="px-2 py-2">
                    {row.hasMentorRecord ? "✓ recorded" : "— none"}
                  </td>
                  <td className="px-2 py-2" style={{ color: "var(--ink-muted)" }}>
                    {/* Task 14 turns this into a Link to /review/[studentId]. typedRoutes
                        rejects a Link to a route that doesn't exist yet, so this is
                        plain text until that page lands. */}
                    Review
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
