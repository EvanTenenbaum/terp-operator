# Design Map

## Spacing Scale
Base unit: **4px**
- `4px` — small radius, tight gaps
- `8px` — primary border radius, component padding
- `12px` — secondary border radius (cards)
- `16px` — grid gutter (transactions page), larger radius
- `24px` — grid gutter (dashboard), section-level gap

## Font Hierarchy
| Role | Family | Size | Weight | Line Height |
|------|--------|------|--------|-------------|
| h1 page title | Arcadia Display | 28px | 380 | 36px |
| Table data | Arcadia Text | 16px | 400 | 16px |
| Body text | Arcadia Text | 15px | 400 | 24px |

## Color Palette
| Role | Value | Notes |
|------|-------|-------|
| Page background | `#FBFCFD` | Blue-tinted near-white |
| Card surface | `#FFFFFF` | Pure white cards on tinted bg |
| Text primary | `#1E1E2A` | Blue-tinted near-black |
| Text secondary | `#535461` | Blue-gray |
| Text muted | `#70707D` | Blue-gray, lower contrast |
| Accent | `#5266EB` | Blue accent — buttons, links |
| Success | `#036E43` | Green — positive amounts, status |
| Error | `#B0175F` | Deep red — failed status, negative |
| Divider | `rgba(112,115,147,0.1)` | Blue-violet at 10% opacity |
| Hover fill | `rgba(112,115,147,0.16)` | Blue-violet at 16% opacity |

**Tinting rule**: Every neutral color carries a blue-violet cast. No pure gray (#888, #CCC, #F5F5F5) appears anywhere. Shadow colors follow the same rule — all use blue/navy tints, never rgba(0,0,0,x).

## Image Ratios
| Usage | Ratio | Rendered Size |
|-------|-------|---------------|
| Avatar | 1:1 | 24px–32px |
| Merchant logo | 1:1 | 28px |

No hero images, illustrations, or decorative imagery on functional pages.

## Component Tokens

### Border Radius
- `4px` — small tags, inline elements
- `5px` — small interactive elements
- `8px` — primary radius: input fields, buttons, panels (dominant)
- `12px` — dashboard cards
- `16px` — larger containers, modals
- `50%` — circular avatars
- `100%` — pill shapes
- Directional: `8px 0px 0px 8px` / `0px 8px 8px 0px` — split button groups

### Shadows
**Card (2-layer):**
```
rgba(175,178,206,0.56) 0px 0px 2px 0px,
rgba(4,4,52,0.1) 0px 1px 4px 0px
```
**Elevated (4-layer):**
```
rgba(183,187,219,0.14) 0px 1px 4px 0px,
rgba(175,178,206,0.9) 0px 0px 1px 0px,
rgba(14,14,45,0.08) 0px 8px 12px 0px,
rgba(4,4,52,0.02) 0px 14px 20px 0px
```

### Grid
- Container: `1440px` width, no max-width constraint
- Variable columns: 2 (dashboard) to 5 (transactions)
- Gutters: `16px`–`24px`

### Table Row Standard
- Height: `51px`
- Font: `16px` Arcadia Text at `400` weight
- Line height: `16px` (single-line rows)
- Headers: checkbox + 4 sortable columns + 4 metadata columns
- Row actions: click-to-navigate, multi-select via checkbox, inline category/GL code editing

### Motion
- Duration: `0.14s`–`0.20s`
- Properties: `transform`, `opacity`, `color`, `filter` only
- Easing: `ease-out` (default), custom `cubic-bezier(0.35, 0, 0.25, 1)` (panel transitions)
- `prefers-reduced-motion`: respected
- `:focus-visible`: not detected

---

# Taste DNA

### Rows Over Cards — The Table IS the Interface
- **Trigger**: When displaying hundreds of financial transactions, payments, and invoices requiring rapid scanning and comparison
- **Decision**: Chose dense 51px table rows as the primary interaction surface on every functional page over card-based browsing layouts (Linear, Notion style) or list views
- **Reason**: Financial operators scan for patterns across amounts, dates, and counterparties — not browse visually. A card layout shows 4-5 items per viewport; a table shows 13-14. Mercury trusts that operators know what they're looking for and optimizes for finding it fast rather than making it look explorable.
- **Evidence**: 51px row height (3.2:1 height-to-font ratio), 16px font at 16px line-height, 9-column table with 100 rows on Transactions page, 5 of 5 functional pages use `<table>` as primary surface, no card/list view toggle exists

### Blue-Tinted Atmosphere — No Pure Gray Anywhere
- **Trigger**: When choosing neutral colors for a banking interface that needs to feel trustworthy without feeling decorative
- **Decision**: Chose systematic blue-violet tinting across every neutral color over pure mathematical grays
- **Reason**: Pure gray feels like a spreadsheet — functional but anonymous. Blue-tinted neutrals at low saturation register as "this feels right" rather than "this is blue." A bank that cares about its neutral palette is implicitly a bank that cares about precision.
- **Evidence**: Near-black text `rgb(30,30,42)` is blue-shifted, page background `rgb(251,252,253)` is blue-tinted, all dividers use `rgba(112,115,147,0.1)` with explicit blue-violet pigment, all shadow colors use blue/navy tints, zero pure-gray hex values detected

### Stillness as Polish — Motion Only Where It's Felt, Never Where It's Watched
- **Trigger**: When adding interactive feedback to a tool used daily for hours by professional operators
- **Decision**: Chose 0.14-0.20s transform/opacity-only transitions over longer, richer, or layout-affecting animations. No width, height, or margin is ever animated. prefers-reduced-motion is respected.
- **Reason**: In a daily-use professional tool, animation that demands attention becomes exhausting by hour two. Mercury's motion acknowledges that the operator isn't here to watch — they're here to work. Animations confirm actions without stealing focus.
- **Evidence**: All transitions 0.14-0.20s, only composite properties animated (transform, opacity, color, filter), zero layout property animations, custom cubic-bezier on panel transitions, reduced-motion media query respected

### Two Fonts, One Unusual Weight — Brand Voice Without Brand Noise
- **Trigger**: When establishing typographic personality for a financial product that must feel credible, not playful
- **Decision**: Chose exactly two fonts — Arcadia Text (body/UI) and Arcadia Display (headings only) — with only two weights (400 and a custom 380) over a multi-weight system or additional typefaces
- **Reason**: Most SaaS products differentiate through color or illustration; Mercury does it through typographic restraint. The 380-weight Display heading is the single distinguishing typographic gesture — noticeably lighter than Regular but not thin. Using only two weights means every text element has exactly one correct style.
- **Evidence**: Only 2 font families across 5 pages, only 2 weights (380 for h1, 400 for everything else), h1 at 28px/380/Arcadia Display is the sole use of the display face, no bold/italic/third font detected, no mathematical type scale — sizes are functionally chosen
