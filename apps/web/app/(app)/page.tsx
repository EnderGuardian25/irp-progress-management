import { getCurrentUserOrRedirect } from "@/lib/api-client";
import { StudentToday } from "./student-today";
import { PageTitle } from "@/components/ui/page-title";
import { Panel } from "@/components/ui/panel";
import { SectionLabel } from "@/components/ui/section-label";

export default async function TodayPage() {
  const user = await getCurrentUserOrRedirect();
  if (user.role === "Student") {
    return <StudentToday displayName={user.displayName} role={user.role} />;
  }

  return (
    <div>
      <PageTitle>Today</PageTitle>
      <Panel>
        <SectionLabel>Signed in as</SectionLabel>
        <p style={{ color: "var(--ink)" }} data-testid="user-name">{user.displayName}</p>
        {/*
          Playwright's sign-in chain (e2e/signin.spec.ts) asserts
          data-testid="user-role" carrying the exact API role string on
          every branch. This card's design doesn't otherwise surface role
          (the mentor already knows they're a mentor); visually hidden,
          same pattern as user-name on the Student branch.

          From GET /api/v1/me — the User row, the only source of truth.
          Never from the session cookie.
        */}
        <span className="sr-only" data-testid="user-role">{user.role}</span>
        <p className="mt-2 text-sm" style={{ color: "var(--ink-muted)" }}>
          The batch dashboard arrives with Plan 7. Use Roster to review today&apos;s submissions.
        </p>
      </Panel>
    </div>
  );
}
