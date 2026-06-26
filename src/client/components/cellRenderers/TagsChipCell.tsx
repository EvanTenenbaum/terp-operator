/**
 * TagsChipCell — AG Grid cell renderer for multi-value tag columns.
 *
 * Displays tags as colored chips (up to 3 visible + "+N" overflow).
 * Uses a deterministic palette derived from StatusPill tones so tag colors
 * are stable across renders and consistent with the design system.
 *
 * Value format: comma-separated string ("organic,sustainable") or string[].
 * Null/empty/undefined → renders nothing.
 */
import type { ICellRendererParams } from 'ag-grid-community';
import clsx from 'clsx';

// ── Tag chip palette ────────────────────────────────────────────────────────
// Deterministic 6-color rotation derived from StatusPill tones.
// Each tag string is hashed to a palette index so the same tag always
// gets the same color.
const TAG_CHIP_CLASSES = [
  'bg-sky-50 text-sky-800 border-sky-300',
  'bg-emerald-50 text-emerald-800 border-emerald-300',
  'bg-violet-50 text-violet-800 border-violet-300',
  'bg-amber/10 text-amber-800 border-amber',
  'bg-blue-50 text-blue-800 border-blue-300',
  'bg-indigo-50 text-indigo-800 border-indigo-300',
] as const;

const MAX_VISIBLE = 3;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Normalize AG Grid cell value to string array. */
function normalizeTags(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** Deterministic palette index for a tag string. */
function tagColorIndex(tag: string): number {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % TAG_CHIP_CLASSES.length;
}

// ── Component ───────────────────────────────────────────────────────────────

interface TagsChipCellProps extends ICellRendererParams {
  value: unknown;
}

export default function TagsChipCell(params: TagsChipCellProps): JSX.Element | null {
  const tags = normalizeTags(params.value);

  if (tags.length === 0) return null;

  const visible = tags.slice(0, MAX_VISIBLE);
  const overflow = tags.length - MAX_VISIBLE;

  return (
    <span className="inline-flex items-center gap-1 max-w-full overflow-hidden">
      {visible.map((tag) => (
        <span
          key={tag}
          className={clsx(
            'inline-flex items-center rounded border px-2 h-[18px] text-[11px] font-medium whitespace-nowrap leading-none',
            TAG_CHIP_CLASSES[tagColorIndex(tag)],
          )}
          title={tag}
        >
          {tag}
        </span>
      ))}
      {overflow > 0 && (
        <span
          className="inline-flex items-center rounded border border-zinc-300 bg-zinc-50 px-1.5 h-[18px] text-[11px] font-medium text-zinc-500 whitespace-nowrap leading-none"
          title={tags.slice(MAX_VISIBLE).join(', ')}
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}
