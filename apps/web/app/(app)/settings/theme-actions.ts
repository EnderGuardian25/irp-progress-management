"use server";

import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";

/**
 * Persists the theme choice. ADR-0021.
 *
 * No `revalidatePath`: the control has already set the attribute on the live
 * document, so the DOM is correct before this resolves. Revalidating would
 * re-render the tree for no change and show as a flicker — §10 budgets
 * transitions at 150-250ms and a theme switch should be instant.
 *
 * `httpOnly: true` because only the server ever READS this cookie. The control
 * receives the current value as a prop, so the client never needs to parse it,
 * and keeping it off `document.cookie` removes it as a script-reachable surface.
 */
export async function setTheme(value: string): Promise<{ error: string } | null> {
  // parseTheme degrades anything unrecognised to "system", so a value that does
  // not survive the round trip was not one we offer. Comparing against the
  // parser rather than re-listing the options keeps one source of truth: the
  // cookie's value is stamped directly into a DOM attribute by layout.tsx, so
  // this is the gate that matters.
  const theme = parseTheme(value);
  if (theme !== value) {
    return { error: "That is not a theme this app offers." };
  }

  (await cookies()).set({
    name: THEME_COOKIE,
    value: theme,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });

  return null;
}
