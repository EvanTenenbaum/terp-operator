# QA Environment Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 26-flow persona QA framework runnable on demand via a single `fast-runner exec … -- pnpm qa:env:setup` command — isolated from local dev, seeds automatically, exposes the app on the runner's Tailscale IP for direct browser access.

**Architecture:** A shell script (`scripts/qa-env-setup.sh`) runs on the fast runner, migrates/seeds the DB, starts the app (`pnpm dev:e2e`), gets the runner's Tailscale IP, and emits structured `KEY=VALUE` output for the agent to parse. A preflight script catches seed breakage early. A seed-state export script queries the freshly seeded DB and outputs JSON for updating `seed-state-reference.md`. An AGENTS.md section teaches every agent the complete invocation protocol.

**Tech Stack:** bash, Node.js 22 (runner), `pg` (raw Pool for export script), `tailscale` CLI (runner Tailscale IP), `wait-on` (app readiness check), existing `pnpm dev:e2e` and `pnpm db:seed:realistic`.

**Spec:** `docs/superpowers/specs/2026-05-22-qa-env-setup-design.md`

---

## Known facts (read before implementing)

- Seeds (`pnpm db:seed` and `pnpm db:seed:realistic`) already work on the current branch.
- `pnpm db:seed:realistic` outputs: `Demo login: owner@terpagro.local / terp-demo`
- All demo users share password `terp-demo`. Use `owner@terpagro.local` as the QA login.
- `fast-runner status` shows `tailscale_ip: 100.104.134.78` for the runner — but **the setup script runs ON the runner**, so it gets its own Tailscale IP using `tailscale ip 2>/dev/null | head -1`.
- Vite config proxies `/trpc`, `/api`, `/socket.io` to `localhost:8787` — so tunneling only port 5173 gives full app access.
- Health endpoint: `GET /api/health` on port 8787 (proxied via Vite at `http://localhost:5173/api/health`).
- `wait-on` is NOT installed — must be added as devDependency.
- Working directory for all tasks: `/Users/evantenenbaum/work/terp-agro-operator-console`
- All new scripts go in `scripts/` at repo root.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `scripts/qa-preflight.sh` | Create | Gate 0 — verify schema is migrated and seed will work |
| `scripts/qa-export-seed-state.js` | Create | Query seeded DB → emit JSON for seed-state-reference.md |
| `scripts/qa-env-setup.sh` | Create | Main runner script: migrate, seed, start app, emit QA_APP_URL |
| `package.json` | Modify | Add `qa:env:setup`, `qa:preflight`, `qa:export-seed` scripts + `wait-on` devDep |
| `AGENTS.md` | Modify | Add QA protocol section |

---

## Task 1: Add `wait-on` devDependency

`wait-on` is needed inside `qa-env-setup.sh` to poll until the app is healthy.

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install wait-on**

```bash
pnpm add -D wait-on
```

Expected: `package.json` `devDependencies` gains `"wait-on": "..."`, `pnpm-lock.yaml` updated.

- [ ] **Step 2: Verify it's runnable**

```bash
./node_modules/.bin/wait-on --version
```

Expected: prints a version number (e.g. `7.x.x`).

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add wait-on devDep for QA env health check"
```

---

## Task 2: Create `scripts/qa-preflight.sh`

Gate 0 check — fast sanity check that migrations are complete and required tables exist.
Exits 0 on pass, exits 1 with a clear message on failure.

**Files:**
- Create: `scripts/qa-preflight.sh`

- [ ] **Step 1: Write the script**

Create `scripts/qa-preflight.sh` with this exact content:

```bash
#!/usr/bin/env bash
# QA Preflight — verifies schema is migrated and seed can run.
# Exit 0 = OK. Exit 1 = broken (seed will fail).
set -euo pipefail

echo "[qa:preflight] Checking database schema..."

