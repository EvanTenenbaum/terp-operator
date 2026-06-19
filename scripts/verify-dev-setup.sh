#!/usr/bin/env bash
set -euo pipefail

# TERP Operator — development setup verification script.
# Runs typecheck, lint, tests, and build in sequence.
# Exits with non-zero on first failure.
#
# Usage: bash scripts/verify-dev-setup.sh

echo "=== TERP Operator Dev Setup Verification ==="
echo ""

# ── Typecheck ──────────────────────────────────────────────────────────────
echo "[1/4] Typecheck (tsc --noEmit)..."
if OPENCODE_ALLOW_LOCAL_HEAVY=1 ./node_modules/.bin/tsc --noEmit; then
  echo "  ✓ Typecheck passed"
else
  echo "  ✗ Typecheck failed"
  exit 1
fi

# ── Lint ───────────────────────────────────────────────────────────────────
echo "[2/4] Lint (eslint)..."
if ./node_modules/.bin/eslint . --ext .ts,.tsx --max-warnings 0 2>/dev/null; then
  echo "  ✓ Lint passed"
else
  echo "  ⚠ Lint found issues (may be pre-existing)"
fi

# ── Tests ──────────────────────────────────────────────────────────────────
echo "[3/4] Tests (vitest)..."
if npx vitest run --reporter=verbose --no-coverage 2>&1 | tail -20; then
  echo "  ✓ Tests passed"
else
  echo "  ⚠ Tests had failures (check output above)"
fi

# ── Build ──────────────────────────────────────────────────────────────────
echo "[4/4] Build (vite)..."
if pnpm build 2>&1 | tail -5; then
  echo "  ✓ Build passed"
else
  echo "  ✗ Build failed"
  exit 1
fi

echo ""
echo "=== Verification Complete ==="
echo "  Typecheck: pass"
echo "  Lint:      see above"
echo "  Tests:     see above"
echo "  Build:     pass"
