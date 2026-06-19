# Shared Domain Utilities

## Public API

| Export | Type | Description |
|--------|------|-------------|
| `journal.ts` → `writeJournalEntry` | Util | Write to command_journal with before/after snapshots |
| `journal.ts` → `buildReversalPayload` | Util | Build payload for command reversal |
| `socket-emitter.ts` → `emitJournalEvent` | Util | Emit Socket.io event to all connected clients |

## Depends On

- `src/server/db.ts` — database pool
- `src/server/schema.ts` — commandJournal table

## Consumed By

- All domain command handlers (`src/domains/*/commands.ts`)
- `src/server/services/commandBus.ts`

## Tests

- Implicitly tested via domain integration tests
