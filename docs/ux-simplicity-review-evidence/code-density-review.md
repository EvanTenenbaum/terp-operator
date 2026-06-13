# brokerage-fit-reviewer code density findings (full text in session)
## SalesView.tsx (1,974 lines) — TOO MUCH
18 regions inventoried; customer-mode mounts 13+ simultaneously incl. CustomerPurchaseHistoryPanel (1386), PhotographyQueuePanel (1393), SalesSourcePane+Sale Builder 2-col (1396-1687) w/ 10 sub-regions (customer facts 1443, ShadowModeBanner 1460, credit indicator 1461-1480, referee pill 1488-1511, SalePrePostStrip 1512, typeahead 1520-1548, draft lines grid 1549, line validation 1632, ReceiptPanel 1683), suggestions grid 1745-1809, sheet preview panel 1811-1900 (renders when customerId even with 0 sheetRows — empty state "Select suggestions to build a sheet" at 1884 = self-indictment; condition is `sheetRows.length || customerId`).
Fixes: defaultCollapsed+collapsedSummary on history/photo panels; sheet panel condition → sheetRows.length>0; credit indicator → drawer credit tab/behind openCreditPanel(); referee pill → Sale tray (saleToolsOpen).
## MatchmakingView.tsx (771) — TOO MUCH
7 regions all visible: Settings panel 497-588 (collapsedSummary EXISTS at 500, not defaultCollapsed), Entry forms 603-701, 4 grids: Deterministic Matches 704-727 (primary, pushed below fold), Inventory to Move 729-738, Gaps to Fill 740-749, Customer Needs 754-759 + Vendor Stock 760-767 (2-col registry). 3 distinct work modes in one scroll. Fixes: Settings defaultCollapsed; Needs+Stock → collapsed "Input Registry" panel; Move+Gaps → collapsed "Proactive Opportunities" panel.
## DashboardView.tsx (619) — TOO MUCH
9 panels; money facts TRIPLICATED (KPI band 225-250, TodayFocusTiles 304-338, Money Buckets 347-372). My Open Work grid 505-524 renders same rankedWorkRows as Today's Top Decisions. Fixes: remove Money Buckets (wire KPI clicks → setDrilldownMetric); Today Focus tiles → only Open Orders + Intake Ready; queues stay.
## PurchaseOrdersView.tsx — PARTIAL
Aside "Vendor context" 706-736 (incl PoSignalsSection 731-734, correctly placed) DUPLICATES VendorContextDrawer 738-752 (Context button 585-594). Pick one — aside is the right home, remove drawer trigger. Prepayment field 613-622 always shown in 8-field band — conditional on paymentTerms==='prepayment'.
## CreditReviewView.tsx — TOO MUCH (owner)
CreditDivergencePanel in WorkspacePanel 107-111 unconditionally above queue table 113-201; add defaultCollapsed at 108.
## RefereeDetailPanel.tsx — RIGHT (already a fixed drawer) but NO backdrop/scrim; focus can escape; add backdrop (pattern at SalesView:1902-1905).
## SettingsView.tsx — INCOHERENT
Tabs 44-50: Requests(=ConnectorsView, operational!), Strain aliases, Pricing, System(mgr+), Credit Engine(owner; mixes config + per-customer ops + audit history in one scroll). Route links "Action log →"/"Archive →" 79-89 styled as report-chip = look like tabs but navigate away. Fixes: rename Requests→Connectors; per-customer overrides → CreditReviewView; differentiate link chips.
## Pile-up quant
44 WorkspacePanel usages (Dashboard 9, Sales 4+); 8 FilterPresetStrips (well-placed); SalesView alone has 9 pill/chip types + 6 specialized signal components around the typeahead entry band.
