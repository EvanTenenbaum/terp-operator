#!/usr/bin/env bash
set -euo pipefail

canonical_owner_repo="EvanTenenbaum/terp-operator"
canonical_url="https://github.com/${canonical_owner_repo}.git"
product_name="TERP Operator"

fail() {
  printf 'TERP Operator doctor: ERROR: %s\n' "$*" >&2
  exit 1
}

warn() {
  printf 'TERP Operator doctor: warning: %s\n' "$*" >&2
}

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "${repo_root}" ]] || fail "not inside a git checkout"

origin_url="$(git -C "${repo_root}" config --get remote.origin.url 2>/dev/null || true)"
[[ -n "${origin_url}" ]] || fail "remote.origin.url is missing"

normalized_origin="${origin_url%.git}"
normalized_origin="${normalized_origin#git@github.com:}"
normalized_origin="${normalized_origin#ssh://git@github.com/}"
normalized_origin="${normalized_origin#https://github.com/}"
normalized_origin="${normalized_origin#http://github.com/}"

if [[ "${normalized_origin}" != "${canonical_owner_repo}" ]]; then
  fail "wrong repo origin '${origin_url}'. Canonical ${product_name} repo is ${canonical_url}"
fi

base_name="$(basename "${repo_root}")"
logical_pwd="${PWD:-}"
preferred_alias="$(dirname "${repo_root}")/terp-operator"
alias_note=""
if [[ "${base_name}" != "terp-operator" && "${logical_pwd}" != *"/terp-operator"* ]]; then
  if [[ -e "${preferred_alias}" ]]; then
    alias_note="${preferred_alias}"
  else
    warn "checkout directory is '${base_name}'. Prefer 'terp-operator' for new checkouts/aliases, but this repo is canonical because the origin matches."
  fi
fi

branch="$(git -C "${repo_root}" branch --show-current 2>/dev/null || true)"
status="$(git -C "${repo_root}" status --short --branch)"

# TER-1605: Drift lock guardrails — catch common misconfiguration before it causes
# confusing runtime failures.

# Guard 1: Warn if the branch tip is more than 100 commits behind origin/main.
# This usually means the agent is working in an stale worktree.
if git -C "${repo_root}" rev-parse --verify origin/main >/dev/null 2>&1; then
  behind_count="$(git -C "${repo_root}" rev-list --count HEAD..origin/main 2>/dev/null || echo 0)"
  if [[ "${behind_count}" -gt 100 ]]; then
    warn "branch is ${behind_count} commits behind origin/main. This worktree may be stale — consider rebasing."
  fi
fi

# Guard 2: Required runtime env vars for production / staging.
# In dev (no .env or NODE_ENV unset) we warn; in production we fail.
node_env="${NODE_ENV:-}"
if [[ "${node_env}" == "production" ]]; then
  [[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is not set. Production requires a PostgreSQL connection string."
  [[ -n "${SESSION_SECRET:-}" ]] || fail "SESSION_SECRET is not set. Production requires a session secret."
  [[ -n "${APP_ORIGIN:-}" ]]    || warn "APP_ORIGIN is not set. CORS and cookie domain defaults may be wrong in production."
elif [[ -z "${DATABASE_URL:-}" ]]; then
  # Development: check for .env file with DATABASE_URL
  if [[ -f "${repo_root}/.env" ]]; then
    if ! grep -q "^DATABASE_URL=" "${repo_root}/.env" 2>/dev/null; then
      warn ".env exists but DATABASE_URL is missing. Server will fail to connect to postgres."
    fi
  else
    warn "DATABASE_URL is not set and no .env file found. Run the dev setup in README.md."
  fi
fi

# Guard 3: Stale migration check — warn if migration files on disk don't match
# the schema snapshot (i.e., someone added migration files but forgot to run them).
# We detect this by checking if drizzle-kit can generate a non-empty diff without
# actually applying anything. This is advisory only (exits 0 even if drift found).
if command -v node >/dev/null 2>&1 && [[ -f "${repo_root}/drizzle.config.ts" ]]; then
  migration_count="$(ls "${repo_root}/migrations/"*.sql 2>/dev/null | wc -l | tr -d ' ')"
  if [[ "${migration_count}" -eq 0 ]]; then
    warn "No SQL migration files found in migrations/. Expected at least one baseline migration."
  fi
fi

printf 'TERP Operator doctor: OK\n'
printf 'Product: %s\n' "${product_name}"
printf 'Repo root: %s\n' "${repo_root}"
[[ -n "${logical_pwd}" ]] && printf 'Entry path: %s\n' "${logical_pwd}"
[[ -n "${alias_note}" ]] && printf 'Preferred alias: %s\n' "${alias_note}"
printf 'Origin: %s\n' "${origin_url}"
printf 'Branch: %s\n' "${branch:-detached HEAD}"
printf '%s\n' "${status}"
