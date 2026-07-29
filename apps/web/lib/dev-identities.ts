/**
 * Data only — labels and opaque identifiers, nothing that can sign or decrypt
 * anything. This module pulls in no signing library and no auth framework, so
 * it is safe to import from a Client Component (see
 * app/(auth)/signin/dev-identity-picker.tsx in Task 8). The keypair, token
 * minting, and provider wiring that need those packages live in the sibling
 * module instead, guarded so importing it from client code fails the build.
 */

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
export const DEV_IDENTITIES: readonly DevIdentity[] = [
  { id: "mentor", label: "Mentor (Admin)", oid: "dev-admin-1", email: "mentor@dev.local", name: "Dev Mentor" },
  { id: "student", label: "Student", oid: "dev-student-1", email: "student@dev.local", name: "Dev Student" },
  { id: "unknown", label: "Unregistered user (expect 403)", oid: "dev-unknown-1", email: "nobody@dev.local", name: "Unregistered" },
];

export const DEV_ISSUER = "http://localhost:3000/api/dev-jwks";
