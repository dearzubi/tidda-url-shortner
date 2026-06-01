# Tidda

Tidda is a production-grade URL shortener built as a hands-on system design
project. The goal is to take a deliberately small product surface, shortening
URLs and redirecting users reliably, and use it to practise the engineering
work behind a real service: API design, persistence, caching, rate limits,
observability, deployment, and operational runbooks.

## Quick start

### 1. Set up local tooling

```bash
nvm use
corepack enable
```

The Docker Compose stack uses the Loki Docker logging driver. Install it once
per Docker host. Use `3.7.0-arm64` on ARM64 hosts.

```bash
docker plugin install grafana/loki-docker-driver:3.7.0 --alias loki --grant-all-permissions
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Build the project

```bash
pnpm build
```

### 4. Prepare the root environment file

```bash
cp .env.example .env
```

The root `.env` is used by Docker Compose and is not committed.
Per-app env files (`apps/*/.env`, `apps/*/.env.development`) are committed
with safe defaults and are loaded automatically. Override locally with
`apps/*/.env.local` or `apps/*/.env.development.local` (both gitignored).

If the default Postgres host port is already in use, change `POSTGRES_PORT` in
the root `.env` and set `DATABASE_URL` in `apps/backend/.env.development.local`
to the same host port.

### 5. Run with local Node processes

Use Docker Compose for the supporting services, then run the backend and web app
through pnpm.

```bash
pnpm compose up -d postgres redis
pnpm db:migrate
pnpm dev
```

### 6. Run fully through Docker Compose

Use this when you want the app and supporting services to run in containers.
The Compose stack runs the one-shot `migrate` service before the backend starts.

```bash
pnpm compose up -d --build
```

## Single-VPS production

See [VPS production deployment](docs/runbooks/vps-production-deployment.md)
for the single-server production guide.

## AWS production

See [AWS Control Setup Runbook](docs/runbooks/aws-control-setup.md) for AWS
deployment setup through GitHub Actions and Terraform.
