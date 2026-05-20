import { useEffect } from 'react';
import { trpc } from '../../api/trpc';
import { useUiStore } from '../../store/uiStore';

/**
 * Credit Engine Phase 6f — shadow-mode orientation banner.
 *
 * When the credit engine is running in shadow mode, engine recommendations are
 * advisory only and do NOT auto-enforce limits. Operators viewing the credit
 * UIs need this non-blocking banner so they don't expect enforcement that isn't
 * happening.
 *
 * Behavior:
 * - Reads engine config via the existing `credit.creditEngineStances` query.
 * - Renders only when `config.shadowMode === true`.
 * - Dismissal is per-shadow-mode-session: the `dismissedShadowBanner` flag is
 *   persisted to the UI store, but is reset whenever the engine reports
 *   `shadowMode === false`. That way, if an operator turns shadow mode off and
 *   later flips it back on, the banner reappears even if it was previously
 *   dismissed — they rediscover the warning after a config flip.
 */
export function ShadowModeBanner() {
  const { data, isLoading } = trpc.credit.creditEngineStances.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const dismissed = useUiStore((state) => state.dismissedShadowBanner);
  const setDismissed = useUiStore((state) => state.setDismissedShadowBanner);

  const shadowMode = data?.config?.shadowMode === true;

  useEffect(() => {
    if (!isLoading && data && !shadowMode && dismissed) {
      setDismissed(false);
    }
  }, [isLoading, data, shadowMode, dismissed, setDismissed]);

  if (isLoading || !data) return null;
  if (!shadowMode) return null;
  if (dismissed) return null;

  return (
    <div
      role="status"
      className="mt-2 flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <div>
        <strong>Credit engine is in shadow mode.</strong>{' '}
        Engine recommendations are advisory only — limits are not auto-enforced.
        Operators must apply or override recommendations manually.
      </div>
      <button
        type="button"
        className="text-button text-xs font-medium text-amber-700 hover:text-amber-900"
        onClick={() => setDismissed(true)}
      >
        Dismiss
      </button>
    </div>
  );
}
