/**
 * Data only — labels and opaque identifiers, nothing that can sign or decrypt
 * anything. This module pulls in no signing library and no auth framework, so
 * it is safe to import from a Client Component (see
 * app/(auth)/signin/dev-identity-picker.tsx in Task 8). The keypair, token
 * minting, and provider wiring that need those packages live in the sibling
 * module instead, guarded so importing it from client code fails the build.
 */

import { SEED_MENTORS, SEED_STUDENTS } from "@irp/fixtures";

export interface DevIdentity {
  id: string;
  label: string;
  /** Becomes the token's `oid`. apps/api matches it to User.externalId. */
  oid: string;
  email: string;
  name: string;
}

/**
 * No `role` field, deliberately. Role lives in the User row and reaches the web
 * app only via GET /api/v1/me — see spec §4.1a. Switching identity switches the
 * oid; the role follows from the database.
 *
 * dev-unknown-1 has NO User row on purpose. It must produce a 403 and land on
 * /not-registered, turning the spec's most load-bearing authorization rule into
 * something clickable rather than something only a test knows about.
 */

/**
 * Derived from @irp/fixtures — the same constants the database seed writes —
 * so the picker and the seeded rows cannot drift (spec §6). Plan 5 keeps the
 * picker at three entries; the full persona picker is Plan 6.
 */
export const DEV_IDENTITIES: readonly DevIdentity[] = [
  {
    id: "mentor",
    label: "Mentor (Admin)",
    oid: SEED_MENTORS[0]!.externalId,
    email: SEED_MENTORS[0]!.email,
    name: SEED_MENTORS[0]!.name,
  },
  {
    id: "student",
    label: "Student",
    oid: SEED_STUDENTS[0]!.externalId,
    email: SEED_STUDENTS[0]!.email,
    name: SEED_STUDENTS[0]!.name,
  },
  { id: "unknown", label: "Unregistered user (expect 403)", oid: "dev-unknown-1", email: "nobody@dev.local", name: "Unregistered" },
];

/**
 * The `iss` claim the dev bypass stamps on every token it mints.
 *
 * **It is an opaque identifier, not a network target.** `apps/api` STRING-
 * COMPARES it against `JWT_ISSUER`; the address it actually fetches keys from
 * is `JWKS_URI`, which is a separate variable and deliberately differs
 * (`127.0.0.1`, because `localhost` prefers `::1` on the Windows dev machines).
 *
 * Because it is a constant and not derived from `AUTH_URL`, moving the web dev
 * server to another port does NOT move this string — the two are only coupled
 * by every copy being edited together. It must stay byte-identical to
 * `JWT_ISSUER` in all THREE places that set one for the dev chain:
 * `apps/api/.env` (yours, git-ignored), `apps/web/playwright.config.ts`'s `api`
 * webServer, and the e2e step in `.github/workflows/ci.yml` — and to the value
 * `ONBOARDING.md` §4 and `apps/web/e2e/README.md` tell a newcomer to type.
 * (`apps/api/.env.example` is not one of them: it ships the real Entra issuer,
 * which §4 then tells you to replace.) A mismatch is not
 * a startup error — the API boots fine and returns 401 on every request, which
 * reads as "my session expired" rather than "a config value disagrees".
 */
export const DEV_ISSUER = "http://localhost:3100/api/dev-jwks";
