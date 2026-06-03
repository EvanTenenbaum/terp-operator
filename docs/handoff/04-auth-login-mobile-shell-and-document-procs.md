# 04 — Auth/Login, Mobile Shell Primitives & Document Output Procedures

This supplement closes the artifacts that sit *between* domains: the
authentication entry view, the mobile shell's leaf primitives, and a few
document-output / recovery procedures that the domain dossiers reference but do
not document in their own right. With this file, every view, component, and
`queries.ts` procedure in `00-MASTER-INVENTORY.md` has a dedicated explanation.

---

## A. Authentication & the Login view

### `LoginView` — `src/client/views/LoginView.tsx`

- **Function.** A single email + password form that calls the `auth.login`
  tRPC mutation (`LoginView.tsx:8`) and, on success, invalidates `auth.me`
  (`LoginView.tsx:9`) so the app re-renders into the authenticated shell.
- **Context.** It is the unauthenticated gate. Both the desktop shell and the
  mobile shell render `LoginView` whenever `trpc.auth.me` resolves to no user
  (`MobileShell.tsx:73`, `if (!me.data) return <LoginView />`). While `me` is
  loading, the shell shows a neutral splash (`MobileShell.tsx:65`).
- **Use case.** An operator opens TERP Operator and signs in with a seeded
  account. In `DEV` builds the form pre-fills `owner@terpagro.local` /
  `terp-demo` and shows the demo-password hint (`LoginView.tsx:6,37`); in
  production those defaults are blank.
- **Edge cases / corners.**
  - Login errors render inline from `login.error.message`
    (`LoginView.tsx:32`) — server messages are surfaced verbatim, so the auth
    router must not leak sensitive text (it returns a generic invalid-credentials
    message; see `auth.ts:9`).
  - The submit button is disabled while `login.isLoading` to prevent double
    submit (`LoginView.tsx:34`).
  - Inputs use `autoComplete="username"` / `current-password` so password
    managers work.

### Auth router — `src/server/routers/auth.ts`

| Procedure | Line | Role | Behavior |
| --- | --- | --- | --- |
| `me` | `auth.ts:8` | public | Returns `ctx.user` (or null). The client's session probe; drives the login gate. |
| `login` | `auth.ts:9` | public | Validates `loginSchema`, verifies the bcrypt hash, regenerates the session, and returns the sanitized user (id/email/name/role). |
| `logout` | `auth.ts:40` | public | Destroys the session. |

Session storage, `connect-pg-simple`, bcrypt, and the `requireOperator` HTTP
middleware are detailed in `20-platform-technical-specification.md` §2. The
four-tier `Role` (`viewer < operator < manager < owner`) and the client-side
work-loop lanes are in `01-product-overview-personas-roles.md`.

---

## B. Mobile shell leaf primitives

The mobile experience is assembled by `MobileShell.tsx` (bottom-tab navigation,
title bar, login gate, toast provider) — described structurally in
`01`/`20`. This section documents its reusable leaf primitives, which the mobile
views (`MobileDashboardView`, `MobileInventoryView`, `MobileCatalogView`,
`MobilePaymentsView`, `MobileContactsView`, `MobileContactProfileView`) compose.

### `MobileToast` — `src/client/components/mobile/MobileToast.tsx`
- **Function.** A context provider (`MobileToastProvider`) + `useMobileToast()`
  hook exposing `addToast(message, variant)` with `success | error` variants
  (`MobileToast.tsx:8-30`). Toasts auto-dismiss on a timer; all pending timers
  are cleared on unmount to avoid leaks (`MobileToast.tsx:24`).
- **Context.** The mobile analogue of the desktop `ToastCenter`. Mounted once at
  the shell root (`MobileShell.tsx` wraps children in `MobileToastProvider`).
- **Use case.** After a mobile command (e.g. an inventory action or payment),
  the view calls `addToast('Saved', 'success')` for lightweight confirmation.
- **Edge case.** `nextId` is a monotonically increasing ref so keys never
  collide even when toasts fire in the same tick (`MobileToast.tsx:21`).

