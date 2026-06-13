// @vitest-environment jsdom
/**
 * UX-A06 / BE-014 / TER-1591 DEFERRED
 *
 * The contact deduplication detection job has not shipped, so
 * contact_merge_candidates is never populated and mergeCandidateCount is
 * permanently zero.  Per Execution Decision 5 the query and the merge-
 * candidates banner were removed from ContactsView.  These tests assert
 * that the dead query is gone and the banner can never appear.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock react-router-dom navigate
const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

// Mock trpc — intentionally do NOT expose mergeCandidateCount so any
// accidental call to it would throw and catch the regression.
vi.mock('../api/trpc', () => ({
  trpc: {
    auth: {
      me: {
        useQuery: vi.fn(() => ({ data: { role: 'writer' }, isLoading: false })),
      },
    },
    queries: {
      contactDirectory: {
        useQuery: vi.fn(),
      },
      // mergeCandidateCount is intentionally absent; calling it would throw.
    },
  },
}));

import { trpc } from '../api/trpc';
import { ContactsView } from './ContactsView';

const mockDir = (trpc.queries.contactDirectory.useQuery as ReturnType<typeof vi.fn>);

const CONTACTS = [
  {
    id: 'c1',
    name: 'Acme Corp',
    companyName: 'Acme Corp Ltd',
    isCustomer: true,
    isVendor: false,
    isReferee: false,
    isContractor: false,
    isEmployee: false,
    isProcessor: false,
    phone: null,
    email: 'acme@example.com',
    customerBalance: 5000,
  },
];

beforeEach(() => {
  navigateMock.mockClear();
  mockDir.mockReturnValue({
    data: { rows: CONTACTS },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
});

function renderView() {
  return render(
    <MemoryRouter>
      <ContactsView />
    </MemoryRouter>,
  );
}

describe('ContactsView — UX-A06 merge-banner deferral (BE-014 / TER-1591)', () => {
  it('does not call mergeCandidateCount query (dead query removed)', () => {
    // If the component still called trpc.queries.mergeCandidateCount.useQuery()
    // it would throw because that key is not present in the mock, which means
    // this test would fail — catching the regression automatically.
    expect(() => renderView()).not.toThrow();
  });

  it('does not render a merge-candidates banner or button', () => {
    renderView();
    expect(screen.queryByText(/merge candidate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/possible duplicate/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review merge/i })).not.toBeInTheDocument();
  });

  it('does not render a link to /contacts/merge-candidates', () => {
    renderView();
    // The route is redirected at the App level and the banner button is gone;
    // no element in ContactsView should navigate to the deferred surface.
    expect(screen.queryByRole('button', { name: /merge candidate/i })).not.toBeInTheDocument();
  });

  it('still renders the main Contacts h1 heading', () => {
    renderView();
    // There are two headings: h1 "Contacts" and h2 "All Contacts" (OperatorGrid title).
    // Use getAllByRole to tolerate both and confirm at least one matches "Contacts".
    const headings = screen.getAllByRole('heading', { name: /contacts/i });
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(headings.some((h) => h.tagName === 'H1')).toBe(true);
  });

  it('still renders role filter chips', () => {
    renderView();
    expect(screen.getByRole('button', { name: /customer/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /vendor/i })).toBeInTheDocument();
  });

  it('still renders the New Contact button', () => {
    renderView();
    expect(screen.getByRole('button', { name: /new contact/i })).toBeInTheDocument();
  });
});
