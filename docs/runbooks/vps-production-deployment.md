# VPS Production Deployment

This guide deploys Template to a single VPS with Docker Compose.

## Deployment Model

Production uses the base compose file plus a production override:

```bash
pnpm compose:prod
```

This expands to:

```bash
docker compose --env-file .env \
  -f infra/compose/docker-compose.yml \
  -f infra/compose/docker-compose.prod.yml
```

The production override keeps only Caddy public:

```text
Internet
  to Caddy on ports 80 and 443
    to backend on Docker's private network

Private Docker network:
  backend
  postgres
  redis
  prometheus
  grafana
  loki
  otel-collector
  tempo
```

The `web` service joins both the public and private Docker networks. Every
other service joins only the private network. The private network is marked
`internal: true`, so it is not directly reachable from outside Docker.
Container logs are shipped to Loki by the Docker Loki logging driver. This keeps
log collection out of the application containers and avoids mounting the Docker
socket into an observability container.

Backend traces are exported directly from the backend OpenTelemetry SDK to
Tempo over Docker-internal OTLP HTTP. Grafana is provisioned with Prometheus,
Loki, and Tempo data sources, including trace-to-log and log-to-trace links.
The backend image starts Node with:

```bash
node --require ./dist/instrumentation.js dist/main.js
```

This preloads OpenTelemetry before Nest and Fastify are imported, while keeping
application bootstrap code separate from instrumentation setup.

## Server Prerequisites

Install these on the VPS:

- Docker Engine
- Docker Compose plugin
- Loki Docker logging driver plugin
- Git
- Node 24 and Corepack if you want to run pnpm commands directly on the VPS

Open only these public firewall ports:

```text
22/tcp    SSH
80/tcp    HTTP
443/tcp   HTTPS
```

Do not open Postgres, Redis, Prometheus, Loki, Tempo, backend, or Grafana to the
public internet. Loki is bound to the VPS loopback interface only so the Docker
daemon can push container logs through the Loki logging driver. Tempo stays on
the private Docker network only; Grafana queries it through Docker-internal
networking.

Install the Loki Docker logging driver plugin on the VPS. Pick the tag that
matches the host architecture:

```bash
# amd64 hosts
docker plugin install grafana/loki-docker-driver:3.7.0 \
  --alias loki \
  --grant-all-permissions

# arm64 hosts
docker plugin install grafana/loki-docker-driver:3.7.0-arm64 \
  --alias loki \
  --grant-all-permissions
```

Check that the plugin is enabled:

```bash
docker plugin ls
```

## Check Out the Project

Clone the repository onto the VPS. Replace `my-app` with your project
directory name:

```bash
git clone <repo-url> my-app
cd my-app
```

Enable pnpm through Corepack and install workspace dependencies:

```bash
corepack enable
pnpm install
```

If you do not want Node and pnpm on the VPS, skip `pnpm install` and define a
temporary shell helper for the raw Docker Compose command:

```bash
compose_prod() {
  docker compose --env-file .env \
    -f infra/compose/docker-compose.yml \
    -f infra/compose/docker-compose.prod.yml \
    "$@"
}
```

In that shell session, replace every `pnpm compose:prod ...` command below with
`compose_prod ...`. The helper is not persistent; add it to your deployment
shell profile only if you want it available after logout.

## Prepare DNS

For HTTPS, point your domain's `A` record at the VPS public IP address.

Example:

```text
example.com points to 203.0.113.10
```

If you do not have a domain yet, leave `PUBLIC_HOST` unset and Caddy will serve
plain HTTP on host port `80`. Inside the container it listens on `:8080` so the
runtime can drop privileged port capabilities.

## Configure Environment

Create the root `.env` file on the VPS:

```bash
cp .env.example .env
```

Edit `.env` before starting production:

```env
POSTGRES_DB=my_app
POSTGRES_USER=my_app
POSTGRES_PASSWORD=replace-with-a-strong-password
POSTGRES_PORT=5432

REDIS_PORT=6379

BACKEND_PORT=3000
BACKEND_DB_POOL_MAX=10
BACKEND_DB_POOL_CONNECTION_TIMEOUT_MS=5000
BACKEND_DB_POOL_IDLE_TIMEOUT_MS=30000
BACKEND_SHUTDOWN_DRAIN_DELAY_MS=3000
BACKEND_SHUTDOWN_TIMEOUT_MS=25000
WEB_PORT=5173

# Leave unset for HTTP-only. Set to your domain for automatic HTTPS.
# PUBLIC_HOST=example.com

PROMETHEUS_PORT=9090
GRAFANA_PORT=3001
GRAFANA_ADMIN_PASSWORD=replace-with-a-strong-password
LOKI_PORT=3100
```

