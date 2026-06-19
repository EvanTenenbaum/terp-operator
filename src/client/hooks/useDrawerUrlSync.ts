import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { drawerStorageKey, useUiStore } from '../store/uiStore';
import type { DrawerStateName, ViewKey } from '../../shared/types';

/**
 * TER-1601: Sync ContextDrawer open state + active entity to URL query params.
 *
 * This allows the browser Back/Forward buttons to restore drawer state when
 * navigating between views within the same session. The URL is updated with
 * replace (no history spam) so only the current view's drawer state is encoded.
 *
 * URL params written:
 *   ?drawer=<stateName>&entityType=<type>&entityId=<id>
 *
 * On view mount, params are read and drawer state + entity are restored if
 * a valid drawer param is present.
 *
 * Security: entity UUIDs are visible in the URL bar, same as if the user had
 * navigated to a detail page. The underlying data is still auth-gated. The
 * existing `resetSession` on logout clears the in-memory state; the URL will
 * differ only for the current browser tab session.
 */
export function useDrawerUrlSync(view: ViewKey) {
  const [searchParams, setSearchParams] = useSearchParams();

  const drawerState = useUiStore((state) => {
    const entity = state.activeDrawerEntityByView[view];
    const key = entity ? drawerStorageKey(view, entity) : `${view}:queue`;
    return state.drawerByView[key]?.state ?? 'closed';
  });
  const activeEntity = useUiStore((state) => state.activeDrawerEntityByView[view]);
  const setDrawerState = useUiStore((state) => state.setDrawerState);
  const setDrawerEntity = useUiStore((state) => state.setDrawerEntity);

  // On mount only: restore drawer state from URL params if present.
  // This handles the browser Back button case where URL params survive navigation.
  useEffect(() => {
    const drawerParam = searchParams.get('drawer') as DrawerStateName | null;
    const entityTypeParam = searchParams.get('entityType');
    const entityIdParam = searchParams.get('entityId');
    if (drawerParam && drawerParam !== 'closed' && entityTypeParam) {
      setDrawerEntity(view, entityTypeParam, entityIdParam ?? null);
      setDrawerState(view, drawerParam);
    }
    // Mount-only: read initial drawer state from URL params
  }, []);

  // Sync drawer state + entity → URL params on every state change.
  // Uses replace:true so the URL updates in-place without creating history entries.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (drawerState === 'closed') {
          next.delete('drawer');
          next.delete('entityType');
          next.delete('entityId');
        } else {
          next.set('drawer', drawerState);
          if (activeEntity && activeEntity.entityType !== 'queue') {
            next.set('entityType', activeEntity.entityType);
            if (activeEntity.entityId) {
              next.set('entityId', activeEntity.entityId);
            } else {
              next.delete('entityId');
            }
          } else {
            next.delete('entityType');
            next.delete('entityId');
          }
        }
        return next;
      },
      { replace: true }
    );
  }, [drawerState, activeEntity, setSearchParams]);
}
