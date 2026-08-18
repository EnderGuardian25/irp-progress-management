import { cookies } from "next/headers";
import { listBatches } from "@irp/client";
import { getCurrentUserOrRedirect, apiClient } from "@/lib/api-client";
import { PageTitle } from "@/components/ui/page-title";
import { Panel } from "@/components/ui/panel";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { RegisterForm } from "../students/forms";
import { ThemeControl } from "./theme-control";

/**
 * Settings — appearance for everyone, registration for mentors (FR-3).
 * ADR-0021 (theme by cookie), ADR-0022 (registration lives here), ADR-0023
 * (Create batch moved here alongside Register, then moved back to Students --
 * this page keeps Register only).
 *
 * THE GATING PATTERN HERE IS NEW AND DELIBERATE. Every other mentor page
 * bounces the whole route:
 *
 *   if (user.role !== "Admin") redirect("/");
 *
 * This page must NOT — a Student needs it for the theme. So it gates by
 * SECTION, and it gates the READ as well as the render: a Student is not
 * authorised to list batches, so calling listBatches for them would surface a
 * 403 on their own settings page. The early return below is what keeps that
 * request from being issued at all.
 */
export default async function SettingsPage() {
  const user = await getCurrentUserOrRedirect();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  const appearance = (
    <Panel title="Appearance">
      <ThemeControl current={theme} />
    </Panel>
  );

  if (user.role !== "Admin") {
    return (
      <div>
        <PageTitle>Settings</PageTitle>
        <div className="max-w-[640px]">{appearance}</div>
      </div>
    );
  }

  const client = await apiClient();
  const { data: batches, error } = await listBatches({ client });
  const batchOptions = (batches ?? []).map((b) => ({ id: b.id, name: b.name }));

  return (
    <div>
      <PageTitle>Settings</PageTitle>

      {error !== undefined && (
        <div className="mb-6">
          <Panel>
            <p role="alert" style={{ color: "var(--st-missed)" }}>
              {error.detail ?? error.title ?? "Something went wrong."}
            </p>
          </Panel>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {appearance}

        <Panel title="Register">
          <RegisterForm batches={batchOptions} />
        </Panel>
      </div>
    </div>
  );
}
