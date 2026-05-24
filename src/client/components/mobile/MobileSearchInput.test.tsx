// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileSearchInput } from './MobileSearchInput';

describe('MobileSearchInput', () => {
  it('renders with placeholder', () => {
    render(<MobileSearchInput value="" onChange={() => {}} placeholder="Search items…" />);
    expect(screen.getByPlaceholderText('Search items…')).toBeInTheDocument();
  });

  it('calls onChange when user types', () => {
    const onChange = vi.fn();
    render(<MobileSearchInput value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Blue' } });
    expect(onChange).toHaveBeenCalledWith('Blue');
  });

  it('shows clear button only when value is non-empty', () => {
    const { rerender } = render(<MobileSearchInput value="" onChange={() => {}} />);
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
    rerender(<MobileSearchInput value="Blue" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('calls onChange with empty string when clear button clicked', () => {
    const onChange = vi.fn();
    render(<MobileSearchInput value="Blue Dream" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
