import type React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { trpc } from '../../api/trpc';
import { MobileEmptyState } from '../../components/mobile/MobileEmptyState';

const ROLE_FLAGS: Array<{ key: string; label: string }> = [
  { key: 'is_customer',   label: 'Customer'   },
  { key: 'is_vendor',     label: 'Vendor'     },
  { key: 'is_referee',    label: 'Referee'    },
  { key: 'is_contractor', label: 'Contractor' },
  { key: 'is_employee',   label: 'Employee'   },
  { key: 'is_processor',  label: 'Processor'  },
];

function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="m-section-header">{children}</p>;
}

export function MobileContactProfileView() {
  const { id: contactId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const profileQuery  = trpc.queries.contactProfile.useQuery(
    { contactId: contactId ?? '' },
    { enabled: Boolean(contactId) }
  );
  const commandsQuery = trpc.queries.relatedCommands.useQuery(
    { contactId: contactId ?? '' },
    { enabled: Boolean(contactId) }
  );

  if (profileQuery.isLoading) {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm" style={{ color: 'var(--m-muted)' }}>
        Loading…
      </div>
    );
  }

  if (!profileQuery.data) {
    return (
      <div className="flex min-h-40 items-center justify-center text-sm" style={{ color: 'var(--m-muted)' }}>
        Contact not found.
      </div>
    );
  }

  const { contact, customer, vendor } = profileQuery.data as {
    contact: Record<string, unknown>;
    customer: Record<string, unknown> | null;
    vendor: Record<string, unknown> | null;
    referee: Record<string, unknown> | null;
    processor: Record<string, unknown> | null;
    user: Record<string, unknown> | null;
    upcomingAppointmentCount: number;
  };

  const c = contact as Record<string, unknown>;
  const roles = ROLE_FLAGS.filter(r => Boolean(c[r.key]));
  const commands = (commandsQuery.data ?? []) as Array<Record<string, unknown>>;
  const hasFinancials = Boolean(c.is_customer || c.is_vendor);

  return (
    <div className="pb-8">
      {/* Back */}
      <div className="flex items-center gap-2 px-4 pt-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: 'var(--m-panel)', color: 'var(--m-accent)' }}
          aria-label="Go back"
        >
          ←
        </button>
        <span className="text-xs" style={{ color: 'var(--m-muted-2)' }}>Back</span>
      </div>

      {/* Header card */}
      <div className="mx-4 mt-3 m-card p-4">
        <p className="text-xl font-bold" style={{ color: 'var(--m-ink)' }}>
          {String(c.name ?? '')}
        </p>
        {c.display_name && c.display_name !== c.name && (
          <p className="text-sm" style={{ color: 'var(--m-muted-2)' }}>{String(c.display_name)}</p>
        )}
        {c.company_name && (
          <p className="text-sm" style={{ color: 'var(--m-muted)' }}>{String(c.company_name)}</p>
        )}
        {roles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {roles.map(r => (
              <span key={r.label} className="m-badge m-badge-neutral">{r.label}</span>
            ))}
          </div>
        )}
      </div>

      {/* Contact facts */}
      <SectionLabel>Contact</SectionLabel>
      <div className="mx-4 m-card p-4">
        <div className="grid grid-cols-2 gap-y-3 text-sm">
          {c.phone ? (
            <div>
              <p className="text-xs font-semibold uppercase" style={{ color: 'var(--m-muted-2)', fontSize: 10, letterSpacing: '0.06em' }}>Phone</p>
              <p style={{ color: 'var(--m-ink)' }}>{String(c.phone)}</p>
            </div>
          ) : null}
          {c.email ? (
            <div>
              <p className="text-xs font-semibold uppercase" style={{ color: 'var(--m-muted-2)', fontSize: 10, letterSpacing: '0.06em' }}>Email</p>
              <p style={{ color: 'var(--m-ink)' }}>{String(c.email)}</p>
            </div>
          ) : null}
          {c.address ? (
            <div className="col-span-2">
              <p className="text-xs font-semibold uppercase" style={{ color: 'var(--m-muted-2)', fontSize: 10, letterSpacing: '0.06em' }}>Address</p>
              <p style={{ color: 'var(--m-ink)' }}>{String(c.address)}</p>
            </div>
          ) : null}
        </div>
        {c.notes && (
          <p className="mt-3 text-xs italic" style={{ color: 'var(--m-muted)' }}>{String(c.notes)}</p>
        )}
      </div>

      {/* Balance section — shown only for customers and vendors */}
      {hasFinancials && (
        <>
          <SectionLabel>Financials</SectionLabel>
          <div className="mx-4 m-card p-4">
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              {customer && (
                <>
                  <div>
                    <p className="text-xs font-semibold uppercase" style={{ color: 'var(--m-muted-2)', fontSize: 10, letterSpacing: '0.06em' }}>Balance</p>
                    <p style={{ color: 'var(--m-accent)' }}>{formatMoney(customer.balance as number)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase" style={{ color: 'var(--m-muted-2)', fontSize: 10, letterSpacing: '0.06em' }}>Credit Limit</p>
                    <p style={{ color: 'var(--m-ink)' }}>{formatMoney(customer.credit_limit as number)}</p>
                  </div>
                </>
              )}
              {vendor && Number((vendor as Record<string, unknown>).open_bills_amount ?? 0) > 0 && (
                <div className="col-span-2">
                  <p className="text-xs font-semibold uppercase" style={{ color: 'var(--m-muted-2)', fontSize: 10, letterSpacing: '0.06em' }}>Open Bills</p>
                  <p style={{ color: 'var(--m-amber)' }}>{formatMoney((vendor as Record<string, unknown>).open_bills_amount as number)}</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* History */}
      <SectionLabel>History</SectionLabel>
      {commands.length === 0 ? (
        <div className="mx-4">
          <MobileEmptyState icon="📋" headline="No history yet" />
        </div>
      ) : (
        <div className="mx-4 m-card overflow-hidden p-0">
          {commands.slice(0, 10).map((cmd, i) => (
            <div
              key={String(cmd.id)}
              className="flex flex-col gap-0.5 px-4 py-3"
              style={{ borderBottom: i < commands.slice(0, 10).length - 1 ? '1px solid var(--m-line)' : 'none' }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium" style={{ color: 'var(--m-ink)' }}>
                  {String(cmd.commandName ?? '—')}
                </p>
                <p className="shrink-0 text-xs" style={{ color: 'var(--m-muted-2)' }}>
                  {new Date(String(cmd.createdAt)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
              <p className="text-xs" style={{ color: 'var(--m-muted-2)' }}>
                {String(cmd.actorName ?? '—')}
              </p>
              {cmd.toast && (
                <p className="text-xs" style={{ color: 'var(--m-muted)' }}>{String(cmd.toast)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
