"use client";

import { Button } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import { Panel } from "@/components/ui/panel";

/**
 * The (app) group's error boundary. Every page already handles the SDK's
 * `{ data, error }` shape inline, so this catches the other class of failure:
 * a throw during render — a missing session, a malformed response, a bug.
 * Without it those reached Next's default error page, which drops the app
 * frame entirely and tells the user nothing.
 *
 * §11: "Errors don't apologise and are never vague about what happened." So
 * this names the failure and offers the retry, and does not say sorry. The
 * `digest` is the only handle on a server-side throw (Next redacts the real
 * message in production by design), so it is shown rather than swallowed —
 * it is what makes a user's report traceable in App Insights.
 *
 * Must be a Client Component: `reset` is a function prop, and error
 * boundaries are a client-side React feature.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <PageTitle>This page didn&apos;t load</PageTitle>
      <Panel>
        <p role="alert" style={{ color: "var(--ink)" }}>
          Something failed while building this page. Nothing you submitted has been lost.
        </p>
        {error.digest !== undefined && (
          <p className="tabular mt-2 text-sm" style={{ color: "var(--ink-muted)" }}>
            Reference {error.digest}
          </p>
        )}
        <div className="mt-4">
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        </div>
      </Panel>
    </div>
  );
}
