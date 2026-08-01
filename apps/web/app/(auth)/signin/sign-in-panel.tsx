import { DevIdentityPicker } from "./dev-identity-picker";

export interface SignInPanelProps {
  /** AUTH_DEV_BYPASS === "true". Impossible in production — see ADR-0012. */
  bypassEnabled: boolean;
  /** All three AUTH_MICROSOFT_ENTRA_ID_* variables present and non-empty. */
  entraConfigured: boolean;
  /** Server action that starts the Entra flow. Passed in rather than imported
   *  so this component can be rendered in a unit test: importing @/auth pulls in
   *  real next-auth, which needs next/server and is unresolvable under Vitest. */
  signInAction: () => void | Promise<void>;
}

/**
 * Which sign-in control to show, in one place.
 *
 * THREE states, not two. The third — neither the bypass nor Entra — became
 * reachable the moment Plan 4B deployed an environment: NODE_ENV is production
 * there, so the bypass is refused by the guard, and Entra is unconfigured
 * because that work is deferred. Before this component, that combination
 * rendered a "Sign in with Microsoft" button wired to a provider that was never
 * registered: it looked right, threw nothing, and did nothing. That is the exact
 * failure class this repository keeps being caught by, and it would have been
 * the first thing a mentor clicked.
 *
 * The bypass deliberately wins when both are somehow set. It cannot be set in
 * production, but this component should not be the thing relying on that.
 */
export function SignInPanel({
  bypassEnabled,
  entraConfigured,
  signInAction,
}: SignInPanelProps): React.JSX.Element {
  if (bypassEnabled) {
    return <DevIdentityPicker />;
  }

  if (entraConfigured) {
    return (
      <form action={signInAction}>
        <button
          type="submit"
          className="cursor-pointer rounded-[var(--radius-control)] bg-primary px-4 py-2 font-semibold text-white transition duration-150 ease-out-quart hover:brightness-110 active:brightness-95 active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0"
        >
          Sign in with Microsoft
        </button>
      </form>
    );
  }

  return (
    <div
      className="rounded-[var(--radius-control)] border p-4"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      <p className="mb-2 text-sm font-semibold" style={{ color: "var(--ink)" }}>
        Sign-in is not configured in this environment.
      </p>
      <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
        No identity provider is available, so there is deliberately nothing to
        click. Set the three <code>AUTH_MICROSOFT_ENTRA_ID_*</code> variables to
        enable Microsoft sign-in, or <code>AUTH_DEV_BYPASS=true</code> for local
        development.
      </p>
    </div>
  );
}
