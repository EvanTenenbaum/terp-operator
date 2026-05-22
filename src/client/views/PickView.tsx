import { trpc } from '../api/trpc';
import { usePickWorkLoopGuard } from '../hooks/usePickWorkLoopGuard';

// CAP-030 / TER-1503: Placeholder for the /pick warehouse queue view.
// The work-loop guard is wired here so the route is gated even before the
// full mobile UI lands (see TER-1513 for the multi-screen picker shell).
export function PickView() {
  const me = trpc.auth.me.useQuery();
  usePickWorkLoopGuard(me.data ?? null);

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold">Pick Queue</h1>
      <p className="text-sm text-zinc-500 mt-2">
        Pick queue view — coming soon. Warehouse operators will see released pick lists here.
      </p>
    </div>
  );
}