Production requirements:

- Replace `POSTGRES_PASSWORD`.
- Replace `GRAFANA_ADMIN_PASSWORD`.
- Leave `PUBLIC_HOST` commented for HTTP-only deployments.
- Set `PUBLIC_HOST` to your real domain only when DNS points at the VPS.
- Keep `.env` out of git. The root `.env` is already gitignored.

## Validate Configuration

Check the merged production compose file:

```bash
pnpm compose:prod config
```

With a domain:

```bash
PUBLIC_HOST=example.com pnpm compose:prod config
```

The resolved config should show:

- `web` publishes `80` and `443`.
- `grafana` publishes only `127.0.0.1:${GRAFANA_PORT}:3000`.
- `loki` publishes only `127.0.0.1:${LOKI_PORT}:3100`.
- `otel-collector` publishes no host ports.
- `tempo` publishes no host ports.
- `postgres`, `redis`, `backend`, `prometheus`, `otel-collector`, and Tempo
  have no public host ports.
- `tempo-init` uses `network_mode: none` and only prepares Tempo volume
  ownership.
- `web` is attached to `public` and `private`.
- every other service is attached only to `private`.
- `private` has `internal: true`.

## Start Production

Build and start the stack:

```bash
pnpm compose:prod up -d --build
```

The production override runs the one-shot `migrate` service before the backend
is allowed to start. If migrations fail, the backend stays down and Caddy has no
healthy application container to serve.

Check container status:

```bash
pnpm compose:prod ps -a
```

The expected steady state is:

- `postgres`, `redis`, and `backend` are `healthy`.
- `web`, `prometheus`, `grafana`, `loki`, `otel-collector`, and `tempo` are
  `Up`.
- `migrate` and `tempo-init` are `Exited (0)`.

Follow logs:

```bash
pnpm compose:prod logs -f
```

For one service:

```bash
pnpm compose:prod logs -f backend
```

## Smoke Test the Deployment

Set the public origin you expect users to hit:

```bash
# HTTP-only by IP
APP_ORIGIN=http://your-vps-ip

# HTTPS by domain
APP_ORIGIN=https://example.com
```

Check that Caddy serves the frontend:

```bash
curl -i "$APP_ORIGIN/"
```

Check the public API path:

```bash
curl -i "$APP_ORIGIN/api/status"
```

Expected response:

```json
{"status":"ok","service":"backend"}
```

Check that private operational endpoints are not exposed through Caddy:

```bash
curl -i "$APP_ORIGIN/api/readyz"
curl -i "$APP_ORIGIN/api/metrics"
```

Both should return `404`. They remain available only inside Docker's private
network.

## Database Migrations

Migrations are part of `pnpm compose:prod up -d --build`. The `migrate` service
waits for Postgres, runs:

```bash
node dist/db/migrate.js up
```

and must complete successfully before the backend starts.

Do not also run migrations manually during normal deploys. Do not run
migrations from every backend replica if you later scale the backend.

## Access the App

HTTP-only mode:

```text
http://your-vps-ip
```

Domain and HTTPS mode:

```text
https://example.com
```

Backend routes are exposed through Caddy under `/api/*`. Caddy strips the
`/api` prefix before proxying to the backend container. Operational backend
endpoints (`/metrics`, `/readyz`, and `/livez`) are intentionally not exposed
through Caddy.

Example API route:

```text
https://example.com/api/status
```

proxies internally to:

```text
backend:3000/status
```

## Access Grafana

Grafana is intentionally bound to the VPS loopback interface, not to the public
internet. Use an SSH tunnel from your local machine:

```bash
ssh -L 3001:127.0.0.1:3001 user@your-vps-ip
```

Keep the SSH session open, then visit:

```text
http://localhost:3001
```

Login:

```text
username: admin
password: value of GRAFANA_ADMIN_PASSWORD from .env
```

If `GRAFANA_PORT` is different, tunnel that port instead:

```bash
ssh -L 4000:127.0.0.1:4000 user@your-vps-ip
```

Grafana is provisioned with:

- Prometheus for backend and Tempo metrics
- Loki for container logs
- Tempo for backend traces

Backend JSON logs include `trace_id` while a request span is active. In Grafana,
this allows log entries to link to Tempo traces, and Tempo spans to query their
matching Loki log lines.

## Smoke Test Observability

Open an SSH tunnel to Grafana as described above. In another local terminal,
check that Grafana can see the provisioned data sources:

