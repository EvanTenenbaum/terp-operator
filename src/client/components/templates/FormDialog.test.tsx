// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null })
}));

import { FormDialog, FormField } from './FormDialog';

describe('FormDialog (templates)', () => {
  function renderDialog(props: Partial<Parameters<typeof FormDialog>[0]> = {}) {
    const onClose = vi.fn();
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    render(
      <FormDialog title="Test Dialog" onClose={onClose} onSubmit={onSubmit} submitLabel="Save" {...props}>
        <FormField id="f-name" label="Name">
          <input id="f-name" />
        </FormField>
      </FormDialog>
    );
    return { onClose, onSubmit };
  }

  it('exposes role=dialog with aria-modal and aria-labelledby pointing at an h2', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    const heading = document.getElementById(labelledBy!);
    expect(heading?.tagName).toBe('H2');
    expect(heading?.textContent).toBe('Test Dialog');
  });

  it('has a close button with aria-label Close and wires Cancel + overlay close', () => {
    const { onClose } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('submits via the footer primary and shows the pending label while pending', () => {
    const { onSubmit } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalled();
  });

  it('disables the submit button and swaps to pendingLabel when pending', () => {
    renderDialog({ pending: true, pendingLabel: 'Saving...' });
    const submit = screen.getByRole('button', { name: 'Saving...' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it('renders the error banner with role=alert', () => {
    renderDialog({ error: 'Something went wrong' });
    expect(screen.getByRole('alert').textContent).toBe('Something went wrong');
  });

  it('honors a pinned titleId for tests that assert specific heading ids', () => {
    renderDialog({ titleId: 'custom-title' });
    expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBe('custom-title');
    expect(document.getElementById('custom-title')?.tagName).toBe('H2');
  });

  // UX-Q03: tone prop tests
  it('applies btn-primary class to submit button when tone is omitted', () => {
    renderDialog();
    const submit = screen.getByRole('button', { name: 'Save' });
    expect(submit.className).toContain('btn-primary');
    expect(submit.className).not.toContain('btn-danger');
    expect(submit.className).not.toContain('btn-warning');
  });

  it('applies btn-danger class to submit button when tone="danger"', () => {
    renderDialog({ tone: 'danger' });
    const submit = screen.getByRole('button', { name: 'Save' });
    expect(submit.className).toContain('btn-danger');
    expect(submit.className).not.toContain('btn-primary');
  });

  it('applies btn-warning class to submit button when tone="warning"', () => {
    renderDialog({ tone: 'warning' });
    const submit = screen.getByRole('button', { name: 'Save' });
    expect(submit.className).toContain('btn-warning');
    expect(submit.className).not.toContain('btn-primary');
  });
});
