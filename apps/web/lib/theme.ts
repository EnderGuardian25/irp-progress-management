/**
 * The theme contract, in one place because three consumers must agree: the root
 * layout (reads the cookie, stamps the attribute), the Server Action (writes the
 * cookie), and the client control (renders the options).
 *
 * Deliberately free of `next/*` imports and of `server-only` — the client
 * control imports THEMES and Theme, and a server-only marker here would make
 * that a build error.
 */
export const THEME_COOKIE = "irp-theme";

export const THEMES = ["light", "dark", "system"] as const;

export type Theme = (typeof THEMES)[number];

/**
 * The single gate between untrusted input and a DOM attribute. Written as an
 * explicit disjunction rather than `THEMES.includes(value as Theme)` so that
 * TypeScript narrows `value` itself and no cast is needed — a cast here would
 * be asserting exactly the thing this function exists to check.
 *
 * Anything unrecognised degrades to "system", which is also the no-cookie
 * default, so a tampered or stale cookie is indistinguishable from a first
 * visit rather than being an error state to handle.
 */
export function parseTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}
