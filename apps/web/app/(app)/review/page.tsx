import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUserOrRedirect } from "@/lib/api-client";
import { PageTitle } from "@/components/ui/page-title";
import { Panel } from "@/components/ui/panel";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * The Review landing page. There is no student directory here -- the roster
 * is that directory, and every row already links to the per-student review
 * view (roster/page.tsx). Admin-only, matching every other mentor-only page:
 * a Student caller is bounced to "/" rather than shown a 403.
 */
export default async function ReviewLandingPage() {
  const user = await getCurrentUserOrRedirect();
  if (user.role !== "Admin") redirect("/");

  return (
    <div>
      <PageTitle>Review</PageTitle>
      <Panel>
        <EmptyState
          title="Pick a student from the roster."
          hint="Every roster row links to that student's review view."
        />
        <div className="mt-4 flex justify-center">
          <Link href="/roster" className="text-link">
            Go to Roster
          </Link>
        </div>
      </Panel>
    </div>
  );
}
