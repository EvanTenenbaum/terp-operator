# TERP Operator — Complete Developer Handoff Bible

This directory is a **zero-tribal-knowledge handoff package**. A new engineering
team should be able to take full ownership of TERP Operator using only these
documents plus the source tree. It pairs an exhaustive **Customer Journey Map
(CJM)** with a **corresponding Backend Technical Specification**, so that every
operator-visible feature is traceable to the code that implements it, and every
backend mechanism is traceable to the journey it serves.

> Generated against branch `claude/adoring-darwin-oNe3v`. Ground truth is the
> source under `src/`; existing prose docs were verified against code, not trusted
> blindly. Where this package and older docs disagree, **this package and the code win.**

## What TERP Operator is

TERP Operator is the internal operations console for a cannabis **brokerage**:
it buys inventory from vendors, receives and photographs it, sells it to
customers, fulfills orders from a warehouse, collects and pays money, manages
credit risk, and closes the books — all on a **CQRS / command-bus +
event-journal** backend with deterministic projections and reversible commands.

## How to read this package

Read top to bottom for a full understanding, or jump to the domain you own.

| # | Document | What it covers |
| --- | --- | --- |
| 00 | [Master Inventory](./00-MASTER-INVENTORY.md) | Machine-extracted list of **every** table, command, tRPC procedure, view, component, service, projection, migration, and socket event. The completeness contract. |
| 01 | [Product Overview, Personas & Roles](./01-product-overview-personas-roles.md) | Business model, work loops, every user role + RBAC, navigation map. |
| 02 | [Global UX Primitives & Navigation](./02-global-ux-primitives-and-navigation.md) | The reusable shell: Identity Ribbon, Context Drawer, Finder, Operator Grid, Command Palette, Dashboard/Work Queue, etc. |
| 03 | [Capability Registry Walkthrough](./03-capability-registry-walkthrough.md) | Every CAP-xxx capability explained as function · context · use case, mapped to code. |
| 04 | [Auth/Login, Mobile Shell Primitives & Document Procs](./04-auth-login-mobile-shell-and-document-procs.md) | The auth gate, mobile leaf primitives, and document-output/recovery procedures that sit between domains. |
| 10 | [Purchasing & Intake](./10-domain-purchasing-intake.md) | Purchase Orders + Receiving. Journey + backend. |
| 11 | [Inventory, Tags & Media](./11-domain-inventory-tags-media.md) | Batches, movements, tags/brands, photography pipeline. |
| 12 | [Sales, Pricing & Matchmaking](./12-domain-sales-pricing-matchmaking.md) | Sales orders, pricing engine, demand/supply board. |
| 13 | [Fulfillment & Picking](./13-domain-fulfillment-picking.md) | Warehouse release → pick → pack → fulfill. |
| 14 | [Money: AR / AP / Closeout / Recovery](./14-domain-money-ar-ap-closeout-recovery.md) | Payments, vendor bills, ledger, period close, reversal/restore. |
| 15 | [Credit Engine](./15-domain-credit-engine.md) | The automated credit-risk subsystem in full. |
| 16 | [Contacts, Referees, Connectors & Processors](./16-domain-contacts-referees-connectors-processors.md) | CRM, brokers/referees, connector review, payment processors. |
| 20 | [Platform Technical Specification](./20-platform-technical-specification.md) | Cross-cutting: stack, command bus internals, data layer, realtime, build/CI, deploy. The details not visible in any CJM. |
| 99 | [Coverage Matrix](./99-COVERAGE-MATRIX.md) | Proof that every inventoried artifact is documented. Any unmapped item is a defect. |

## Document conventions

- **Journey sections** describe the operator experience: happy path → branch
  scenarios → error states → recovery paths → handoffs, with each feature
  explained as **function · context · use case**, including feature *combinations*.
- **Backend sections** describe the implementation that backs each journey step:
  command input schema, required role, mutation logic, tables/columns touched,
  invariants, projections/receipts, socket events, and failure modes — with
  `file:line` citations.
- Citations use `path:line` form so they are clickable in most editors.

## Completeness guarantee

This package is built so that nothing is silently missing. The
[Master Inventory](./00-MASTER-INVENTORY.md) is extracted mechanically from the
code, and the [Coverage Matrix](./99-COVERAGE-MATRIX.md) maps each inventoried
artifact to the section that documents it. If you add a command, table, view, or
procedure, add a row to both — an unmapped artifact is treated as a documentation
defect.
