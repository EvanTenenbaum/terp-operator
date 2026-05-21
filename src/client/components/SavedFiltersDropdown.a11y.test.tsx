// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SavedFiltersDropdown } from './SavedFiltersDropdown';

describe('SavedFiltersDropdown accessibility (#34)', () => {
  it('the saved-filter <select> has an accessible name', () => {
    const { container } = render(
      <SavedFiltersDropdown savedFilters={[]} selectedId={null} onSelect={() => {}} />
    );
    const select = container.querySelector('select');
    expect(select).not.toBeNull();

    const ariaLabel = select?.getAttribute('aria-label')?.trim();
    const ariaLabelledBy = select?.getAttribute('aria-labelledby')?.trim();
    const wrappingLabel = select?.closest('label');
    const wrappingLabelText = wrappingLabel ? (wrappingLabel.textContent ?? '').trim() : '';
    const id = select?.getAttribute('id');
    const linkedLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    const linkedLabelText = linkedLabel ? (linkedLabel.textContent ?? '').trim() : '';

    const hasAccessibleName = Boolean(
      ariaLabel || ariaLabelledBy || wrappingLabelText || linkedLabelText
    );
    expect(
      hasAccessibleName,
      `SavedFiltersDropdown <select> is missing an accessible name. The placeholder option is not a substitute. outerHTML=${select?.outerHTML}`
    ).toBe(true);
  });
});
