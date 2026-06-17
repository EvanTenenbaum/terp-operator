import { useState } from 'react';
import { GridView } from '../templates/GridView';
import { ContactCreateModal } from '../components/ContactCreateModal';

const ROLE_FILTERS = ['customer', 'vendor', 'referee', 'contractor', 'employee', 'processor'] as const;
type RoleFilter = (typeof ROLE_FILTERS)[number];

export function ContactsView() {
  const [roleFilter, setRoleFilter] = useState<RoleFilter[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  // BE-014 / TER-1591 DEFERRED: The contact deduplication detection job that
  // populates contact_merge_candidates has not shipped yet.  Nothing ever
  // inserts rows into that table, so mergeCandidateCount is permanently zero
  // and can never surface a real signal.  Querying it wastes a round-trip and
  // would produce a live-looking (but permanently-inactive) badge if the gate
  // were ever relaxed.  Remove the query entirely until the detection job
  // ships; see UX-A06 / Execution Decision 5.  When BE-014 lands, restore this
  // query and the banner below, and remove the route redirect in App.tsx.

  // Preserved refs to keep TS happy with unused but required-preserved state:
  void roleFilter;
  void searchQuery;

  return (
    <div className="h-full flex flex-col">
      {/* BE-014 / TER-1591 DEFERRED: merge-candidates banner removed.
          The detection job that populates contact_merge_candidates has not
          shipped; restore this banner when BE-014 lands.  See UX-A06. */}

      <GridView viewKey="contacts" entityType="customer" />

      {showCreate && <ContactCreateModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
