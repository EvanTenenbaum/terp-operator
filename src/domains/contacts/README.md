# Contacts Domain

## Public API

| Export | Type | Description |
|--------|------|-------------|
| `commands.ts` → `createContact` | Command | Create a contact record |
| `commands.ts` → `updateContact` | Command | Update contact fields |
| `commands.ts` → `mergeContacts` | Command | Merge duplicate contacts |

## Depends On

- `src/domains/shared/journal.ts` — command journal writer

## Consumed By

- Contact directory UI (`contactDirectory` query)
- Entity forms (customer, vendor, referee, processor creation)

## Tests

- `src/domains/contacts/__tests__/integration.test.ts` — command integration
