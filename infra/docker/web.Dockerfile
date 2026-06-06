# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
FROM node:26.3.0-alpine@sha256:144769ec3f32e8ee36b3cfde91e82bee25d9367b20f31a151f3f7eea3a2a8541 AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
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
RUN pnpm --filter @tidda/web build

FROM caddy:2.11.3-alpine@sha256:86deaf5e3d3408a6ccec08fbb79989783dd26e206ae10bcf78a801dc8c9ab794 AS runtime
RUN setcap -r /usr/bin/caddy \
  && addgroup -S caddy \
  && adduser -S -D -H -h /var/lib/caddy -s /sbin/nologin -G caddy caddy \
  && mkdir -p /data /config \
  && chown -R caddy:caddy /data /config
COPY --chown=caddy:caddy infra/docker/Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chown=caddy:caddy /repo/apps/web/dist /usr/share/caddy
USER caddy
EXPOSE 8080
