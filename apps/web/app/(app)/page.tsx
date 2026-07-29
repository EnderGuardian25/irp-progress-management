import { getCurrentUserOrRedirect } from "@/lib/api-client";

export default async function TodayPage() {
  const user = await getCurrentUserOrRedirect();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold" style={{ color: "var(--ink)" }}>
        Today
      </h1>

      <dl
        className="max-w-[48ch] rounded-[var(--radius-panel)] border p-6"
        style={{ background: "var(--surface)", borderColor: "var(--line)" }}
      >
        <dt className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--ink-muted)" }}>
          Signed in as
        </dt>
        <dd className="mb-4 text-base" style={{ color: "var(--ink)" }} data-testid="user-name">
          {user.displayName}
        </dd>

        <dt className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--ink-muted)" }}>
          Email
        </dt>
        <dd className="mb-4 text-base" style={{ color: "var(--ink)" }}>{user.email}</dd>

        <dt className="text-xs uppercase tracking-[0.08em]" style={{ color: "var(--ink-muted)" }}>
          Role
        </dt>
        {/* From GET /api/v1/me — the User row, the only source of truth. Never
            from the session cookie. */}
        <dd className="text-base" style={{ color: "var(--ink)" }} data-testid="user-role">
          {user.role}
        </dd>
      </dl>
    </div>
  );
}
