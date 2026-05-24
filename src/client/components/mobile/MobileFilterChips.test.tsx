// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileFilterChips } from './MobileFilterChips';

const OPTIONS = ['All', 'Ready', 'Low Stock', 'Needs Review'];

describe('MobileFilterChips', () => {
  it('renders all options', () => {
    render(<MobileFilterChips options={OPTIONS} value="All" onChange={() => {}} />);
    OPTIONS.forEach(opt => expect(screen.getByRole('button', { name: opt })).toBeInTheDocument());
  });

  it('marks the active option with aria-pressed true', () => {
    render(<MobileFilterChips options={OPTIONS} value="Ready" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Ready' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the clicked option value', () => {
    const onChange = vi.fn();
    render(<MobileFilterChips options={OPTIONS} value="All" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Low Stock' }));
    expect(onChange).toHaveBeenCalledWith('Low Stock');
  });

  it('does not call onChange when the active option is clicked again', () => {
    const onChange = vi.fn();
    render(<MobileFilterChips options={OPTIONS} value="All" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
