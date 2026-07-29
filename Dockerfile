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
COPY apps/api/package.json        ./apps/api/package.json
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
RUN set -eu; \
    for leaked in packages/types/src packages/client/src apps/api/src/generated; do \
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
