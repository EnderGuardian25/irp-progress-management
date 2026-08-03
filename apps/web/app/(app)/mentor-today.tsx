import { listBatches, getBatchDashboardToday, type Role } from "@irp/client";
import { apiClient } from "@/lib/api-client";
import { CycleRibbon } from "@/components/cycle-ribbon/cycle-ribbon";
import { toBatchRibbonDays } from "@/lib/ribbon";
import { PageTitle } from "@/components/ui/page-title";
import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";
import { CountsRow } from "@/components/ui/counts-row";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCivilDateLabel } from "./format-civil-date";

/**
 * FR-28, must-ship (SC-4). The warm zone: one cycle ribbon per batch, with
 * "N of M submitted" and the late/absent/missed counts beside it — all of it
 * above the fold at 1280x800 (docs/design-system.md §8.1). The roster is a
 * separate page and is allowed to scroll; these figures are not.
 *
 * One dashboard call per batch, issued concurrently. A batch whose call fails
 * renders its own alert and the others still render — a single 500 must not
 * blank the mentor's home screen.
 */
export async function MentorToday({ displayName, role }: { displayName: string; role: Role }) {
  const client = await apiClient();
  const { data: batches, error: batchesError } = await listBatches({ client });

  const identity = (
    <>
      {/* e2e/signin.spec.ts asserts both on every role. Visually hidden — the
          Topbar already shows the name, and a mentor knows they are a mentor. */}
      <span className="sr-only" data-testid="user-name">{displayName}</span>
      <span className="sr-only" data-testid="user-role">{role}</span>
    </>
  );

  if (batchesError !== undefined) {
    return (
      <div>
        <PageTitle>Today</PageTitle>
        {identity}
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
        <PageTitle>Today</PageTitle>
        {identity}
        <Panel>
          <EmptyState title="No batches yet." hint="Create one from the Students page." />
        </Panel>
      </div>
    );
  }

  const dashboards = await Promise.all(
    batches.map(async (b) => ({
      batch: b,
      result: await getBatchDashboardToday({ client, path: { id: b.id } }),
    })),
  );

  return (
    <div>
      <PageTitle>Today</PageTitle>
      {identity}

      <div className="flex flex-col gap-6">
        {dashboards.map(({ batch, result }) => {
          if (result.data === undefined) {
            return (
              <Panel key={batch.id} title={batch.name}>
                <p role="alert" style={{ color: "var(--st-missed)" }}>
                  {result.error?.detail ?? result.error?.title ?? "This batch's figures could not be loaded."}
                </p>
              </Panel>
            );
          }

          const d = result.data;
          const label =
            d.cycle.seq === null
              ? `${batch.name} · first evaluated cycle opens ${formatCivilDateLabel(d.cycle.startDate)}`
              : `${batch.name} · Cycle ${String(d.cycle.seq)} · Day ${String(d.dayNumber)} of ${String(d.cycle.requiredDayCount)}`;

          return (
            <section key={batch.id} aria-label={batch.name}>
              <CycleRibbon
                days={toBatchRibbonDays([...d.days], d.date)}
                extraAfter={[...d.extraAfter]}
                label={label}
              />

              <div className="mt-3">
                <CountsRow
                  items={[
                    {
                      tone: "ink",
                      strong: true,
                      text: `${String(d.counts.submitted)} of ${String(d.counts.enrolled)} submitted`,
                      testId: `submitted-count-${batch.id}`,
                    },
                    { tone: "late", text: `${String(d.counts.late)} late`, testId: `late-count-${batch.id}` },
                    { tone: "absent", text: `${String(d.counts.absent)} absent`, testId: `absent-count-${batch.id}` },
                    { tone: "missed", text: `${String(d.counts.missed)} missed`, testId: `missed-count-${batch.id}` },
                    ...(d.extraCount > 0
                      ? [{ tone: "muted" as const, text: `+${String(d.extraCount)} extra this cycle` }]
                      : []),
                  ]}
                />
              </div>

              {/*
                `data-date` carries the ISO form of the day these figures
                describe. The visible label is prose ("Friday 31 July"), which
                a test cannot turn back into a date, and on a weekend this day
                is NOT today — so an e2e check that wants to cross-read the
                Roster for the same day has no other way to address it.
              */}
              <div className="mt-1" data-testid={`day-label-${batch.id}`} data-date={d.date}>
                <SectionLabel>
                  {formatCivilDateLabel(d.date)}
                  {d.isFallbackDay && " · the last required day, not today"}
                </SectionLabel>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