### `MobileEmptyState` — `MobileEmptyState.tsx`
- **Function.** Centered empty-state with optional `icon`, `headline`, `body`,
  and a single optional CTA button (`onCta`/`ctaLabel`).
- **Context / use case.** Shown when a mobile list (inventory, contacts,
  payments) has no rows or no search match, optionally offering a primary
  action (e.g. "Add contact"). Mirror of desktop `EmptyState`.
- **Edge case.** The CTA renders only when *both* `ctaLabel` and `onCta` are
  provided (`MobileEmptyState.tsx:16`).

### `MobileFilterChips` — `MobileFilterChips.tsx`
- **Function.** A horizontally scrollable single-select chip row
  (`options`, `value`, `onChange`); the active chip uses `m-chip-active` and
  sets `aria-pressed` (`MobileFilterChips.tsx:18-24`).
- **Context / use case.** Quick segment switching on mobile lists (e.g. status
  filters, catalog categories) without opening a full filter builder.
- **Edge case.** Clicking the already-active chip is a no-op — `onChange` only
  fires on a real change (`MobileFilterChips.tsx:21`).

### `MobileSearchInput` — `MobileSearchInput.tsx`
- **Function.** A controlled `type="search"` input with a leading magnifier
  icon and themed styling (`value`, `onChange`, `placeholder`).
- **Context / use case.** The standard search box atop mobile lists; feeds the
  list's local filter or a server query.
- **Edge case.** Uses native `type="search"` so mobile keyboards show a search
  affordance and the OS provides a clear button.

> The remaining mobile components (`MobileShell`, `MobileConfirmSheet`,
> `MobileContactCard`) are covered in `01`/`16`; mobile *views* are covered in
> their domain dossiers (inventory→11, payments→14, contacts→16, dashboard→02).

---

## C. Document-output & recovery procedures

These `queries.ts` procedures generate operator/customer-facing document
renderings or power the find/replace recovery tool. The receipt *families* for
PO, sales, and payments are documented in their domains (10/12/14); this section
makes the **vendor-payment** family and **find/replace** explicit.

### Vendor-payment document family — `src/server/routers/queries.ts`
Each mirrors the other receipt families (internal = full cost/margin detail;
external = customer/vendor-safe):

| Procedure | Line | Output |
| --- | --- | --- |
| `vendorPaymentExternalReceipt` | `queries.ts:1562` | Vendor-safe receipt for a recorded vendor payment (no internal cost annotations). |
| `vendorPaymentInternalReceipt` | `queries.ts:1567` | Internal receipt with full ledger/allocation context. |
| `vendorPaymentSignalText` | `queries.ts:1572` | Short copy-paste "signal" text summarizing the payment for messaging. |
| `vendorPaymentPrintHtml` | `queries.ts:1625` | Print-ready HTML rendering of the vendor payment. |

All four are `protectedProcedure` (any authenticated operator) and read from the
`vendor_payments` / `vendor_bills` tables and their document snapshots (see
`14-domain-money-ar-ap-closeout-recovery.md` for the AP model and
`documentSnapshots` mechanics).

### `findReplacePreview` — `queries.ts:1193`
- **Function.** A read-only, `protectedProcedure` preview that computes the
  rows a bulk find/replace would affect, **without** mutating anything.
- **Context.** Part of the Recovery / data-hygiene tooling. It is the preview
  half of a find-then-apply flow; the apply step runs through the command bus
  (see Recovery in `14`).
- **Use case.** An operator correcting a mistyped vendor/strain/marker across
  many rows previews the blast radius before committing, consistent with the
  app-wide "preview before destructive action" pattern (cf. `reversalPreview`,
  `closeoutPreview`).
- **Edge case.** Being preview-only, it never writes to `command_journal`; the
  eventual apply is the auditable, reversible event.

---

_With this supplement, the [Coverage Matrix](./99-COVERAGE-MATRIX.md) resolves
every view, component, and procedure to at least one dossier._
