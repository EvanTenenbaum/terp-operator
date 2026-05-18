#!/bin/bash
# Metaswarm QA Checkpoint Script
# Runs validation checks at each phase checkpoint

set -e

PHASE=$1
CHECKPOINT=$2

echo "=== Metaswarm QA Checkpoint ==="
echo "Phase: $PHASE"
echo "Checkpoint: $CHECKPOINT"
echo ""

# Type check
echo "Running type check..."
pnpm typecheck

# Run tests
echo "Running tests..."
pnpm test --run

# Check coverage (if tests exist)
if [ -d "src/tests" ] && [ "$(ls -A src/tests)" ]; then
  echo "Checking coverage threshold (90%)..."
  pnpm test --run --coverage --coverage.threshold.90
fi

# For frontend phases, run Playwright visual verification
if [ "$PHASE" = "phase4" ] || [ "$PHASE" = "phase6" ]; then
  echo "Running Playwright visual verification..."
  # Start dev server in background
  pnpm dev &
  DEV_PID=$!
  sleep 10

  # Run Playwright
  pnpm test:e2e || true

  # Kill dev server
  kill $DEV_PID
fi

echo ""
echo "✓ QA Checkpoint passed for $PHASE/$CHECKPOINT"
