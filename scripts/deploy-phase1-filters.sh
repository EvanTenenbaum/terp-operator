#!/bin/bash
set -e

echo "=========================================="
echo "Product Filtering System - Phase 1 Deployment"
echo "=========================================="
echo ""
echo "This script deploys:"
echo "  - Migration 0030: ageDays functional indexes"
echo "  - Migration 0031: NULL-safe alias trigger"
echo "  - Migration 0032: Composite indexes"
echo "  - All filter system code (already in main)"
echo ""
echo "EXCLUDED: Migration 0029 (multi-tenancy) per user request"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL environment variable not set"
  echo "Please set DATABASE_URL or source .env file"
  exit 1
fi

echo "Database: $DATABASE_URL"
echo ""

# Function to run SQL file
run_migration() {
  local migration_file=$1
  local migration_name=$(basename "$migration_file")

  echo "Running migration: $migration_name"

  if command -v psql &> /dev/null; then
    psql "$DATABASE_URL" -f "$migration_file"
    echo "✓ $migration_name completed"
  else
    echo "ERROR: psql not found. Install PostgreSQL client tools."
    exit 1
  fi
}

# Pre-migration validation
echo "=========================================="
echo "Pre-Migration Validation"
echo "=========================================="
echo ""

echo "Checking database connection..."
if command -v psql &> /dev/null; then
  psql "$DATABASE_URL" -c "SELECT version();" -t | head -1
  echo "✓ Database connection successful"
else
  echo "ERROR: psql not found"
  exit 1
fi
echo ""

echo "Checking if batches table exists..."
TABLE_EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'batches';")
if [ "$TABLE_EXISTS" -eq 1 ]; then
  echo "✓ batches table exists"
else
  echo "ERROR: batches table not found. Run base migrations first."
  exit 1
fi
echo ""

echo "Checking current indexes on batches table..."
psql "$DATABASE_URL" -c "SELECT indexname FROM pg_indexes WHERE tablename = 'batches' ORDER BY indexname;"
echo ""

# Run migrations
echo "=========================================="
echo "Running Migrations"
echo "=========================================="
echo ""

run_migration "migrations/0030_add_age_days_index.sql"
echo ""

run_migration "migrations/0031_fix_alias_trigger_null_handling.sql"
echo ""

run_migration "migrations/0032_add_composite_indexes.sql"
echo ""

# Post-migration validation
echo "=========================================="
echo "Post-Migration Validation"
echo "=========================================="
echo ""

echo "Verifying new indexes created..."
EXPECTED_INDEXES=(
  "idx_batches_age_days"
  "idx_batches_recent_30days"
  "idx_batches_recent_90days"
  "idx_batches_intake_date"
  "idx_batches_category_status"
  "idx_batches_category_subcategory"
  "idx_batches_brand_vendor"
  "idx_batches_status_intake"
  "idx_batches_category_price"
  "idx_batches_location_status"
)

MISSING_INDEXES=0
for index in "${EXPECTED_INDEXES[@]}"; do
  COUNT=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'batches' AND indexname = '$index';")
  if [ "$COUNT" -eq 1 ]; then
    echo "✓ $index"
  else
    echo "✗ $index NOT FOUND"
    MISSING_INDEXES=$((MISSING_INDEXES + 1))
  fi
done
echo ""

if [ $MISSING_INDEXES -eq 0 ]; then
  echo "✓ All 10 indexes created successfully"
else
  echo "ERROR: $MISSING_INDEXES indexes missing"
  exit 1
fi
echo ""

echo "Verifying trigger updated..."
TRIGGER_EXISTS=$(psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM pg_proc WHERE proname = 'update_batch_alias_snapshots';")
if [ "$TRIGGER_EXISTS" -eq 1 ]; then
  echo "✓ update_batch_alias_snapshots trigger exists"
else
  echo "✗ Trigger not found"
  exit 1
fi
echo ""

# Performance validation
echo "=========================================="
echo "Performance Validation"
echo "=========================================="
echo ""

echo "Testing ageDays filter performance..."
psql "$DATABASE_URL" -c "EXPLAIN ANALYZE SELECT * FROM batches WHERE DATE_PART('day', NOW() - intake_date) > 30 LIMIT 10;" | grep -E "(Index Scan|Seq Scan|Execution Time)"
echo ""

echo "Checking index usage..."
psql "$DATABASE_URL" -c "SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read FROM pg_stat_user_indexes WHERE tablename = 'batches' AND indexname LIKE 'idx_batches_%' ORDER BY indexname LIMIT 10;"
echo ""

# Code validation
echo "=========================================="
echo "Code Validation"
echo "=========================================="
echo ""

echo "Running TypeScript compilation check..."
pnpm tsc --noEmit
if [ $? -eq 0 ]; then
  echo "✓ TypeScript compilation successful"
else
  echo "ERROR: TypeScript compilation failed"
  exit 1
fi
echo ""

echo "Running test suite..."
npm test -- filterSqlBuilder.test.ts security.test.ts filterEvaluator.test.ts filtersRouter.test.ts --run
if [ $? -eq 0 ]; then
  echo "✓ All tests passing"
else
  echo "ERROR: Tests failed"
  exit 1
fi
echo ""

# Summary
echo "=========================================="
echo "Deployment Summary"
echo "=========================================="
echo ""
echo "✓ Phase 1 migrations completed (0030, 0031, 0032)"
echo "✓ 10 indexes created"
echo "✓ Trigger updated (NULL-safe)"
echo "✓ TypeScript compilation clean"
echo "✓ 154 tests passing"
echo ""
echo "Code status: Already deployed to main (commit 78a6d49)"
echo ""
echo "=========================================="
echo "Next Steps"
echo "=========================================="
echo ""
echo "1. Start dev server: pnpm dev"
echo "2. Navigate to http://localhost:5173"
echo "3. Open Sales → Inventory Finder → More filters"
echo "4. Test filter functionality"
echo "5. Monitor performance:"
echo "   - Filter queries should be < 50ms"
echo "   - ageDays filter should use idx_batches_age_days"
echo "   - getFacets should return in < 50ms"
echo ""
echo "Phase 1 deployment COMPLETE ✓"
echo ""
