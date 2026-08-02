import { getCurrentUserOrRedirect } from "@/lib/api-client";
import { PageTitle } from "@/components/ui/page-title";
import { SectionLabel } from "@/components/ui/section-label";
import { Panel } from "@/components/ui/panel";

export default async function TodayPage() {
  const user = await getCurrentUserOrRedirect();

  return (
    <div>
      <PageTitle>Today</PageTitle>

      <Panel>
        <dl className="max-w-[48ch]">
          <SectionLabel>Signed in as</SectionLabel>
          <dd className="mb-4 text-base" style={{ color: "var(--ink)" }} data-testid="user-name">
            {user.displayName}
          </dd>

          <SectionLabel>Email</SectionLabel>
          <dd className="mb-4 text-base" style={{ color: "var(--ink)" }}>{user.email}</dd>

          <SectionLabel>Role</SectionLabel>
          {/* From GET /api/v1/me — the User row, the only source of truth. Never
              from the session cookie. */}
          <dd className="text-base" style={{ color: "var(--ink)" }} data-testid="user-role">
            {user.role}
          </dd>
        </dl>
      </Panel>
    </div>
  );
}
