# ADR-0021 — Theme persistence by server-readable cookie

- **Status:** Accepted
- **Date:** 2026-08-04
- **Deciders:** Damian De Cruz (Spec / Build / Review — solo sprint, `docs/interview-and-prd.md` §4.1)
- **Requirements:** None directly — closes [ADR-0002](0002-light-default-with-dark-support.md); tracked as **O-14** in `docs/interview-and-prd.md` §5
- **Relates to:** [ADR-0002](0002-light-default-with-dark-support.md), `docs/design-system.md` §3.3

---

## Context

ADR-0002 accepted "light default, dark supported, both contrast-verified" and committed to
re-tuning the semantic status colours per theme rather than reusing them. That work is done:
`globals.css` carries 13 dark tokens plus a re-tuned status ramp. None of it is reachable by a
mentor or student today except by changing the operating system's own theme — there is no
`data-theme` hook anywhere in the markup and no control that sets one. A theme that ships fully
verified but cannot be switched from inside the product is not a feature; it is unused CSS with
an ADR attached to it.

Closing that gap needs somewhere to keep the choice once a person makes it, and that somewhere
has to be readable on the server. The root layout renders on every request, and it is the layout
— not any individual page — that has to decide which token set the browser receives before the
first byte of markup goes out. Anything the server cannot read at that moment produces a page
that starts in one theme and jumps to another, which is worse than not offering the choice.

## Decision

Persist the choice in a cookie, `irp-theme`, with `httpOnly`, `sameSite=lax`, `path=/`, a
one-year lifetime, and `secure` set outside development. The root layout reads the cookie
during server rendering and stamps `data-theme` on `<html>` before the page streams, so the
correct theme is present in the very first markup the browser paints.

## Rejected alternatives

**1. `localStorage`.** The obvious first reach for a client-only preference, and it needs no
server involvement at all. Rejected because the server cannot read it: the root layout would
render with no theme decided, and the only way to correct that before paint is a blocking
inline `<script>` in `<head>` that runs before hydration and patches the DOM. This codebase
avoids exactly that pattern deliberately elsewhere, and the alternative to writing it is a
visible flash of the wrong theme on every cold navigation — precisely the kind of defect a
dark-mode audit exists to catch, reintroduced by the mechanism meant to fix reachability.

**2. A `themePreference` column on `User`.** Genuinely the better long-term answer, because it
follows a person across devices and browsers rather than pinning the choice to one cookie jar.
Rejected here on cost and on logic, not on merit. The cost: a full spec-first cycle — an
`openapi.yaml` change carrying the four mandated responses, examples, and Problem Details; a
Prisma migration; a handler; regenerated types and a regenerated client — for a preference this
slice does not otherwise need. The logic: it does not even remove the cookie. The root layout
renders before any API call can resolve, so a column-backed preference still needs a cookie to
avoid the exact SSR flash rejected alternative 1 describes. That makes the column **additive**
work layered on top of this decision, not a substitute for it. Revisit if cross-device
preference is ever asked for on its own terms.

**3. No switch at all; leave dark to the operating system.** The status quo, and it costs
nothing further. Rejected because it leaves ADR-0002's "dark supported" false in the only sense
that matters to a user: support nobody inside the product can reach is not support. The dark
tokens are shipped and contrast-verified either way, so the real choice on the table is between
finishing ADR-0002 and reverting it — and reverting throws away a completed, audited piece of
work to avoid building one cookie read.

## Consequences

- Reading a cookie in the root layout forces dynamic rendering for every route under it.
  `/_not-found` and `/not-registered` stop being statically prerendered; this is a deliberate,
  named cost of reachability, not a regression to chase back out.
- The dark token block in `globals.css` now has to be kept honest against the light block by
  something other than a comment. A parity test — not a person re-reading the file on every
  change — is what stops the two blocks from drifting apart once a second person, or a future
  Claude Code session, edits one without the other in front of them.
- The mentor sign-off tracked at **O-14** is about whether finishing ADR-0002 is wanted at all,
  not about this ADR's mechanism. If O-14 comes back "no", the cookie plumbing is reverted
  independently of the FR-3 registration move this same plan makes, because the two are kept in
  separate commits for exactly that reason.
