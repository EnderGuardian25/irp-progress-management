/**
 * The one button vocabulary across every screen — docs/design-system.md §9.
 * All seven interactive states (default, hover, focus, active, disabled,
 * loading, error) live in the `.btn`/`.btn-*` classes in app/globals.css;
 * this component only ever picks a variant.
 *
 * `loading` renders the label at reduced opacity + `aria-busy` — never a
 * spinner swap (§9: skeletons for loading, never a centred spinner; a
 * spinner-swap here would also flash the button to a different size).
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";

const VARIANT_CLASS = {
  primary: "btn btn-primary",
  quiet: "btn btn-quiet",
  danger: "btn btn-danger",
} as const;

export function Button({
  children,
  variant = "primary",
  loading = false,
  disabled,
  ...rest
}: {
  children: ReactNode;
  variant?: keyof typeof VARIANT_CLASS;
  loading?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={VARIANT_CLASS[variant]}
      disabled={disabled === true || loading}
      aria-busy={loading || undefined}
    >
      {children}
    </button>
  );
}
