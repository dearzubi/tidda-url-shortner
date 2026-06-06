# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
FROM node:26.3.0-alpine@sha256:144769ec3f32e8ee36b3cfde91e82bee25d9367b20f31a151f3f7eea3a2a8541 AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# CI=true skips pnpm 11's interactive deps-purge prompt during nested
# pnpm invocations (the deps-status check is non-TTY in Docker).
ENV CI=true
# pnpm 11 auto-runs `pnpm install` before every script. We install
# explicitly in the deps stage; skip the runtime check here. Without this,
# pnpm tries to install which triggers the root prepare (`lefthook install`),
# and lefthook needs `git` which isn't in alpine.
ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false
RUN corepack enable

WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY scripts/only-pnpm.cjs ./scripts/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/biome-config/package.json packages/biome-config/
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY . .
RUN pnpm --filter @tidda/shared build
RUN pnpm --filter @tidda/backend build
# pnpm deploy produces a flat, prod-only node_modules with workspace deps
# resolved (@tidda/shared is hard-linked in). The 'files' field in each
# workspace package.json restricts what gets copied.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @tidda/backend deploy --prod /deploy

FROM node:26.3.0-alpine@sha256:144769ec3f32e8ee36b3cfde91e82bee25d9367b20f31a151f3f7eea3a2a8541 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /deploy /app
USER node
EXPOSE 3000
CMD ["node", "--require", "./dist/instrumentation.js", "dist/main.js"]

FROM runtime AS aws-runtime
USER root
ENV DATABASE_SSL_CA_FILE=/opt/aws-rds/global-bundle.pem
RUN mkdir -p /opt/aws-rds
ADD --chmod=0444 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /opt/aws-rds/global-bundle.pem
USER node

FROM runtime AS default