pnpm exec tsx --tsconfig tsconfig.json -e "
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function preflight() {
  // Check required tables exist
  const result = await db.execute(sql\`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('customers', 'batches', 'vendors', 'purchase_orders', 'sales_orders', 'users')
  \`);

  const found = (result.rows as { table_name: string }[]).map(r => r.table_name);
  const required = ['customers', 'batches', 'vendors', 'purchase_orders', 'sales_orders', 'users'];
  const missing = required.filter(t => !found.includes(t));

  if (missing.length > 0) {
    throw new Error('Missing tables: ' + missing.join(', ') + ' — run pnpm db:migrate first');
  }

  console.log('[qa:preflight] Schema: OK (' + found.length + ' required tables confirmed)');
  await pool.end();
}

preflight().catch(e => {
  console.error('[qa:preflight] FAIL:', e.message);
  process.exit(1);
});
" 2>&1

echo "[qa:preflight] PASSED"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/qa-preflight.sh
```

- [ ] **Step 3: Test it locally**

```bash
pnpm exec bash scripts/qa-preflight.sh
```

Expected output:
```
[qa:preflight] Checking database schema...
[qa:preflight] Schema: OK (6 required tables confirmed)
[qa:preflight] PASSED
```

- [ ] **Step 4: Commit**

```bash
git add scripts/qa-preflight.sh
git commit -m "feat(qa): add qa-preflight.sh — Gate 0 schema check"
```

---

## Task 3: Create `scripts/qa-export-seed-state.js`

Queries the seeded database and outputs JSON for the agent to use when updating
`seed-state-reference.md`. Uses raw `pg` Pool (no tsx/drizzle) for portability.

**Files:**
- Create: `scripts/qa-export-seed-state.js`

- [ ] **Step 1: Write the script**

Create `scripts/qa-export-seed-state.js` with this exact content:

```js
#!/usr/bin/env node
// Queries the seeded DB and emits JSON for seed-state-reference.md.
// Usage: node scripts/qa-export-seed-state.js
// Requires DATABASE_URL env var.
'use strict';

const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL ||
      'postgres://terp_agro:terp_agro@localhost:55432/terp_agro',
  });

  try {
    // Customers
    const custResult = await pool.query(
      'SELECT name, credit_limit, balance FROM customers ORDER BY name'
    );
    const customers = custResult.rows.map(r => ({
      name: r.name,
      creditLimit: r.credit_limit,
      balance: r.balance,
      overLimit: parseFloat(r.balance) > parseFloat(r.credit_limit),
    }));

    // Credit-hold customer (balance > credit_limit)
    const creditHoldCustomer = customers.find(c => c.overLimit) || null;

    // Vendors
    const vendResult = await pool.query(
      'SELECT id, name FROM vendors ORDER BY name'
    );
    const vendors = vendResult.rows.map(r => ({ id: r.id, name: r.name }));

    // Live batches
    const batchResult = await pool.query(
      "SELECT id, name, available_qty, status FROM batches WHERE status = 'Live' ORDER BY name LIMIT 20"
    );
    const liveBatches = batchResult.rows.map(r => ({
      id: r.id,
      productName: r.name,
      availableQty: r.available_qty,
      status: r.status,
    }));

    // Open sales orders
    const soResult = await pool.query(
      "SELECT count(*) as cnt FROM sales_orders WHERE status NOT IN ('archived','cancelled')"
    );
    const openSalesOrders = parseInt(soResult.rows[0].cnt, 10);

    // Active purchase orders
    const poResult = await pool.query(
      "SELECT count(*) as cnt FROM purchase_orders WHERE status NOT IN ('closed','cancelled')"
    );
    const openPurchaseOrders = parseInt(poResult.rows[0].cnt, 10);

    const output = {
      generatedAt: new Date().toISOString(),
      branch: process.env.QA_BRANCH || 'unknown',
      qaUser: {
        email: 'owner@terpagro.local',
        password: 'terp-demo',
        note: 'Full operator access. All demo users share this password.',
        additionalUsers: [
          'manager@terpagro.local / terp-demo (manager role)',
          'intake@terpagro.local / terp-demo (operator role)',
          'sales@terpagro.local / terp-demo (operator role)',
        ],
      },
      customers,
      vendors,
      liveBatches,
      openSalesOrders,
      openPurchaseOrders,
      creditHoldCustomer,
      goodStandingCustomer: customers.find(c => !c.overLimit && parseFloat(c.creditLimit) > 50000) || customers[0] || null,
      knownMissingEntities: [
        'connector record — create manually via Money → Processors before connector-actor flows',
        'credit-hold customer — set East Bay Select credit limit to $0 via Clients view if needed',
      ],
    };

    process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  } finally {
    await pool.end();
  }
}

main().catch(e => {
  console.error('qa-export-seed-state failed:', e.message);
  process.exit(1);
});
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/qa-export-seed-state.js
```

- [ ] **Step 3: Test it locally**

```bash
node scripts/qa-export-seed-state.js 2>&1 | head -30
```

Expected: JSON with customers array, vendors array, liveBatches array, qaUser block.
If liveBatches is empty, that's OK — the seed on main may not create batches until `db:seed:realistic` is run.

- [ ] **Step 4: Commit**

```bash
git add scripts/qa-export-seed-state.js
git commit -m "feat(qa): add qa-export-seed-state.js — seed entity export for QA runs"
```

---

## Task 4: Create `scripts/qa-env-setup.sh`

The main runner-side script. Runs on the fast runner via `fast-runner exec … -- pnpm qa:env:setup`. Migrates, seeds, starts the app, emits structured output.

**Files:**
- Create: `scripts/qa-env-setup.sh`

- [ ] **Step 1: Write the script**

Create `scripts/qa-env-setup.sh` with this exact content:

```bash
#!/usr/bin/env bash
# QA Environment Setup — runs on the fast runner via fast-runner exec.
# Emits KEY=VALUE lines on stdout for the agent to parse.
# Keeps the app running until the fast-runner job is cancelled.
set -euo pipefail

QA_BRANCH="${QA_BRANCH:-main}"
APP_PID=""

# Cleanup: kill app process on any exit
cleanup() {
  if [ -n "$APP_PID" ]; then
    echo "[qa:setup] Stopping app (PID $APP_PID)..."
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
  echo "[qa:setup] QA env torn down."
}
trap cleanup EXIT

echo "[qa:setup] Starting QA environment for branch: $QA_BRANCH"

# Gate 0: verify schema before committing to full seed
echo "[qa:setup] Running preflight..."
pnpm qa:preflight || {
  echo "QA_ERROR=seed_preflight_failed"
  echo "QA_READY=false"
  exit 1
}

# Migrate and seed
echo "[qa:setup] Running migrations..."
pnpm db:migrate

echo "[qa:setup] Seeding database (realistic 100-day scenario)..."
pnpm db:seed:realistic 2>&1 | tee /tmp/qa-seed.log
echo "[qa:setup] Seed complete."

# Export seed state for seed-state-reference.md update
echo "[qa:setup] Exporting seed state..."
QA_BRANCH="$QA_BRANCH" node scripts/qa-export-seed-state.js > /tmp/qa-seed-state.json 2>&1 || {
  echo "[qa:setup] Warning: seed state export failed — continuing"
}

# Start the app in background (dev:e2e = no HMR, stable for testing)
echo "[qa:setup] Starting app server..."
pnpm dev:e2e > /tmp/qa-app.log 2>&1 &
APP_PID=$!
echo "[qa:setup] App PID: $APP_PID"

# Wait for app to be healthy (poll /api/health via Vite proxy, 60s timeout)
echo "[qa:setup] Waiting for app health..."
./node_modules/.bin/wait-on "http://localhost:5173/api/health" --timeout 60000 2>&1 || {
  echo "[qa:setup] App failed to start. Last log lines:"
  tail -20 /tmp/qa-app.log || true
  echo "QA_ERROR=app_start_timeout"
  echo "QA_READY=false"
  exit 1
}
echo "[qa:setup] App is healthy."

# Get this runner's Tailscale IP
TAILSCALE_IP=$(tailscale ip --4 2>/dev/null | head -1 || \
               ip addr show tailscale0 2>/dev/null | grep 'inet ' | awk '{print $2}' | cut -d/ -f1 || \
               echo "")
if [ -z "$TAILSCALE_IP" ]; then
  echo "[qa:setup] Warning: could not determine Tailscale IP — falling back to public IP"
  TAILSCALE_IP=$(curl -s --max-time 5 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null || echo "localhost")
fi

# Emit structured output (agent parses KEY=VALUE lines)
echo "QA_APP_URL=http://${TAILSCALE_IP}:5173"
echo "QA_TAILSCALE_IP=${TAILSCALE_IP}"
echo "QA_BRANCH=${QA_BRANCH}"
echo "QA_USER_EMAIL=owner@terpagro.local"
echo "QA_USER_PASSWORD=terp-demo"
echo "QA_SEED_STATE=$(cat /tmp/qa-seed-state.json 2>/dev/null | tr -d '\n' || echo '{}')"
echo "QA_READY=true"

echo ""
echo "==================================================="
echo " QA environment is ready."
echo " App URL (Tailscale): http://${TAILSCALE_IP}:5173"
echo " Login: owner@terpagro.local / terp-demo"
echo " Press Ctrl-C or cancel this job to tear down."
echo "==================================================="

# Keep running — fast-runner job stays alive until cancelled
# The trap will stop the app on exit
wait "$APP_PID" || true
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/qa-env-setup.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/qa-env-setup.sh
git commit -m "feat(qa): add qa-env-setup.sh — runner-side QA environment launcher"
```

---

## Task 5: Add `package.json` scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the three qa: scripts**

In `package.json`, add these entries to the `"scripts"` block (after the existing `db:seed:realistic:prod` line):

```json
"qa:env:setup": "bash scripts/qa-env-setup.sh",
"qa:preflight": "bash scripts/qa-preflight.sh",
"qa:export-seed": "node scripts/qa-export-seed-state.js"
```

- [ ] **Step 2: Verify scripts are listed**

```bash
pnpm run --filter . 2>&1 | grep "qa:"
```

Expected output includes `qa:env:setup`, `qa:preflight`, `qa:export-seed`.

- [ ] **Step 3: Test preflight via pnpm**

```bash
pnpm qa:preflight
```

Expected: `[qa:preflight] PASSED`

- [ ] **Step 4: Test export via pnpm**

```bash
pnpm qa:export-seed | python3 -m json.tool | head -20
```

Expected: valid JSON with `customers`, `vendors`, `liveBatches`, `qaUser` keys.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "feat(qa): add qa:env:setup / qa:preflight / qa:export-seed npm scripts"
```

---

## Task 6: Update `AGENTS.md` with QA protocol

Add the QA invocation protocol so any agent knows exactly how to run QA when Evan asks.

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Read the current AGENTS.md to find the right insertion point**

```bash
grep -n "QA\|Playwright\|test\|verification" AGENTS.md | head -20
```

Find the appropriate section to add the QA protocol. If a "Local Verification" section exists, add after it. Otherwise add near the bottom of the file, before any appendix/footer.

- [ ] **Step 2: Add the QA protocol section**

Append this block to `AGENTS.md` at the appropriate location (after "Local Verification" or before the last `---` separator):

```markdown
## QA Environment — On-Demand Persona Flow Testing

When Evan says **"run QA"**, **"run QA on [scope]"**, or **"run QA against [branch]"**,
follow this protocol exactly. Do not improvise.

### Parameters
- **Branch:** default `main`. Use Evan's branch if specified.
- **Scope:** default `all`. Options: `all`, `critical`, `cross-persona`,
  or any persona slug (`sales-operator`, `inventory-operator`, `payments-accounting`, etc.)

### Step 1 — Launch QA environment on the fast runner

```bash
fast-runner exec \
  --base origin/main \
  --branch "fast-runner/qa-$(date +%Y%m%dT%H%M%S)" \
  terp-operator -- QA_BRANCH=main pnpm qa:env:setup
```

Replace `main` with the target branch in both `--base` and `QA_BRANCH` if Evan specified one.

Parse every `KEY=VALUE` line from the output. Extract:
- `QA_APP_URL` — e.g. `http://100.104.134.78:5173`
- `QA_USER_EMAIL` — `owner@terpagro.local`
- `QA_USER_PASSWORD` — `terp-demo`
- `QA_SEED_STATE` — JSON blob

If `QA_ERROR=...` appears in output: **stop immediately**. Report to Evan:
> "QA blocked: `[QA_ERROR value]` on branch `[branch]`. Check seed/migration state."

If `QA_READY=true`: proceed to Step 2.

### Step 2 — Verify Tailscale access

The runner is on the Tailscale network at `QA_APP_URL`. Vite binds to `0.0.0.0:5173`
so the Mac mini can reach it directly. No tunnel or firewall change required.

Verify: open `QA_APP_URL` in the browser or run:
```bash
curl -s "[QA_APP_URL]/api/health" | head -5
```
Expected: JSON response with `{"status":"ok"}` or similar.

### Step 3 — Update seed-state-reference.md

Parse `QA_SEED_STATE` JSON and update
`docs/qa/persona-flows/_shared/seed-state-reference.md` with current entity data.
Use the format already in that file.

### Step 4 — Load scenario files

From `docs/qa/persona-flows/REGISTRY.md`, select flows by scope:
- `all` → all 26 flows in REGISTRY order
- `critical` → Risk = Critical flows only (X1, X2, flow 12)
- `cross-persona` → flows X1 and X2 only
- `[persona-slug]` → the 3 files in that persona's directory

Load `_shared/navigation-primer.md` alongside every scenario.

**URL substitution (required):** In all loaded scenario text, replace:
- `http://127.0.0.1:5173` → `[QA_APP_URL]`
- `http://localhost:5173` → `[QA_APP_URL]`

### Step 5 — Authenticate

Navigate to `[QA_APP_URL]`. Log in with `QA_USER_EMAIL` / `QA_USER_PASSWORD`.
All persona flows use this single operator-level account.

### Step 6 — Execute flows

For each scenario in scope:
1. Load the scenario file (with URL substitution applied)
2. Follow the Pre-Run Checklist (mark seed state as confirmed — setup ran it)
3. Execute all Flow Steps
4. Evaluate Pass Criteria → record ✅ Pass / 🟡 Pass with findings / 🔴 Fail / ⬛ Blocked
5. File findings: bugs → `gh issue create --label bug`, gaps → Linear TER project
6. Save screenshots to `docs/qa/runs/screenshots/YYYYMMDD-[persona]-step[N]-[slug].png`

### Step 7 — Write run report

Save to `docs/qa/runs/YYYY-MM-DD-[scope]-report.md`.
Template: see `docs/superpowers/specs/2026-05-22-qa-env-setup-design.md`.
Compute and report the overall grade (A/B/C/D/F and score/100).

### Step 8 — Tear down

The runner job's `qa-env-setup.sh` trap stops the app automatically when the job
exits (cancels). No manual teardown needed.

Report grade and top findings to Evan.

### Error reference

| `QA_ERROR` value | Meaning | Action |
|-----------------|---------|--------|
| `seed_preflight_failed` | Schema not migrated or seed will fail | Run `pnpm db:migrate` first; file GH issue if seed itself is broken |
| `app_start_timeout` | App didn't reach healthy state in 60s | Check `/tmp/qa-app.log` on the runner |
| `tailscale_ip_unavailable` | Runner Tailscale IP not found | Check `tailscale status` on the runner |
```

- [ ] **Step 3: Verify the section was added cleanly**

```bash
grep -n "QA Environment\|run QA\|QA_APP_URL" AGENTS.md | head -10
```

Expected: lines referencing the QA protocol section.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): add QA environment on-demand invocation protocol"
```

---

## Task 7: Smoke Test on Fast Runner

Verify the complete system works end-to-end before calling it done.

**Files:** None — this is a verification task.

- [ ] **Step 1: Run preflight locally to confirm it still passes**

```bash
pnpm qa:preflight
```

Expected: `[qa:preflight] PASSED`

- [ ] **Step 2: Run export locally and verify JSON**

```bash
pnpm qa:export-seed | python3 -m json.tool | grep -E '"email"|"name"|"productName"' | head -20
```

Expected: customer names, vendor names, and (if batches exist) product names.

- [ ] **Step 3: Launch QA env on the fast runner**

```bash
fast-runner exec \
  --base origin/main \
  --branch "fast-runner/qa-smoke-$(date +%Y%m%dT%H%M%S)" \
  terp-operator -- QA_BRANCH=main pnpm qa:env:setup
```

Watch the output. Expected sequence:
```
[qa:setup] Starting QA environment for branch: main
[qa:preflight] Checking database schema...
[qa:preflight] PASSED
[qa:setup] Running migrations...
[qa:setup] Seeding database (realistic 100-day scenario)...
Seeded TERP Operator realistic demo data: 110 days, ...
[qa:setup] Exporting seed state...
[qa:setup] Starting app server...
[qa:setup] Waiting for app health...
[qa:setup] App is healthy.
QA_APP_URL=http://100.104.134.78:5173
QA_TAILSCALE_IP=100.104.134.78
QA_BRANCH=main
QA_USER_EMAIL=owner@terpagro.local
QA_USER_PASSWORD=terp-demo
QA_SEED_STATE={...}
QA_READY=true
===================================================
 QA environment is ready.
 App URL (Tailscale): http://100.104.134.78:5173
...
```

If `QA_READY=true` does not appear: check which step failed. Common issues:
- `seed_preflight_failed` → migrations need to run first on the runner
- `app_start_timeout` → app log at `/tmp/qa-app.log` on runner

- [ ] **Step 4: Verify Tailscale access from Mac mini**

While the runner job is still running (from Step 3), in a separate terminal:

```bash
curl -s http://100.104.134.78:5173/api/health
```

Expected: `{"status":"ok",...}` or any JSON health response (not a connection error).

- [ ] **Step 5: Cancel the runner job and confirm teardown**

Cancel (Ctrl-C) the `fast-runner exec` session from Step 3.

Expected: the trap fires and `[qa:setup] QA env torn down.` appears.

- [ ] **Step 6: File any smoke test findings as GitHub issues**

If any step failed during smoke test, file a GitHub issue:
```bash
gh issue create --title "Known issue: QA env setup [description]" --label "bug"
```

- [ ] **Step 7: Final commit if any last fixes were needed**

```bash
git add -A
git status  # verify only intended changes staged
git commit -m "fix(qa): smoke test fixes — [describe what you fixed]"
```

If no fixes needed: skip this step.

---

## Self-Review Checklist (run after all tasks)

- [ ] `pnpm qa:preflight` passes locally
- [ ] `pnpm qa:export-seed` outputs valid JSON with customers, vendors, qaUser
- [ ] `pnpm qa:env:setup` appears in `pnpm run --filter .` output
- [ ] `AGENTS.md` has the QA protocol section with `QA_APP_URL` referenced
- [ ] `scripts/qa-env-setup.sh`, `scripts/qa-preflight.sh`, `scripts/qa-export-seed-state.js` all executable (`chmod +x`)
- [ ] Fast runner smoke test produced `QA_READY=true`
- [ ] Tailscale URL accessible from Mac mini during smoke test
- [ ] All files committed on the correct branch
