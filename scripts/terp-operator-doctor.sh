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

printf 'TERP Operator doctor: OK\n'
printf 'Product: %s\n' "${product_name}"
printf 'Repo root: %s\n' "${repo_root}"
[[ -n "${logical_pwd}" ]] && printf 'Entry path: %s\n' "${logical_pwd}"
[[ -n "${alias_note}" ]] && printf 'Preferred alias: %s\n' "${alias_note}"
printf 'Origin: %s\n' "${origin_url}"
printf 'Branch: %s\n' "${branch:-detached HEAD}"
printf '%s\n' "${status}"
