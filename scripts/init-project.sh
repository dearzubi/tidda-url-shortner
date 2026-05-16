#!/usr/bin/env bash
# init-project.sh: rename template placeholders and set up local-only git
# exclusions. Run once after cloning.
#
# Usage:
#   bash scripts/init-project.sh <scope>
#
# Example:
#   bash scripts/init-project.sh acme
#
# This script:
#   1. Replaces `@template/` with `@<scope>/` across every tracked file
#      (workspace package names and imports).
#   2. Replaces the project name `template` in well-known infrastructure
#      identifiers (compose project, prom job_name, grafana provider).
#   3. Updates starter app display names in README and apps/web.
#   4. Adds `docs/superpowers/` to `.git/info/exclude` so AI-agent working
#      docs are locally ignored without polluting `.gitignore`.
#
# What it does NOT touch (edit by hand after running):
#   - README.md: description, copyright
#   - LICENSE: copyright holder
#   - AGENTS.md: any project-specific guidance you want to add
#   - .git history (the template's history travels with the clone; consider
#     `rm -rf .git && git init` for a clean start)
#
# Re-running is safe but a no-op if `@template/` is already replaced.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <scope>" >&2
  echo "Example: $0 acme" >&2
  exit 1
fi

SCOPE="$1"
if [[ ! "$SCOPE" =~ ^[a-z][a-z0-9-]*$ ]]; then
  echo "Error: scope must be lowercase letters, digits, and hyphens." >&2
  echo "Got: $SCOPE" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"
DISPLAY_NAME="$(printf '%s' "$SCOPE" | tr '-' ' ' | awk '{ for (i = 1; i <= NF; i++) $i = toupper(substr($i, 1, 1)) substr($i, 2); print }')"

echo "==> Renaming @template/ to @${SCOPE}/"
# Use perl for portable in-place edit (works on macOS and GNU Linux)
git ls-files | while IFS= read -r file; do
  if grep -q '@template/' "$file" 2>/dev/null; then
    perl -pi -e "s|\@template/|\@${SCOPE}/|g" "$file"
  fi
  if grep -q 'template-backend' "$file" 2>/dev/null; then
    perl -pi -e "s|\btemplate-backend\b|${SCOPE}-backend|g" "$file"
  fi
done

echo "==> Updating infrastructure identifiers (compose, prometheus, grafana)"
perl -pi -e "s|^name: template$|name: ${SCOPE}|m" infra/compose/docker-compose.yml
perl -pi -e "s|compose_project=\"template\"|compose_project=\"${SCOPE}\"|g" \
  infra/observability/grafana/provisioning/datasources/datasource.yml \
  docs/runbooks/vps-production-deployment.md

echo "==> Updating root package.json name"
perl -pi -e "s|\"name\": \"template\"|\"name\": \"${SCOPE}\"|" package.json

echo "==> Updating only-pnpm guard message"
perl -pi -e "s|\[template\]|[${SCOPE}]|g" scripts/only-pnpm.cjs

echo "==> Updating local dev credentials (postgres user/db/password)"
# These are local-dev placeholders. Production values must come from the
# container runtime; never bake real secrets into these files.
perl -pi -e "s|^(POSTGRES_DB=).*|\${1}${SCOPE}|; s|^(POSTGRES_USER=).*|\${1}${SCOPE}|; s|^(POSTGRES_PASSWORD=).*|\${1}${SCOPE}_dev_password|" \
  .env.example
perl -pi -e "s|postgres://template:template_dev_password\@localhost:5432/template|postgres://${SCOPE}:${SCOPE}_dev_password\@localhost:5432/${SCOPE}|g" \
  apps/backend/.env.development

echo "==> Updating starter display names"
perl -pi -e "s|^# Template$|# ${DISPLAY_NAME}|" README.md
perl -pi -e "s|\bTemplate\b|${DISPLAY_NAME}|g" docs/runbooks/vps-production-deployment.md
perl -pi -e "s|<title>Template</title>|<title>${DISPLAY_NAME}</title>|" apps/web/index.html
perl -pi -e "s|>Template</h1>|>${DISPLAY_NAME}</h1>|" apps/web/src/App.tsx
perl -pi -e "s|name: /template/i|name: /${SCOPE}/i|" apps/web/src/App.test.tsx

echo "==> Setting up local-only docs/superpowers/ exclusion"
if [[ -d .git ]]; then
  EXCLUDE_FILE=.git/info/exclude
  if ! grep -q '^docs/superpowers/$' "$EXCLUDE_FILE" 2>/dev/null; then
    if {
      echo ""
      echo "# Local-only: AI-agent working docs. Not tracked, not synced."
      echo "docs/superpowers/"
    } >> "$EXCLUDE_FILE"; then
      echo "    added docs/superpowers/ to $EXCLUDE_FILE"
    else
      echo "    warning: could not update $EXCLUDE_FILE; add docs/superpowers/ manually if needed" >&2
    fi
  else
    echo "    docs/superpowers/ already in $EXCLUDE_FILE"
  fi
else
  echo "    (no .git directory; skipping. Run 'git init' first if needed.)"
fi

echo
echo "Done. Manual follow-ups:"
echo "  - README.md: edit description and copyright"
echo "  - LICENSE: update copyright holder"
echo
echo "Then:"
echo "  pnpm install"
echo "  cp .env.example .env"
echo "  pnpm compose up -d"
echo "  pnpm dev"
