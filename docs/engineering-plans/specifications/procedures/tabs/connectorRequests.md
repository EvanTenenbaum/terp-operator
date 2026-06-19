# Procedure Spec: `queries.connectorRequestsTabs`

**Pattern:** See [../entityTabs.md](../entityTabs.md). This sheet is the per-entity instance.

## §1 Purpose

Drives the connector requests inbox with status tabs (`open` / `approved` / `rejected` / `routed`). The operator triages inbound external requests from here.

## §2 Input Schema (Zod)

```ts
// src/shared/schemas/tabs/connectorRequests.ts
import { z } from 'zod';
import { ConnectorRequestStatus } from '../statuses';

export const connectorRequestsTabsInputSchema = z.object({
  status: ConnectorRequestStatus.optional(),
  inboundChannel: z.string().min(1).max(40).optional(),
  text: z.string().trim().max(120).optional(),  // matches subject / requester
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0)
}).strict();
```

## §3 Output Schema (Zod)

```ts
export const connectorRequestTabRowSchema = z.object({
  id: z.string().uuid(),
  inboundChannel: z.string().nullable(),
  subject: z.string().nullable(),
  requesterId: z.string().uuid().nullable(),
  requester: z.string().nullable(),
  status: ConnectorRequestStatus,
  routedTo: z.string().nullable(),
  payloadSummary: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime().nullable()
});

export const connectorRequestsTabsOutputSchema = z.object({
  entityType: z.literal('connectorRequests'),
  status: ConnectorRequestStatus.optional(),
  rows: z.array(connectorRequestTabRowSchema),
  totalRows: z.number().int().min(0)
});
```

## §4 Role Gating

Min role: `operator`.

## §5 Status Values (from `src/shared/statuses.ts`)

`ConnectorRequestStatus.options`: `'open'`, `'approved'`, `'rejected'`, `'routed'`.

## §6 N+1 Avoidance

Single SQL statement. `count(*) OVER ()` for `totalRows`. Optional `LEFT JOIN` to the requester table (depending on schema; `LEFT JOIN customers` if `requester_id` is a customer FK).

## §7 Test Sketches

```ts
it('returns requests filtered by status', async () => {
  await seedConnectorRequests([
    { status: 'open' }, { status: 'open' }, { status: 'approved' }
  ]);
  const result = await caller.queries.connectorRequestsTabs({ status: 'open' });
  expect(result.rows).toHaveLength(2);
});

it('filters by inboundChannel', async () => {
  await seedConnectorRequests([
    { status: 'open', inbound_channel: 'email' },
    { status: 'open', inbound_channel: 'webhook' }
  ]);
  const result = await caller.queries.connectorRequestsTabs({ status: 'open', inboundChannel: 'email' });
  expect(result.rows).toHaveLength(1);
});

it('rejects out-of-enum status', async () => {
  await expect(
    caller.queries.connectorRequestsTabs({ status: 'closed' })
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
});

it('executes exactly one SQL statement per call', async () => {
  const sqlSpy = trackPgStatements();
  await caller.queries.connectorRequestsTabs({ status: 'open' });
  expect(sqlSpy.callsForCurrentTest).toBe(1);
});
```

## §8 Acceptance Criteria

- [ ] AC-1: Procedure added with input/output per §§2–3.
- [ ] AC-2: Status values imported from `src/shared/statuses.ts`.
- [ ] AC-3: Single SQL statement per call.
- [ ] AC-4: §7 tests pass.
