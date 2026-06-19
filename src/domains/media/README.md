# Media Domain

## Public API

| Export | Type | Description |
|--------|------|-------------|
| `commands.ts` → `uploadMedia` | Command | Upload photography media |
| `commands.ts` → `deleteMedia` | Command | Remove media from batch |
| `commands.ts` → `setPrimaryPhoto` | Command | Set primary batch photo |

## Depends On

- `src/domains/shared/journal.ts` — command journal writer
- `src/server/services/photoUploadTokens.ts` — upload token management

## Consumed By

- Photography module UI components
- `src/server/routers/media.ts` — media query router

## Tests

- `src/domains/media/__tests__/integration.test.ts` — command integration
