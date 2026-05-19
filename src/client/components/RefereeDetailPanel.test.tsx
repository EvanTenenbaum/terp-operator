// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('./RefereeRelationshipsList', () => ({
  RefereeRelationshipsList: () => <div data-testid="relationships-list" />
}));
vi.mock('./RefereeCreditsList', () => ({
  RefereeCreditsList: () => <div data-testid="credits-list" />
}));

import { RefereeDetailPanel } from './RefereeDetailPanel';

describe('RefereeDetailPanel', () => {
  it('renders the referee name in the header', () => {
    render(
      <RefereeDetailPanel refereeId="ref-1" refereeName="Jane Doe" onClose={() => {}} />
    );
    expect(screen.getByRole('heading', { name: 'Jane Doe' })).toBeInTheDocument();
  });

  it('defaults to the Relationships tab', () => {
    render(
      <RefereeDetailPanel refereeId="ref-1" refereeName="Jane Doe" onClose={() => {}} />
    );
    expect(screen.getByTestId('relationships-list')).toBeInTheDocument();
    expect(screen.queryByTestId('credits-list')).not.toBeInTheDocument();
    const relationshipsTab = screen.getByRole('tab', { name: /relationships/i });
    expect(relationshipsTab).toHaveAttribute('aria-selected', 'true');
  });

  it('switches to Credits tab when Credits is clicked', async () => {
    const user = userEvent.setup();
    render(
      <RefereeDetailPanel refereeId="ref-1" refereeName="Jane Doe" onClose={() => {}} />
    );
    await user.click(screen.getByRole('tab', { name: /credits/i }));
    expect(screen.getByTestId('credits-list')).toBeInTheDocument();
    expect(screen.queryByTestId('relationships-list')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /credits/i })).toHaveAttribute('aria-selected', 'true');
  });
});