```bash
curl -sS -u "admin:<grafana-password>" \
  http://localhost:3001/api/datasources
```

The response should include data sources with these UIDs:

```text
prometheus
loki
tempo
```

Make one request through Caddy so the backend emits a log line and a trace:

```bash
# Use the same origin from the deployment smoke test.
APP_ORIGIN=https://example.com

curl -i "$APP_ORIGIN/api/status"
```

Check Prometheus through Grafana's proxy:

```bash
curl -sS -u "admin:<grafana-password>" \
  "http://localhost:3001/api/datasources/proxy/uid/prometheus/api/v1/query?query=up"
```

Expected signal:

- `job="template-backend"` has value `1`.
- `job="tempo"` has value `1`.

Check that Prometheus scraped the app-owned connectivity metric:

```bash
curl -sS -u "admin:<grafana-password>" \
  "http://localhost:3001/api/datasources/proxy/uid/prometheus/api/v1/query?query=app_connectivity_checks_total"
```

Expected signal:

- `app_connectivity_checks_total` exists for `job="template-backend"`.

Check Loki through Grafana's proxy:

```bash
curl -sS -u "admin:<grafana-password>" --get \
  "http://localhost:3001/api/datasources/proxy/uid/loki/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_project="template", compose_service="backend"} |= "request completed"' \
  --data-urlencode 'limit=1'
```

Expected signal:

- The response contains a backend JSON log line.
- The log line contains `trace_id`.

Copy the `trace_id` value from that Loki response and check Tempo:

```bash
TRACE_ID=<trace_id-from-loki>

curl -sS -u "admin:<grafana-password>" \
  "http://localhost:3001/api/datasources/proxy/uid/tempo/api/traces/${TRACE_ID}"
```

Expected signal:

- The response contains spans for `GET /status`.
- The response contains `ConnectivityController.status`.

## Update an Existing Deployment

Pull the latest code:

```bash
git pull
```

Rebuild and restart:

```bash
pnpm compose:prod up -d --build
```

The `migrate` service runs before the backend starts. Check
`pnpm compose:prod ps -a` and `pnpm compose:prod logs migrate` if deployment
does not progress.

Remove unused images when needed:

```bash
docker image prune
```

## Backups

At minimum, back up Postgres. Example manual backup:

```bash
pnpm compose:prod exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "my-app-$(date +%Y%m%d-%H%M%S).sql"
```

Store backups outside the VPS. A backup that only exists on the same server is
not enough for production recovery.

Test restore before relying on backups. For a destructive restore into the
current database, first stop the app containers so no writes happen during the
restore:

```bash
pnpm compose:prod stop web backend
```

Drop and recreate the database:

```bash
pnpm compose:prod exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\" WITH (FORCE)" \
    -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\""'
```

Restore a dump:

```bash
cat my-app-YYYYMMDD-HHMMSS.sql | pnpm compose:prod exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1'
```

Start the app again:

```bash
pnpm compose:prod up -d
```

Run the deployment smoke tests again after every restore.

## Scaling on One VPS

The production network shape allows backend replicas.

Scale the backend:

```bash
pnpm compose:prod up -d --scale backend=2
```

The backend must remain stateless:

- store shared data in Postgres
- store shared cache and rate-limit state in Redis
- do not rely on local files inside a backend container
- do not store sessions or request state in process memory

Scaling on one VPS improves throughput, but it does not provide high
availability. If the VPS fails, the whole deployment is down.

## Production Checklist

Before exposing the service publicly:

- DNS points at the VPS if using HTTPS.
- Ports 80 and 443 are open.
- Internal service ports are not open in the firewall.
- The Loki Docker logging driver plugin is installed and enabled.
- Loki is bound only to `127.0.0.1:${LOKI_PORT}`.
- Tempo is not host-published and accepts OTLP only on the private Docker
  network.
- `POSTGRES_PASSWORD` is strong and not the example value.
- `GRAFANA_ADMIN_PASSWORD` is strong and not `admin`.
- `PUBLIC_HOST` is set for HTTPS deployments.
- `pnpm compose:prod config` shows only Caddy publicly exposed.
- The `migrate` service completed successfully.
- The `tempo-init` service completed successfully.
- `curl "$APP_ORIGIN/api/status"` returns the backend connectivity payload.
- `curl "$APP_ORIGIN/api/readyz"` returns `404`.
- Grafana, Prometheus, Loki, and Tempo pass the observability smoke tests.
- Postgres backups are scheduled and stored off-server.
- A restore has been tested on a non-production copy of the deployment.
