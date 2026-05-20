# Credit Engine Alerts (Phase 7a)

This document describes the operational alerting model for the TERP Operator
credit engine.

> **Status: Phase 7a — documentation + in-process metrics.**
> The credit engine currently emits in-process counters (see
> `src/server/services/creditEngine/metrics.ts`) and structured JSON log lines
> from the worker, divergence report, and reaper. There is no alerting backend
> wired up yet. Phase 7b will replace the in-process counters with a real
> metrics backend (Prometheus / OpenTelemetry / Datadog — TBD) and wire the
> thresholds below into a notifier (PagerDuty / Slack / email).
>
> Until then, this file is **the canonical contract** for what we want to
> alert on. New code that emits credit-engine metrics must match the names and
> labels referenced here so the Phase 7b wiring is mechanical.

---

## Counters emitted today

All counters live under the `credit_engine.*` namespace. They are pure
in-process counters reset on every process restart.

| Counter | Labels | Emitted from | Meaning |
|---|---|---|---|
| `credit_engine.decision_issued` | `applied`, `triggered_by` | `worker.ts` (`processOneRecompute`) | One assessment row was written and the queue row marked done. Includes shadow-mode, manual-override, and engine-disabled cases. |
| `credit_engine.override_applied` | `triggered_by` | `worker.ts` (`processOneRecompute`) | The recommendation was actually written back to `customers.credit_limit`. Strict subset of `decision_issued`. |
| `credit_engine.shadow_mode_miss` | `triggered_by` | `worker.ts` (`processOneRecompute`) | The engine computed a recommendation but suppressed application because `credit_engine_config.shadow_mode=true`. |
| `credit_engine.divergence_observed` | `result=within_tolerance \| outside_tolerance` | `divergenceReport.ts` | One classified customer in the latest divergence report. Increments are batched per report run. |
| `credit_engine.worker_stalled` | `reason=stale_processing` | `reaper.ts` (`reapStaleProcessingRows`) | The reaper reset a queue row that had been in `processing` state for longer than the stale threshold (10 minutes). |

Each counter is paired with a structured JSON log line emitted to stdout via
`logCreditEngineEvent(event, payload)`. The events are:

- `credit_engine.decision` — emitted alongside `decision_issued`.
- `credit_engine.divergence_report` — emitted at the end of every divergence
  report run with the full KPI envelope.
- `credit_engine.worker_stalled` — emitted whenever the reaper reaps at least
  one row.

These log lines are the durable record; counters are a lightweight in-memory
rollup.

---

## Alert thresholds

These thresholds describe what Phase 7b should alert on.

### 1. Worker stalled

- **Trigger:** any non-zero
  `credit_engine.worker_stalled{reason=stale_processing}` increment **OR**
  `creditRecomputeQueueHealth.processingCount > 0 AND
  creditRecomputeQueueHealth.oldestPendingAgeSeconds > 300`.
- **Severity:** **Page** (operator-critical — credit recomputes are stuck and
  fresh decisions are not being issued).
- **Window:** 5 minute moving window.

### 2. Queue depth runaway

- **Trigger:** `creditRecomputeQueueHealth.pendingCount > N` where N defaults
  to 1000 (configurable per environment).
- **Severity:** **Warn** (no decisions are being lost, but they are being
  delayed; the engine cannot keep up with enqueue rate).
- **Window:** 10 minute moving window.

### 3. Divergence rate spike

- **Trigger:** rolling rate of
  `credit_engine.divergence_observed{result=outside_tolerance}` over the last
  hour exceeds 2x the trailing 24-hour median rate **AND** the absolute count
  is at least 20.
- **Severity:** **Warn** (engine and manual overrides have drifted apart;
  shadow-mode parity is degrading).

### 4. Command-bus rejection rate (credit commands)

- **Trigger:** rolling 1-hour rejection rate for credit-engine-affecting
  commands (`setCustomerCreditLimit`, `setEngineMax`, `setStance`,
  `bulkRevertCustomersToEngine`, `setCreditEngineConfig`,
  `setCustomerCreditLimitReminder`, `bulkSnoozeOverdueReviews`,
  `triggerCreditRecompute`) exceeds 10% of attempts **AND** the absolute
  rejected count is at least 5.
- **Severity:** **Warn**.
- **Source signals:** `command_journal.result.kind = 'rejected'` filtered to
  the command names above (existing journal — no new counter for Phase 7a).

### 5. Shadow-mode miss rate trending down to zero

- **Trigger:** `credit_engine.shadow_mode_miss` rate drops to zero over a
  24-hour window **while** `credit_engine.decision_issued` continues to fire.
- **Severity:** **Info** (this means shadow mode has been disabled — confirm
  that was intentional).

---

## Phase 7b: replacing in-process counters

When Phase 7b lands:

1. Swap the implementation of `CreditEngineMetrics` (the class behind the
   `creditEngineMetrics` singleton in
   `src/server/services/creditEngine/metrics.ts`) for a real backend (e.g.
   `prom-client.Counter`).
2. Keep the public API: `increment(name, labels?, delta?)`, `getCounter`,
   `getCounters`, `resetForTest`. Callers in `worker.ts`,
   `divergenceReport.ts`, and `reaper.ts` must not need to change.
3. Wire the alert thresholds above into the chosen notifier. Use the metric
   names and labels exactly as documented above.
4. Add an HTTP endpoint exposing the metrics in the backend's wire format.
   The in-process `getCounters()` snapshot stays as a JSON fallback for unit
   tests and an ops-debug endpoint.
