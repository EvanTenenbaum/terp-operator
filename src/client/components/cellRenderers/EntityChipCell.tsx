/**
 * EntityChipCell — AG Grid cell renderer for fields annotated with `smartChip`.
 *
 * Behavior:
 * - Renders the value as a quiet bordered chip with an entity-type glyph.
 * - 400ms hover-intent before opening EntityHoverCard (via portal).
 * - Click → opens DetailSlideover for the target entity by dispatching to
 *   useUiStore (`setDrawerEntity` + `setDrawerState('standard')`). The drawer
 *   is keyed by the currently-active view (so PO view + vendor entity =
 *   vendor detail surfaces in the PO view's slide-over).
 * - Pointer is set to `cursor-pointer` only when the row has a valid id for
 *   the target entity (idField present and truthy).
 *
 * Configuration is read from `params.colDef.__smartChip` (stamped by
 * `useColumnDefs`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ICellRendererParams } from 'ag-grid-community';
import { useUiStore } from '../../store/uiStore';
import EntityHoverCard from './EntityHoverCard';

const HOVER_INTENT_MS = 400;

interface SmartChipConfig {
  target: string;
  idField: string;
  previewTab?: string;
}

/**
 * Pick a 1-character glyph for an entity type. We avoid an icon dependency
 * here — first letter of the target entity is sufficient signal alongside
 * the chip styling and is consistent with the existing minimalist palette.
 */
function glyphFor(target: string): string {
  return (target[0] ?? '·').toUpperCase();
}

export function EntityChipCell(params: ICellRendererParams): React.ReactElement | null {
  const smartChip = (params.colDef as Record<string, unknown> | undefined)?.__smartChip as
    | SmartChipConfig
    | undefined;
  const value = params.value;
  const rowData = (params.data ?? {}) as Record<string, unknown>;

  const cellRef = useRef<HTMLSpanElement | null>(null);
  const intentTimerRef = useRef<number | null>(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const activeView = useUiStore((s) => s.activeView);
  const setDrawerEntity = useUiStore((s) => s.setDrawerEntity);
  const setDrawerState = useUiStore((s) => s.setDrawerState);
  const setDrawerTab = useUiStore((s) => s.setDrawerTab);

  // Cleanup hover timer on unmount to avoid setting state on a dead node.
  useEffect(
    () => () => {
      if (intentTimerRef.current != null) window.clearTimeout(intentTimerRef.current);
    },
    [],
  );

  const entityId = smartChip ? (rowData[smartChip.idField] as string | undefined) : undefined;
  const targetEntity = smartChip?.target;
  const previewTab = smartChip?.previewTab;
  const label = value == null || value === '' ? '—' : String(value);
  const clickable = Boolean(entityId && targetEntity);

  const openHover = useCallback(() => {
    const el = cellRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setAnchor({ top: rect.bottom + 4, left: rect.left });
    setHoverOpen(true);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (!clickable) return;
    if (intentTimerRef.current != null) window.clearTimeout(intentTimerRef.current);
    intentTimerRef.current = window.setTimeout(openHover, HOVER_INTENT_MS);
  }, [clickable, openHover]);

  const handleMouseLeave = useCallback(() => {
    if (intentTimerRef.current != null) {
      window.clearTimeout(intentTimerRef.current);
      intentTimerRef.current = null;
    }
    setHoverOpen(false);
  }, []);

  const handleCloseHover = useCallback(() => setHoverOpen(false), []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!clickable || !entityId || !targetEntity) return;
      e.stopPropagation();
      setDrawerEntity(activeView, targetEntity, entityId);
      if (previewTab) setDrawerTab(activeView, previewTab);
      setDrawerState(activeView, 'standard');
    },
    [
      clickable,
      entityId,
      targetEntity,
      previewTab,
      activeView,
      setDrawerEntity,
      setDrawerState,
      setDrawerTab,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!clickable) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        handleClick(e as unknown as React.MouseEvent);
      }
    },
    [clickable, handleClick],
  );

  if (!smartChip) {
    // Defensive: if a renderer is wired but config is missing, fall back to
    // plain value rendering so the cell never explodes.
    return <span>{label}</span>;
  }

  return (
    <>
      <span
        ref={cellRef}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
        aria-label={clickable ? `Open ${targetEntity} ${label}` : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={[
          'inline-flex items-center gap-1 border border-line bg-white rounded px-2 py-0.5 text-[11px]',
          clickable ? 'cursor-pointer hover:bg-zinc-50' : 'opacity-70',
        ].join(' ')}
        data-testid={`entity-chip-${targetEntity}`}
        data-entity-id={entityId ?? ''}
      >
        <span
          aria-hidden="true"
          className="inline-flex h-3 w-3 items-center justify-center rounded-sm bg-zinc-100 text-zinc-600 text-[8px] font-semibold leading-none"
        >
          {glyphFor(targetEntity ?? '·')}
        </span>
        <span className="truncate">{label}</span>
      </span>
      {hoverOpen && clickable && entityId && targetEntity && (
        <EntityHoverCard
          target={targetEntity}
          entityId={entityId}
          fallbackLabel={label}
          anchor={anchor}
          onClose={handleCloseHover}
        />
      )}
    </>
  );
}

export default EntityChipCell;
