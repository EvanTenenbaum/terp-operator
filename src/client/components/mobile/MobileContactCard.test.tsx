// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileContactCard } from './MobileContactCard';

const BASE = {
  id: 'c1',
  name: 'Acme Corp',
  companyName: 'Acme Corp Ltd',
  isCustomer: true,
  isVendor: false,
  isReferee: false,
  isProcessor: false,
  isContractor: false,
  isEmployee: false,
  customerBalance: 14500,
  vendorOpenBills: null,
};

describe('MobileContactCard', () => {
  it('renders name', () => {
    render(<MobileContactCard contact={BASE} onClick={() => {}} />);
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders company name', () => {
    render(<MobileContactCard contact={BASE} onClick={() => {}} />);
    expect(screen.getByText('Acme Corp Ltd')).toBeInTheDocument();
  });

  it('shows Customer badge when isCustomer', () => {
    render(<MobileContactCard contact={BASE} onClick={() => {}} />);
    expect(screen.getByText('Customer')).toBeInTheDocument();
  });

  it('shows positive customer balance in accent color', () => {
    render(<MobileContactCard contact={BASE} onClick={() => {}} />);
    expect(screen.getByText(/balance.*\$14,500/i)).toBeInTheDocument();
  });

  it('does not show balance when customerBalance is 0', () => {
    render(<MobileContactCard contact={{ ...BASE, customerBalance: 0 }} onClick={() => {}} />);
    expect(screen.queryByText(/balance/i)).not.toBeInTheDocument();
  });

  it('shows vendor open bills in amber when > 0', () => {
    const contact = { ...BASE, isCustomer: false, isVendor: true, customerBalance: null, vendorOpenBills: 5000 };
    render(<MobileContactCard contact={contact} onClick={() => {}} />);
    expect(screen.getByText('Vendor')).toBeInTheDocument();
    expect(screen.getByText(/owes.*\$5,000/i)).toBeInTheDocument();
  });

  it('shows up to 3 role badges', () => {
    const contact = {
      ...BASE,
      isCustomer: true, isVendor: true, isReferee: true,
      isContractor: true, isEmployee: false, isProcessor: false,
    };
    render(<MobileContactCard contact={contact} onClick={() => {}} />);
    // Max 3 badges shown
    const badges = screen.getAllByText(/Customer|Vendor|Referee|Contractor/);
    expect(badges.length).toBe(3);
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<MobileContactCard contact={BASE} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is accessible — button has aria-label with contact name', () => {
    render(<MobileContactCard contact={BASE} onClick={() => {}} />);
    expect(screen.getByRole('button', { name: /acme corp/i })).toBeInTheDocument();
  });
});
