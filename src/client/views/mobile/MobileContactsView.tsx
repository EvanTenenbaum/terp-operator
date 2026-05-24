export function MobileContactsView() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
      <span className="mb-3 text-4xl" aria-hidden="true">👤</span>
      <p className="text-base font-semibold" style={{ color: 'var(--m-ink)' }}>Contacts</p>
      <p className="mt-2 text-sm" style={{ color: 'var(--m-muted)' }}>Available after CAP-033 Phase 4 backend queries land.</p>
      <p className="mt-1 font-mono text-xs" style={{ color: 'var(--m-muted-2)' }}>Needs: queries.contactDirectory, queries.contactProfile</p>
    </div>
  );
}
