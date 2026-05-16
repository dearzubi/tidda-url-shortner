# Template

A reusable full-stack TypeScript application template with NestJS, Fastify,
React, PostgreSQL, Redis, Docker Compose, and observability built in. See
`AGENTS.md` for conventions, `docs/adr/` for recorded architectural decisions,
and `docs/runbooks/` for operational guides.

## Quick start

```bash
nvm use            # Node 24
corepack enable    # pnpm 11
pnpm install
cp .env.example .env    # docker-compose values; not committed
# Install once per Docker host. Use 3.7.0-arm64 on ARM64 hosts.
docker plugin install grafana/loki-docker-driver:3.7.0 --alias loki --grant-all-permissions
pnpm compose up -d      # postgres, redis, prometheus, grafana, loki, tempo
pnpm dev
```

After cloning for a new project, run the one-time rename helper:

```bash
bash scripts/init-project.sh acme
```

Replace `acme` with the package scope and infrastructure prefix you want for
the new project. The script updates workspace package names, local development
database placeholders, compose identifiers, and observability queries. It also
adds `docs/superpowers/` to `.git/info/exclude` for local AI-agent working
files.

Per-app env files (`apps/*/.env`, `apps/*/.env.development`) are committed
with safe defaults and are loaded automatically. Override locally with
`apps/*/.env.local` or `apps/*/.env.development.local` (both gitignored).

## Single-VPS production

See [VPS production deployment](docs/runbooks/vps-production-deployment.md)
for the single-server production guide.
