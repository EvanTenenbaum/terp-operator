import { Clipboard, Filter, PackagePlus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { trpc } from '../api/trpc';
import type { GridRow } from '../../shared/types';
import { WorkspacePanel } from './WorkspacePanel';

export interface InventoryFinderBatch extends GridRow {
  batchCode?: string;
  sourceCode?: string | null;
  shorthand?: string | null;
  name?: string;
  itemAlias?: string | null;
  displayName?: string | null;
  category?: string;
  vendorId?: string | null;
  vendor?: string | null;
  availableQty?: string | number;
  unitPrice?: string | number;
  unitCost?: string | number;
  location?: string | null;
  lotCode?: string | null;
  ownershipStatus?: string | null;
  legacyMarker?: string | null;
  intakeDate?: string | null;
  ticketCost?: string | number | null;
  notes?: string | null;
  mediaStatus?: string | null;
  priceRange?: string | null;
  tags?: string[] | string | null;
  ageDays?: number;
  uom?: string | null;
}

interface InventoryFinderPanelProps {
  selectedOrderId?: string;
  focusKey?: string;
  addedBatchIds?: Set<string>;
  initialSearch?: string;
  onAddBatch: (batch: InventoryFinderBatch, qty: number) => Promise<void>;
}

const savedSlices = [
  ['aging-premium', 'Aging premium'],
  ['consignment-risk', 'Consignment risk'],
  ['value-buyers', 'Value buyers'],
  ['low-stock', 'Low stock'],
  ['office-owned', 'Office owned']
] as const;

export function InventoryFinderPanel({ selectedOrderId, focusKey = '', addedBatchIds = new Set(), initialSearch = '', onAddBatch }: InventoryFinderPanelProps) {
  const reference = trpc.queries.reference.useQuery();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [tag, setTag] = useState('');
  const [location, setLocation] = useState('');
  const [ownership, setOwnership] = useState('');
  const [minQty, setMinQty] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [agingOnly, setAgingOnly] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [activeSlice, setActiveSlice] = useState('');
  const lastInitialSearch = useRef('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rows = ((reference.data?.availableBatches ?? []) as InventoryFinderBatch[]).map((row) => ({
    ...row,
    tags: Array.isArray(row.tags) ? row.tags : String(row.tags ?? '').split(',').map((item) => item.trim()).filter(Boolean)
  }));

  const facets = useMemo(() => {
    return {
      categories: unique(rows.map((row) => row.category)),
      vendors: reference.data?.vendors ?? [],
      tags: unique(rows.flatMap((row) => (Array.isArray(row.tags) ? row.tags : []))),
      locations: unique(rows.map((row) => row.location)),
      ownership: unique(rows.map((row) => row.ownershipStatus))
    };
  }, [reference.data?.vendors, rows]);

  useEffect(() => {
    const nextSearch = initialSearch.trim();
    if (nextSearch && nextSearch !== lastInitialSearch.current) {
      setSearch(nextSearch);
      lastInitialSearch.current = nextSearch;
    }
  }, [initialSearch]);

  useEffect(() => {
    if (selectedOrderId || focusKey) searchInputRef.current?.focus();
  }, [focusKey, selectedOrderId]);

  const filtered = useMemo(() => {
    const parsed = parseFinderSearch(search);
    const terms = parsed.terms;
    const min = minQty ? Number(minQty) : null;
    const max = maxPrice ? Number(maxPrice) : parsed.maxPrice;
    return rows
      .filter((row) => {
        const tags = Array.isArray(row.tags) ? row.tags : [];
        const haystack = buildFinderHaystack(row, tags);
        if (terms.length && !terms.every((term) => haystack.includes(term))) return false;
        if (category && row.category !== category) return false;
        if (vendorId && row.vendorId !== vendorId) return false;
        if (tag && !tags.map((value) => value.toLowerCase()).includes(tag.toLowerCase())) return false;
        if (location && row.location !== location) return false;
        if (ownership && row.ownershipStatus !== ownership) return false;
        if (min != null && Number(row.availableQty ?? 0) < min) return false;
        if (max != null && Number(row.unitPrice ?? 0) > max) return false;
        if (agingOnly && Number(row.ageDays ?? 0) < 30) return false;
        return true;
      })
      .sort((a, b) => Number(b.availableQty ?? 0) - Number(a.availableQty ?? 0))
      .slice(0, 80);
  }, [agingOnly, category, location, maxPrice, minQty, ownership, rows, search, tag, vendorId]);

  const compared = useMemo(() => rows.filter((row) => compareIds.has(row.id)).slice(0, 4), [compareIds, rows]);
  const activeFilterLabels = useMemo(
    () =>
      [
        search && `search: ${search}`,
        category,
        vendorName(facets.vendors, vendorId),
        tag,
        location,
        ownership,
        minQty && `>= ${minQty}`,
        (maxPrice || parsedPriceHint(search)) && `<= $${maxPrice || parsedPriceHint(search)}`,
        agingOnly && '30+ days'
      ].filter(Boolean) as string[],
    [agingOnly, category, facets.vendors, location, maxPrice, minQty, ownership, search, tag, vendorId]
  );

  function resetFilters() {
    setSearch('');
    setCategory('');
    setVendorId('');
    setTag('');
    setLocation('');
    setOwnership('');
    setMinQty('');
    setMaxPrice('');
    setAgingOnly(false);
    setActiveSlice('');
  }

  function applySlice(slice: string) {
    resetFilters();
    setActiveSlice(slice);
    if (slice === 'aging-premium') {
      setAgingOnly(true);
      setMinQty('1');
      setMaxPrice('100');
    }
    if (slice === 'consignment-risk') {
      setOwnership('C');
      setMinQty('1');
    }
    if (slice === 'value-buyers') {
      setMaxPrice('30');
      setSearch('value flex');
    }
    if (slice === 'low-stock') {
      setSearch('reorder low');
      setMinQty('1');
    }
    if (slice === 'office-owned') {
      setOwnership('OFC');
    }
  }

  function copySlice() {
    const label = savedSlices.find(([key]) => key === activeSlice)?.[1] ?? 'Custom slice';
    const shareReady = filtered.filter((row) => customerShareReady(row.mediaStatus));
    const heldBack = filtered.length - shareReady.length;
    const customerSafeRows = shareReady
      .slice(0, 20)
      .map((row) => `${row.name} | ${moneyish(row.availableQty)} ${row.uom ?? ''} available | $${moneyish(row.unitPrice)} | ${row.category ?? 'Inventory'}`);
    const text = [`Inventory Finder: ${label}`, `Filters: ${activeFilterLabels.join(', ') || 'none'}`, heldBack ? `${heldBack} lot(s) held back for media readiness.` : '', ...customerSafeRows].filter(Boolean).join('\n');
    void navigator.clipboard?.writeText(text);
  }

  function toggleCompare(batchId: string) {
    setCompareIds((current) => {
      const next = new Set(current);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  }

  async function add(batch: InventoryFinderBatch) {
    const raw = quantities[batch.id] || '1';
    const requested = Math.max(1, Number.parseFloat(raw) || 1);
    const available = Number(batch.availableQty ?? 0);
    await onAddBatch(batch, Math.min(requested, available || requested));
    setQuantities((current) => ({ ...current, [batch.id]: '1' }));
  }

  return (
    <WorkspacePanel
      panelId="sales:inventory-finder"
      title="Inventory Finder"
      subtitle="Posted batches on hand"
      className="finder-panel"
      contentClassName="finder-panel-content"
      actions={
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-600">
          <span>{filtered.length} / {rows.length} shown</span>
          <span className="selection-pill">{activeFilterLabels.length} filter{activeFilterLabels.length === 1 ? '' : 's'}</span>
        </div>
      }
      testId="inventory-finder"
    >
      <div>
      <div className="finder-chip-row" aria-label="Saved inventory slices">
        {savedSlices.map(([key, label]) => (
          <button className={activeSlice === key ? 'finder-chip success' : 'finder-chip'} type="button" key={key} onClick={() => applySlice(key)} aria-pressed={activeSlice === key}>
            {label}
          </button>
        ))}
        <button className="secondary-button compact-action" type="button" disabled={!filtered.some((row) => customerShareReady(row.mediaStatus))} onClick={copySlice}>
          <Clipboard className="h-4 w-4" aria-hidden="true" />
          Copy List for Customer
        </button>
      </div>
      <div className="finder-controls">
        <label className="finder-search">
          <Search className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          <input ref={searchInputRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code, notes, shorthand, vendor, lot, tag, marker" />
        </label>
        <select className="select compact" aria-label="Finder category" value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">Category</option>
          {facets.categories.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <select className="select compact" aria-label="Finder vendor" value={vendorId} onChange={(event) => setVendorId(event.target.value)}>
          <option value="">Vendor</option>
          {facets.vendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>
              {vendor.name}
            </option>
          ))}
        </select>
        <input className="input compact" aria-label="Finder maximum price" value={maxPrice} inputMode="decimal" placeholder={parsedPriceHint(search) ?? 'Max price'} onChange={(event) => setMaxPrice(event.target.value)} />
        <button className="secondary-button compact-action" type="button" onClick={() => setAdvancedOpen((value) => !value)} aria-expanded={advancedOpen}>
          More filters
        </button>
        {hasActiveFilter(search, category, vendorId, tag, location, ownership, minQty, maxPrice, agingOnly) ? (
          <button className="text-button" type="button" onClick={resetFilters}>
            <X className="h-4 w-4" aria-hidden="true" />
            Clear
          </button>
        ) : null}
        {advancedOpen ? (
          <>
        <select className="select compact" aria-label="Finder tag" value={tag} onChange={(event) => setTag(event.target.value)}>
          <option value="">Tag</option>
          {facets.tags.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <select className="select compact" aria-label="Finder location" value={location} onChange={(event) => setLocation(event.target.value)}>
          <option value="">Location</option>
          {facets.locations.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <select className="select compact" aria-label="Finder ownership" value={ownership} onChange={(event) => setOwnership(event.target.value)}>
          <option value="">Owner</option>
          {facets.ownership.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <input className="input compact" aria-label="Finder minimum quantity" value={minQty} inputMode="decimal" placeholder="Min qty" onChange={(event) => setMinQty(event.target.value)} />
        <label className="field-inline checkbox-inline">
          <input type="checkbox" checked={agingOnly} onChange={(event) => setAgingOnly(event.target.checked)} />
          Aging
        </label>
          </>
        ) : null}
      </div>
      <div className="finder-chip-row" aria-label="Active finder filters">
        <Filter className="h-4 w-4 text-zinc-500" aria-hidden="true" />
        {!selectedOrderId ? <span className="finder-chip warning">Choose customer to add</span> : null}
        {activeFilterLabels.map((label) => (
          <span className="finder-chip" key={String(label)}>
            {label}
          </span>
        ))}
      </div>
      {compared.length ? (
        <div className="finder-chip-row" aria-label="Compared inventory">
          <span className="text-xs font-semibold uppercase text-zinc-600">Compare list</span>
          {compared.map((row) => (
            <span key={row.id} className="finder-chip success">
              {row.batchCode} / ${moneyish(row.unitPrice)} / {moneyish(row.availableQty)} {row.uom}
            </span>
          ))}
          <button className="text-button compact-action" type="button" disabled={!compared.some((row) => customerShareReady(row.mediaStatus))} onClick={() => copyFinderOffer(compared)}>
            Copy customer-safe offer
          </button>
        </div>
      ) : null}
      <div className="finder-table-wrap">
        <table className="finder-table">
          <caption className="sr-only">Filtered inventory batches</caption>
          <thead>
            <tr>
              <th>Qty</th>
              <th>Compare</th>
              <th>Batch</th>
              <th>Lot / date</th>
              <th>Product</th>
              <th>Source</th>
              <th>Avail</th>
              <th>Ticket / Price</th>
              <th>Marker</th>
              <th>Media</th>
              <th>Why shown</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length ? (
              filtered.map((row) => {
                const added = addedBatchIds.has(row.id);
                const available = Number(row.availableQty ?? 0);
                return (
                  <tr key={row.id}>
                    <td>
                      <div className="finder-add-cell">
                        <input
                          aria-label={`Quantity for ${row.name ?? row.batchCode}`}
                          value={quantities[row.id] ?? '1'}
                          inputMode="decimal"
                          disabled={!selectedOrderId || added || available <= 0}
                          onChange={(event) => setQuantities((current) => ({ ...current, [row.id]: event.target.value.replace(/[^\d.]/g, '') }))}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void add(row);
                          }}
                        />
                        <button className="secondary-button compact-action finder-add-button" type="button" disabled={!selectedOrderId || added || available <= 0} onClick={() => void add(row)} title={selectedOrderId ? 'Add to selected order' : 'Select an order first'}>
                          <PackagePlus className="h-4 w-4" aria-hidden="true" />
                          Add
                        </button>
                      </div>
                    </td>
                    <td>
                      <input aria-label={`Add ${row.batchCode} to compare list`} type="checkbox" checked={compareIds.has(row.id)} onChange={() => toggleCompare(row.id)} />
                    </td>
                    <td className="font-medium">
                      <div>{row.batchCode}</div>
                      {added ? <span className="finder-chip success">Already in order</span> : null}
                    </td>
                    <td>
                      <div>{row.sourceCode ?? '-'}</div>
                      <div className="text-[11px] text-zinc-500">{dateish(row.intakeDate)}</div>
                    </td>
                    <td>
                      {row.itemAlias ? (
                        <div>
                          <span style={{ color: '#eab308', marginRight: 4 }} title="Customer-facing alias">●</span>
                          {row.itemAlias} <span className="text-[11px] text-zinc-500">— {row.name}</span>
                        </div>
                      ) : (
                        <div>{row.name}</div>
                      )}
                      <div className="text-[11px] text-zinc-500">{row.category} / {Array.isArray(row.tags) ? row.tags.join(', ') : ''}</div>
                    </td>
                    <td>
                      <div>{row.vendor ?? '-'}</div>
                      <div className="text-[11px] text-zinc-500">{row.location ?? '-'} / lot {row.lotCode ?? '-'}</div>
                    </td>
                    <td>{moneyish(row.availableQty)} {row.uom ?? ''}</td>
                    <td>
                      <div>${moneyish(row.ticketCost ?? row.unitCost)}</div>
                      <div className="text-[11px] text-zinc-500">${moneyish(row.unitPrice)} / {row.priceRange ?? '-'}</div>
                    </td>
                    <td>{row.legacyMarker || row.ownershipStatus || '-'}</td>
                    <td>{mediaLabel(row.mediaStatus)}</td>
                    <td className="finder-match">{matchReasons(row, search, { agingOnly, category, location, maxPrice, minQty, ownership, tag }).join('; ')}</td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={11} className="py-8 text-center text-sm text-zinc-600">
                  <div>No inventory matches these filters.</div>
                  <div className="mt-2 flex flex-wrap justify-center gap-2">
                    {[
                      search && ['Clear search', () => setSearch('')],
                      category && ['Clear category', () => setCategory('')],
                      vendorId && ['Clear vendor', () => setVendorId('')],
                      tag && ['Clear tag', () => setTag('')],
                      location && ['Clear location', () => setLocation('')],
                      ownership && ['Clear owner', () => setOwnership('')],
                      maxPrice && ['Clear price', () => setMaxPrice('')],
                      agingOnly && ['Show all ages', () => setAgingOnly(false)]
                    ].filter(Boolean).map((entry) => {
                      const [label, handler] = entry as [string, () => void];
                      return (
                        <button key={label} className="text-button compact-action" type="button" onClick={handler}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!filtered.length ? (
        <div className="mt-2 border border-dashed border-line bg-panel p-3 text-sm text-zinc-700">
          No matching inventory. Try clearing vendor, removing the price cap, or opening more filters.
        </div>
      ) : null}
      </div>
    </WorkspacePanel>
  );
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
}

function vendorName(vendors: Array<{ id: string; name: string }>, id: string) {
  return vendors.find((vendor) => vendor.id === id)?.name ?? '';
}

function moneyish(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0';
}

function buildFinderHaystack(row: InventoryFinderBatch, tags: string[]) {
  return [
    row.batchCode,
    row.sourceCode,
    row.shorthand,
    row.name,
    row.category,
    row.vendor,
    row.location,
    row.lotCode,
    row.priceRange,
    row.legacyMarker,
    row.ownershipStatus,
    row.notes,
    row.ticketCost,
    row.unitCost,
    row.unitPrice,
    tags.join(' ')
  ]
    .join(' ')
    .toLowerCase();
}

function parseFinderSearch(value: string) {
  let normalized = value.toLowerCase();
  const maxMatch = normalized.match(/(?:under|below|less than|<=)\s*\$?\s*(\d+(?:\.\d+)?)/);
  const maxPrice = maxMatch ? Number(maxMatch[1]) : null;
  if (maxMatch) normalized = normalized.replace(maxMatch[0], ' ');
  const stopWords = new Set(['show', 'find', 'need', 'needs', 'want', 'wants', 'for', 'with', 'under', 'below', 'less', 'than', 'at', 'least', 'qty', 'quantity']);
  const terms = normalized
    .replace(/[,$]/g, ' ')
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term && !stopWords.has(term));
  return { terms, maxPrice };
}

function parsedPriceHint(value: string) {
  const maxPrice = parseFinderSearch(value).maxPrice;
  return maxPrice == null ? null : String(maxPrice);
}

function hasActiveFilter(...values: Array<string | boolean>) {
  return values.some(Boolean);
}

function matchReasons(
  row: InventoryFinderBatch,
  search: string,
  filters: { agingOnly: boolean; category: string; location: string; maxPrice: string; minQty: string; ownership: string; tag: string }
) {
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const reasons: string[] = [];
  const fields: Array<[string, unknown]> = [
    ['code', row.batchCode],
    ['source', row.sourceCode],
    ['shorthand', row.shorthand],
    ['note', row.notes],
    ['marker', row.legacyMarker],
    ['tag', tags.join(' ')],
    ['vendor', row.vendor],
    ['price', row.priceRange]
  ];
  for (const term of terms) {
    const hit = fields.find(([, value]) => String(value ?? '').toLowerCase().includes(term));
    if (hit) reasons.push(`${hit[0]} match: ${term}`);
  }
  if (filters.agingOnly) reasons.push(`${row.ageDays ?? 0}d aging`);
  if (filters.ownership) reasons.push(`owner ${row.ownershipStatus}`);
  if (filters.category) reasons.push(`category ${row.category}`);
  if (filters.tag) reasons.push(`tag ${filters.tag}`);
  if (filters.minQty) reasons.push(`qty >= ${filters.minQty}`);
  if (filters.maxPrice) reasons.push(`price <= ${filters.maxPrice}`);
  if (row.mediaStatus !== 'done') reasons.push('catalog media not ready');
  return reasons.length ? [...new Set(reasons)] : ['available posted lot'];
}

function dateish(value: unknown) {
  if (!value) return '-';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString();
}

function mediaLabel(value: unknown) {
  if (value === 'done') return 'Ready';
  if (value === 'in_progress') return 'In progress';
  if (value === 'open') return 'Queued';
  return 'No photo';
}

function customerShareReady(value: unknown) {
  return ['done', 'ready'].includes(String(value ?? '').toLowerCase());
}

function copyFinderOffer(rows: InventoryFinderBatch[]) {
  const shareReady = rows.filter((row) => customerShareReady(row.mediaStatus));
  const text = shareReady.map((row) => `${row.name} / ${moneyish(row.availableQty)} ${row.uom ?? ''} available / $${moneyish(row.unitPrice)}`).join('\n');
  void navigator.clipboard?.writeText(text);
}
