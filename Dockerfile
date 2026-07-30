# syntax=docker/dockerfile:1.7
#
# One build graph, several final targets. Both application images come from the
# SAME `generated` stage on purpose: types and the client SDK are generated from
# spec/openapi.yaml, and two images built from two generation runs would be a
# contract-drift bug with no runtime symptom.
#
# Build from the REPOSITORY ROOT:
#   docker build --target api     -t irp-api     .
#   docker build --target web     -t irp-web     .
#   docker build --target migrate -t irp-migrate .

##############################  base  ##############################
# node:24-slim, not alpine. Debian/glibc matches Prisma's
# debian-openssl-3.0.x binary target; musl needs a different target and fails
# at runtime rather than at build time.
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
WORKDIR /repo

##############################  deps  ##############################
# Manifests and the lockfile ONLY, so this layer is cached until a dependency
# actually changes. Copying source here would rebuild the dependency tree on
# every edit and put NFR-5's 8-minute budget at risk.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json        ./apps/web/package.json
COPY packages/core/package.json   ./packages/core/package.json
COPY packages/types/package.json  ./packages/types/package.json
COPY packages/client/package.json ./packages/client/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

###########################  generated  ############################
FROM deps AS generated
# prisma generate resolves env("DATABASE_URL") through prisma.config.ts from the
# real process env — Prisma 7 dropped implicit .env loading, so a bare
# `prisma generate` fails PrismaConfigEnvError. The value only has to PARSE;
# generate never connects. This is a throwaway.
ARG DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
ENV DATABASE_URL=${DATABASE_URL}

COPY tsconfig.base.json redocly.yaml ./
COPY spec/ ./spec/
COPY packages/types/ ./packages/types/
COPY packages/client/ ./packages/client/
COPY apps/api/prisma/ ./apps/api/prisma/
COPY apps/api/prisma.config.ts ./apps/api/prisma.config.ts

# Gate: the build context must never carry generated output. .dockerignore is
# what keeps it out; this proves .dockerignore is still doing its job. A stale
# generated file that survives into the image is a second version of the
# contract, and it has no runtime symptom until something deserialises wrong.
#
# Only these two paths: they are the only generated-output paths this stage
# actually copies (packages/types/ and packages/client/, above). apps/api/src
# is never copied here at all, so apps/api/src/generated could never arrive
# through this stage regardless of .dockerignore — checking for it here would
# be a gate that always passes for a reason unrelated to correctness. That
# check belongs in the `build` stage (Task 6), which follows its
# `COPY apps/api/ ./apps/api/` and `COPY apps/web/ ./apps/web/` — the first
# point a leak in that path could actually reach an image.
RUN set -eu; \
    for leaked in packages/types/src packages/client/src; do \
      if [ -e "$leaked" ]; then \
        echo "FATAL: $leaked arrived from the build context."; \
        echo "Generated output must be produced in-image, never copied in."; \
        echo "Check .dockerignore — this is a regression, not a warning."; \
        exit 1; \
      fi; \
    done

RUN mkdir -p packages/types/src packages/client/src
RUN pnpm generate
RUN pnpm --filter @irp/api exec prisma generate

#############################  migrate  #############################
# A SEPARATE image because ADR-0009 D3 runs migrations as a Container Apps Job.
# It builds FROM deps, not from the api target: `prisma` is a devDependency, so
# the production-only API image cannot run `prisma migrate deploy` at all.
FROM deps AS migrate
ENV NODE_ENV=production
# Prisma writes to a cache directory; give the non-root user somewhere writable.
ENV HOME=/tmp
COPY apps/api/prisma/ ./apps/api/prisma/
COPY apps/api/prisma.config.ts ./apps/api/prisma.config.ts
USER node
WORKDIR /repo/apps/api
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

##############################  build  ##############################
FROM generated AS build
ARG APP_VERSION=0.0.0
ENV APP_VERSION=${APP_VERSION}
# Explicit rather than merely absent. next build sets NODE_ENV=production, and
# assertBypassNotInProduction correctly refuses to build with the flag on — so
# state the safe value instead of depending on it being unset.
ENV AUTH_DEV_BYPASS=false
# Build stage ONLY; never copied into a final image. Auth.js requires a secret
# to exist while prerendering. The real one is injected at runtime.
ENV AUTH_SECRET=build-only-placeholder-not-a-runtime-secret

# apps/api/src/generated already exists at this point in `build` — the
# `generated` stage's own `RUN pnpm --filter @irp/api exec prisma generate`
# put it there in-image, and `build` inherits it via `FROM generated`. A bare
# existence check (Task 5's pattern for packages/types/src and
# packages/client/src) CANNOT detect a leak here, because unlike those two
# paths, this one is never structurally absent in this stage — it exists
# before the COPYs below even run. Hash its contents first, so the gate that
# follows the COPYs can tell "changed because of the COPY" apart from "was
# already here, generated in-image" — the actual risk this guards against is
# a stale host copy silently overwriting a same-named freshly generated file,
# which an existence check would never see either way.
#
# The manifest is more than `find -type f | sha256sum`: a bare file hash
# misses two leak shapes entirely — a leaked EMPTY DIRECTORY has no file
# inside to hash, and sha256sum only reads regular files, so a leaked
# SYMLINK would not change a single hash either. Listing directories and
# recording each symlink's target alongside the file hashes means either
# shape still changes the diff below.
RUN { find apps/api/src/generated -type f -exec sha256sum {} + | sort; \
      find apps/api/src/generated -type d | sort; \
      find apps/api/src/generated -type l -exec sh -c 'printf "%s -> %s\n" "$1" "$(readlink "$1")"' sh {} \; | sort; \
    } > /tmp/generated-src.before

