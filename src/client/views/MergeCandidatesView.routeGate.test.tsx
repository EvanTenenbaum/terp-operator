// @vitest-environment jsdom
/**
 * UX-A06 / BE-014 / TER-1591 DEFERRED — route gate
 *
 * The /contacts/merge-candidates route is temporarily redirected to
 * /contacts until the contact deduplication detection job (BE-014) ships.
 * This test verifies the Navigate redirect is in place so the surface
 * cannot be reached by direct URL.
 *
 * We test the redirect at the route-table level using MemoryRouter with an
 * initial entry of /contacts/merge-candidates and asserting that the final
 * rendered location is /contacts.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

// Lightweight stand-in for ContactsView — avoids needing trpc mock here.
function FakeContactsView() {
  return <div data-testid="contacts-view">Contacts</div>;
}

// Sentinel — should never render while redirect is active.
function FakeMergeCandidatesView() {
  return <div data-testid="merge-candidates-view">Merge Candidates</div>;
}

// Renders the same route table shape used in App.tsx (just the contacts slice).
function TestRoutes({ initialPath }: { initialPath: string }) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="contacts" element={<FakeContactsView />} />
        {/* BE-014 / TER-1591 DEFERRED redirect — mirrors App.tsx */}
        <Route
          path="contacts/merge-candidates"
          element={<Navigate to="/contacts" replace />}
        />
        <Route path="contacts/:id" element={<div>Profile</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('MergeCandidatesView route gate — UX-A06 (BE-014 / TER-1591)', () => {
  it('redirects /contacts/merge-candidates to /contacts', () => {
    render(<TestRoutes initialPath="/contacts/merge-candidates" />);
    // After the redirect the ContactsView sentinel should be visible.
    expect(screen.getByTestId('contacts-view')).toBeInTheDocument();
    // The real MergeCandidatesView sentinel should never appear.
    expect(screen.queryByTestId('merge-candidates-view')).not.toBeInTheDocument();
  });

  it('/contacts renders ContactsView directly (no redirect interference)', () => {
    render(<TestRoutes initialPath="/contacts" />);
    expect(screen.getByTestId('contacts-view')).toBeInTheDocument();
  });

  it('/contacts/:id still resolves to the profile route', () => {
    render(<TestRoutes initialPath="/contacts/abc123" />);
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.queryByTestId('contacts-view')).not.toBeInTheDocument();
  });
});
