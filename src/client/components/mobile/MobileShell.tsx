import type React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { trpc } from '../../api/trpc';
import { LoginView } from '../../views/LoginView';
import { MobileToastProvider } from './MobileToast';

const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  inventory: 'Inventory',
  catalog: 'Catalog',
  payments: 'Payments',
  contacts: 'Contacts',
};

function IconDashboard() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M3 10.5L10 3l7 7.5" /><path d="M5 9v8h4v-5h2v5h4V9" />
    </svg>
  );
}
function IconInventory() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <rect x="3" y="7" width="14" height="10" rx="1.5" /><path d="M7 7V5a3 3 0 016 0v2" /><line x1="3" y1="11" x2="17" y2="11" />
    </svg>
  );
}
function IconCatalog() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <rect x="2.5" y="2.5" width="15" height="15" rx="2" /><path d="M2.5 13l4-4 3 3 3-4 5 6" /><circle cx="7" cy="7.5" r="1.25" />
    </svg>
  );
}
function IconPayments() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <rect x="2" y="5" width="16" height="12" rx="2" /><line x1="2" y1="9" x2="18" y2="9" /><line x1="6" y1="13.5" x2="8" y2="13.5" />
    </svg>
  );
}
function IconContacts() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <circle cx="10" cy="7" r="3" /><path d="M4 17c0-3.314 2.686-6 6-6s6 2.686 6 6" />
    </svg>
  );
}

const NAV_TABS = [
  { to: '/mobile/dashboard', label: 'Dashboard', Icon: IconDashboard },
  { to: '/mobile/inventory', label: 'Inventory',  Icon: IconInventory },
  { to: '/mobile/catalog',   label: 'Catalog',    Icon: IconCatalog   },
  { to: '/mobile/payments',  label: 'Payments',   Icon: IconPayments  },
  { to: '/mobile/contacts',  label: 'Contacts',   Icon: IconContacts  },
] as const;

export function MobileShell() {
  const me = trpc.auth.me.useQuery();
  const location = useLocation();
  const segment = location.pathname.split('/').filter(Boolean)[1] ?? 'dashboard';
  const viewTitle = VIEW_TITLES[segment] ?? 'TERP';

  if (me.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm" style={{ color: 'var(--m-muted)', background: 'var(--m-panel)' }}>
        Loading…
      </div>
    );
  }

  if (!me.data) return <LoginView />;

  return (
    <MobileToastProvider>
      <div className="mobile-shell flex h-screen flex-col overflow-hidden">
        {/* Top header */}
        <header
          className="flex h-16 shrink-0 items-center justify-between border-b px-4"
          style={{ borderColor: 'var(--m-line)', background: 'var(--m-field)' }}
        >
          <span className="text-sm font-bold tracking-widest" style={{ color: 'var(--m-accent)' }}>
            TERP
          </span>
          <span
            className="flex-1 text-center text-base font-semibold"
            style={{ color: 'var(--m-ink)' }}
          >
            {viewTitle}
          </span>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ color: 'var(--m-muted-2)' }}
            aria-label="More options"
          >
            <span aria-hidden="true" className="text-lg leading-none">···</span>
          </button>
        </header>

        {/* Scrollable child route content */}
        <main
          className="min-h-0 flex-1 overflow-y-auto"
          style={{ background: 'var(--m-panel)', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          <Outlet context={{ user: me.data }} />
        </main>

        {/* Bottom nav */}
        <nav
          aria-label="Main mobile navigation"
          className="flex shrink-0 border-t"
          style={{
            height: 'calc(64px + env(safe-area-inset-bottom))',
            paddingBottom: 'env(safe-area-inset-bottom)',
            borderColor: 'var(--m-line)',
            background: 'var(--m-field)',
          }}
        >
          {NAV_TABS.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className="relative flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium no-underline"
              style={({ isActive }) => ({
                color: isActive ? 'var(--m-accent)' : 'var(--m-muted-2)',
              })}
              aria-label={label}
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute top-0 h-0.5 w-10 rounded-full"
                      style={{ background: 'var(--m-accent)' }}
                    />
                  )}
                  <Icon />
                  <span className="text-[10px]">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </MobileToastProvider>
  );
}