COPY packages/core/ ./packages/core/
COPY apps/api/ ./apps/api/
COPY apps/web/ ./apps/web/

# Gate: apps/api/src/generated must never arrive — or be altered — via the
# build context. The `generated` stage's leak check (Task 5) cannot cover
# this path at all, since that stage never copies apps/api/src; this is the
# first (and only) stage where a leak in it could actually reach an image,
# so the comparison runs immediately after the COPY that could carry it.
RUN set -eu; \
    { find apps/api/src/generated -type f -exec sha256sum {} + | sort; \
      find apps/api/src/generated -type d | sort; \
      find apps/api/src/generated -type l -exec sh -c 'printf "%s -> %s\n" "$1" "$(readlink "$1")"' sh {} \; | sort; \
    } > /tmp/generated-src.after; \
    if ! diff -q /tmp/generated-src.before /tmp/generated-src.after > /dev/null; then \
      echo "FATAL: apps/api/src/generated arrived from the build context."; \
      echo "Generated output must be produced in-image, never copied in."; \
      echo "Check .dockerignore — this is a regression, not a warning."; \
      exit 1; \
    fi; \
    rm -f /tmp/generated-src.before /tmp/generated-src.after

RUN pnpm --filter @irp/core build
# Declaration-only emit. apps/web resolves TYPES from dist/*.d.ts so it can stay
# fully strict; without this its tsc pulls generated runtime into its own
# program. Must precede the web build.
RUN pnpm --filter @irp/client build
RUN pnpm --filter @irp/api build
RUN pnpm --filter @irp/web build

############################  prod-deps  ############################
# A second, production-only dependency tree. Kept separate from `deps` so the
# api image never carries devDependencies — image size is cold-start time under
# ADR-0009 D5's scale-to-zero.
#
# All five manifests are still copied — pnpm --frozen-lockfile checks the
# whole workspace against pnpm-lock.yaml and complains about missing
# manifests otherwise — but apps/web/package.json is copied for LOCKFILE
# COMPLETENESS only, not because the api image needs anything web resolves.
# --filter @irp/api... scopes the actual install to @irp/api and its
# workspace dependencies (packages/core), so next/next-auth/react never
# enter this stage's node_modules at all. Without the filter this install
# pulled in apps/web's entire production dependency tree too, and the api
# image it fed was 1.38GB — a filtered install brought it down without
# touching the whole-tree COPY below, which is what actually protects the
# pnpm symlinks (see the comment on that COPY in the `api` stage).
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json        ./apps/api/package.json
COPY apps/web/package.json        ./apps/web/package.json
COPY packages/core/package.json   ./packages/core/package.json
COPY packages/types/package.json  ./packages/types/package.json
COPY packages/client/package.json ./packages/client/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @irp/api...

###############################  api  ###############################
FROM base AS api
ARG APP_VERSION=0.0.0
ENV NODE_ENV=production \
    PORT=3001 \
    APP_VERSION=${APP_VERSION}

# Whole-tree copy on purpose. prod-deps contains only manifests and
# node_modules, and copying it wholesale preserves pnpm's relative symlinks
# (apps/api/node_modules/@irp/core -> ../../../packages/core) which
# path-by-path copies would break. It also avoids a COPY of
# packages/core/node_modules, which does not exist under --prod because
# @irp/core has devDependencies only — and a COPY of a missing path fails.
COPY --from=prod-deps /repo/ ./

# tsc compiles src/generated/prisma into dist/generated/prisma, and
# dist/db/client.js resolves ../generated/prisma/client.js inside dist/. So
# dist alone is sufficient; src/generated is NOT needed at runtime.
COPY --from=build /repo/packages/core/dist ./packages/core/dist
COPY --from=build /repo/apps/api/dist ./apps/api/dist

USER node
WORKDIR /repo/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]

###############################  web  ###############################
FROM base AS web
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The standalone tree is already self-contained: Next traced exactly the files
# the server needs (outputFileTracingRoot is the repo root — see
# apps/web/next.config.ts). In a monorepo it emits apps/web/server.js and a
# node_modules at its own root, so copying it to /repo reproduces that layout.
COPY --from=build /repo/apps/web/.next/standalone/ ./
# Static assets are deliberately NOT traced into standalone and must be copied
# separately, or every /_next/static request 404s and the page renders unstyled.
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static

# NOTE: there is no apps/web/public/ in this repository. A COPY of it would
# fail the build. Add one here if that directory is ever created.

USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
