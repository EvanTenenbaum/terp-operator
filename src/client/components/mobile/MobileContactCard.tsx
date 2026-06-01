interface Contact {
  id: string;
  name: string;
  displayName?: string | null;
  companyName?: string | null;
  isCustomer: boolean;
  isVendor: boolean;
  isReferee: boolean;
  isProcessor: boolean;
  isContractor: boolean;
  isEmployee: boolean;
  customerBalance?: number | null;
  vendorOpenBills?: number | null;
}

interface MobileContactCardProps {
  contact: Contact;
  onClick: () => void;
}

const ROLE_PRIORITY: Array<{ key: keyof Contact; label: string }> = [
  { key: 'isCustomer',   label: 'Customer'   },
  { key: 'isVendor',     label: 'Vendor'     },
  { key: 'isReferee',    label: 'Referee'    },
  { key: 'isContractor', label: 'Contractor' },
  { key: 'isEmployee',   label: 'Employee'   },
  { key: 'isProcessor',  label: 'Processor'  },
];

function formatMoney(n: number): string {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function MobileContactCard({ contact, onClick }: MobileContactCardProps) {
  const roles = ROLE_PRIORITY.filter(r => contact[r.key]).slice(0, 3);
  const customerBalance = Number(contact.customerBalance ?? 0);
  const vendorOpenBills = Number(contact.vendorOpenBills ?? 0);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={contact.name}
      className="flex w-full min-h-[64px] flex-col gap-1 py-4 text-left"
    >
      {/* Top row: name + role badges */}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold" style={{ color: 'var(--m-ink)' }}>
          {contact.name}
        </span>
        <div className="flex shrink-0 gap-1">
          {roles.map(r => (
            <span key={r.label} className="m-badge m-badge-neutral">{r.label}</span>
          ))}
        </div>
      </div>

      {/* Middle row: company + balance */}
      <div className="flex items-center justify-between text-xs gap-2" style={{ color: 'var(--m-muted-2)' }}>
        <span className="truncate">{contact.companyName ?? ''}</span>
        <span className="shrink-0">
          {customerBalance > 0 && (
            <span style={{ color: 'var(--m-accent)' }}>
              Balance: {formatMoney(customerBalance)}
            </span>
          )}
          {vendorOpenBills > 0 && (
            <span style={{ color: 'var(--m-amber)' }}>
              Owes: {formatMoney(vendorOpenBills)}
            </span>
          )}
        </span>
      </div>
    </button>
  );
}
