import Link from "next/link";
import { redirect } from "next/navigation";
import { listBatches, getBatchDashboardSummary } from "@irp/client";
import { getCurrentUserOrRedirect, apiClient } from "@/lib/api-client";
import { PageTitle } from "@/components/ui/page-title";
import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCivilDateLabel } from "../format-civil-date";

/**
 * The mentor's per-cycle view (spec §5). Admin-only; a Student is bounced to
 * "/" rather than shown a 403 page, matching Roster and Review.
 *
 * There is no evaluation column data to fetch: no Evaluation row exists in
 * this release (O-5 blocks the AI provider decision), so the column renders
 * the designed awaiting state for every student rather than the API
 * returning a field that is always null.
 */
export default async function CyclesPage({
  searchParams,
}: {
  searchParams: Promise<{ batchId?: string; cycle?: string }>;
}) {
  const user = await getCurrentUserOrRedirect();
  if (user.role !== "Admin") redirect("/");

  const { batchId, cycle: rawCycle } = await searchParams;
  // The picker submits a plain integer; anything else -- an empty string from
  // a cleared control, a hand-edited URL -- is treated as "not supplied" and
  // never forwarded, so the API's own 400 is reserved for cycles that are
  // well-formed but out of range.
  const parsed = Number(rawCycle);
  const cycle =
    rawCycle !== undefined && rawCycle !== "" && Number.isInteger(parsed) && parsed >= 1
      ? parsed
      : undefined;

  const client = await apiClient();
  const { data: batches, error: batchesError } = await listBatches({ client });

  if (batchesError !== undefined) {
    return (
      <div>
        <PageTitle>Cycles</PageTitle>
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
        <PageTitle>Cycles</PageTitle>
        <Panel>
          <EmptyState title="No batches yet." hint="Create one from the Students page." />
        </Panel>
      </div>
    );
  }

  const selected = batches.find((b) => b.id === batchId) ?? batches[0]!;
  const { data, error } = await getBatchDashboardSummary({
    client,
    path: { id: selected.id },
    query: cycle === undefined ? {} : { cycle },
  });

  return (
    <div>
      <PageTitle>Cycles</PageTitle>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionLabel>Batch</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-2">
            {batches.map((b) => (
              <Link
                key={b.id}
                href={{ pathname: "/cycles", query: { batchId: b.id } }}
                aria-current={b.id === selected.id ? "page" : undefined}
                className="rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
                style={{
                  borderColor: "var(--line)",
                  color: b.id === selected.id ? "var(--ink)" : "var(--ink-muted)",
                  background: b.id === selected.id ? "var(--surface-sunk)" : "transparent",
                }}
              >
                {b.name}
              </Link>
            ))}
          </div>
        </div>

        {/* Switching batch drops the cycle number on purpose: cycle 3 of one
            batch is not cycle 3 of another, and carrying it forward would
            silently show a different month under the same label. */}
        {data?.cycle.seq != null && (
          <div>
            <SectionLabel>Cycle</SectionLabel>
            <div className="mt-2 flex flex-wrap gap-2">
              {Array.from({ length: data.cycle.seq }, (_, i) => i + 1).map((n) => (
                <Link
                  key={n}
                  href={{ pathname: "/cycles", query: { batchId: selected.id, cycle: n } }}
                  aria-current={n === data.cycle.seq ? "page" : undefined}
                  className="tabular rounded-[var(--radius-control)] border px-3 py-1.5 text-sm"
                  style={{
                    borderColor: "var(--line)",
                    color: n === data.cycle.seq ? "var(--ink)" : "var(--ink-muted)",
                    background: n === data.cycle.seq ? "var(--surface-sunk)" : "transparent",
                  }}
                >
                  Cycle {n}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {error !== undefined && (
        <Panel>
          <p role="alert" style={{ color: "var(--st-missed)" }}>
            {error.detail ?? error.title}
          </p>
        </Panel>
      )}

      {data !== undefined && (
        <Panel sunk>
          <div className="mb-3">
            <SectionLabel>
              {data.cycle.seq === null
                ? `First evaluated cycle opens ${formatCivilDateLabel(data.cycle.startDate)}`
                : `Cycle ${String(data.cycle.seq)} · ${formatCivilDateLabel(data.cycle.startDate)} – ${formatCivilDateLabel(data.cycle.endDate)}`}
            </SectionLabel>
          </div>
          {data.students.length === 0 ? (
            <EmptyState
              title="Nobody was enrolled in this cycle."
              hint="Enrol students from the Students page."
            />
          ) : (
            <table className="w-full text-[13px]" style={{ color: "var(--ink)" }}>
              <thead>
                <tr style={{ color: "var(--ink-muted)" }}>
                  <th scope="col" className="px-2 py-2 text-left font-normal">Student</th>
                  <th scope="col" className="px-2 py-2 text-left font-normal">Required</th>
                  <th scope="col" className="px-2 py-2 text-left font-normal">Outcomes</th>
                  <th scope="col" className="px-2 py-2 text-left font-normal">Extra</th>
                  <th scope="col" className="px-2 py-2 text-left font-normal">Compliance</th>
                  <th scope="col" className="px-2 py-2 text-left font-normal">Review</th>
                  <th scope="col" className="px-2 py-2 text-left font-normal">Evaluation</th>
                </tr>
              </thead>
              <tbody>
                {data.students.map(({ student, counts, reviewProgress }) => (
                  <tr key={student.id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td className="px-2 py-2">
                      <div>{student.displayName}</div>
                      <div className="text-xs" style={{ color: "var(--ink-muted)" }}>{student.email}</div>
                    </td>
                    <td className="tabular px-2 py-2">{counts.requiredDays}</td>
                    {/* One cell, four figures: the outcomes only mean anything
                        read together, and four columns of mostly-zero would
                        cost the width the Review and Evaluation columns need. */}
                    <td className="tabular px-2 py-2" data-testid={`counts-${student.id}`}>
                      <span style={{ color: "var(--st-ok)" }}>{counts.onTime} on time</span>
                      {" · "}
                      <span style={{ color: "var(--st-late)" }}>{counts.late} late</span>
                      {" · "}
                      <span style={{ color: "var(--st-absent)" }}>{counts.absent} absent</span>
                      {" · "}
                      <span style={{ color: "var(--st-missed)" }}>{counts.missed} missed</span>
                    </td>
                    {/* Extra is muted, never a status colour — design-system
                        §3.2, "distinguished by form, not colour". */}
                    <td className="tabular px-2 py-2" data-testid={`extra-${student.id}`} style={{ color: "var(--ink-muted)" }}>
                      {counts.extra > 0 ? `+${String(counts.extra)} extra` : "—"}
                    </td>
                    {/* A dash, not 0%: no settled day means no rate exists,
                        and a zero would read as total failure. */}
                    <td className="tabular px-2 py-2" data-testid={`compliance-${student.id}`}>
                      {counts.complianceRate === null
                        ? "—"
                        : `${String(Math.round(counts.complianceRate * 100))}%`}
                    </td>
                    <td className="tabular px-2 py-2" style={{ color: "var(--ink-muted)" }}>
                      {reviewProgress.evaluated} evaluated · {reviewProgress.inReview} in review ·{" "}
                      {reviewProgress.submitted} to do
                    </td>
                    <td className="px-2 py-2" data-testid={`evaluation-${student.id}`} style={{ color: "var(--ink-muted)" }}>
                      Awaiting evaluation
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}
    </div>
  );
}
