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
 *   persisted to both the UI store (fast in-memory) and the DB via
 *   `userDismissedBanners` (TER-1587, CAP-033) so dismissals survive page
 *   refreshes. The DB record is cleared when the engine leaves shadow mode so
 *   the banner reappears if shadow mode is re-enabled — operators always see
 *   the warning when the mode flips on.
 */

const SHADOW_BANNER_KEY = 'shadow-mode' as const;

export function ShadowModeBanner() {
  const { data, isLoading } = trpc.credit.creditEngineStances.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });

  // DB-backed dismissal check (TER-1587): seeded from DB on mount so the
  // banner stays hidden across page refreshes within the same shadow-mode
  // period.
  const { data: dismissalData, isLoading: dismissalLoading } = trpc.credit.isBannerDismissed.useQuery(
    { bannerKey: SHADOW_BANNER_KEY },
    { refetchOnWindowFocus: false }
  );
  const dismissBannerMutation = trpc.credit.dismissBanner.useMutation();
  const clearBannerDismissalMutation = trpc.credit.clearBannerDismissal.useMutation();

  const dismissed = useUiStore((state) => state.dismissedShadowBanner);
  const setDismissed = useUiStore((state) => state.setDismissedShadowBanner);

  const shadowMode = data?.config?.shadowMode === true;

  // Sync DB dismissal state into the UI store on initial load.
  useEffect(() => {
    if (!dismissalLoading && dismissalData?.dismissed && !dismissed) {
      setDismissed(true);
    }
  }, [dismissalLoading, dismissalData, dismissed, setDismissed]);

  // When shadow mode turns off: reset in-memory dismissal and clear the DB
  // record so the banner reappears the next time shadow mode is enabled.
  useEffect(() => {
    if (!isLoading && data && !shadowMode && dismissed) {
      setDismissed(false);
      clearBannerDismissalMutation.mutate({ bannerKey: SHADOW_BANNER_KEY });
    }
  }, [isLoading, data, shadowMode, dismissed, setDismissed, clearBannerDismissalMutation]);

  if (isLoading || !data || dismissalLoading) return null;
  if (!shadowMode) return null;
  if (dismissed) return null;

  function handleDismiss() {
    setDismissed(true);
    dismissBannerMutation.mutate({ bannerKey: SHADOW_BANNER_KEY });
  }

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
        onClick={handleDismiss}
      >
        Dismiss
      </button>
    </div>
  );
}
