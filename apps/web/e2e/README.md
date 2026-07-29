# End-to-end smoke test

Proves the chain this slice exists to prove: browser → Auth.js → encrypted
cookie → decrypt → `@irp/client` → `apps/api` → Postgres → rendered user.

## Prerequisites

1. Postgres running and migrated:

   ```powershell
   $env:IRP_DB_PORT = "5433"
   docker compose -f apps/api/docker-compose.yml up -d
   $env:DATABASE_URL = "postgresql://irp:irp@127.0.0.1:5433/irp?schema=public"
   pnpm --filter @irp/api exec prisma migrate deploy
   ```

2. The two registered dev users. `dev-unknown-1` is deliberately absent —
   the test asserts it produces a 403.

   **Re-seed before every Playwright run.** `apps/api`'s own test suites
   `TRUNCATE` the `User` table, so a `pnpm --filter @irp/api test` run wipes
   these rows out again even if you seeded them earlier in the session.

   ```sql
   INSERT INTO "User" ("id", "externalId", "email", "displayName", "role", "createdAt", "updatedAt")
   VALUES
     (gen_random_uuid(), 'dev-admin-1',   'mentor@dev.local',  'Dev Mentor',  'ADMIN',   now(), now()),
     (gen_random_uuid(), 'dev-student-1', 'student@dev.local', 'Dev Student', 'STUDENT', now(), now())
   ON CONFLICT ("externalId") DO NOTHING;
   ```

   Via `docker compose exec` (PowerShell):

   ```powershell
   docker compose -f apps/api/docker-compose.yml exec -T db psql -U irp -d irp -c "INSERT INTO \"User\" (\"id\", \"externalId\", \"email\", \"displayName\", \"role\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), 'dev-admin-1', 'mentor@dev.local', 'Dev Mentor', 'ADMIN', now(), now()), (gen_random_uuid(), 'dev-student-1', 'student@dev.local', 'Dev Student', 'STUDENT', now(), now()) ON CONFLICT (\"externalId\") DO NOTHING;"
   ```

3. `apps/api/.env` and `apps/web/.env.local` from their `.env.example` files,
   with `AUTH_DEV_BYPASS=true` and the API pointed at the dev JWKS:

   ```bash
   # apps/api/.env
   JWKS_URI=http://localhost:3000/api/dev-jwks
   JWT_ISSUER=http://localhost:3000/api/dev-jwks
   JWT_AUDIENCE=api://irp-progress-management
   ```

   `apps/web/.env.local` needs `AUTH_SECRET` set (any 32+ random bytes,
   `openssl rand -base64 32`) so the session cookie can be encrypted and
   decrypted, and `AUTH_DEV_BYPASS=true` so the dev identity picker renders
   on `/signin` instead of the Microsoft Entra button.

## Run

```powershell
pnpm --filter @irp/web exec playwright install chromium
pnpm --filter @irp/web e2e
```

If the JWKS fetch fails, `apps/api` returns **503** rather than 401 (Task
11's behaviour). Check `JWKS_URI` in `apps/api/.env` points at
`http://localhost:3000/api/dev-jwks` and that `apps/web` is up.
