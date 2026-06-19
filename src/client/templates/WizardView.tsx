/**
 * WizardView — step-through wizard template.
 *
 * Provides a guided multi-step workflow with a step indicator bar,
 * step content area, and prev/next/finish navigation. Designed for
 * PickView and similar guided workflows.
 *
 * Each step declares its own `canAdvance` guard. The "Next" button is
 * disabled until the guard returns true. The "Finish" button on the
 * last step calls `onFinish`.
 */

import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { type ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WizardStep {
  /** Unique key for the step. */
  key: string;
  /** Short label shown in the step indicator bar. */
  label: string;
  /** Optional longer description shown in the step content header. */
  description?: string;
  /** Step content renderer. */
  render: () => ReactNode;
  /** When provided, "Next"/"Finish" is disabled until this returns true.
   *  Not called on the first step (no "previous" navigation guard). */
  canAdvance?: () => boolean;
}

export interface WizardViewProps {
  /** View key for data attributes. */
  viewKey: string;
  /** Steps in display order. Must have at least one step. */
  steps: WizardStep[];
  /** Currently active step key. */
  activeStep: string;
  /** Called when the user clicks a step indicator or uses prev/next. */
  onStepChange: (key: string) => void;
  /** Called when the user clicks "Finish" on the last step. */
  onFinish?: () => void;
  /** When true, shows a loading overlay over the step content. */
  loading?: boolean;
  /** Optional header content rendered above the step indicator bar. */
  headerSlot?: ReactNode;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stepIndex(steps: WizardStep[], activeStep: string): number {
  return steps.findIndex((s) => s.key === activeStep);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WizardView({
  viewKey,
  steps,
  activeStep,
  onStepChange,
  onFinish,
  loading = false,
  headerSlot,
}: WizardViewProps): ReactNode {
  const currentIdx = stepIndex(steps, activeStep);
  const currentStep = steps[currentIdx] as WizardStep | undefined;
  const isFirst = currentIdx <= 0;
  const isLast = currentIdx >= steps.length - 1;

  const canAdvance = currentStep?.canAdvance ? currentStep.canAdvance() : true;

  function goTo(idx: number) {
    const target = steps[idx];
    if (target) onStepChange(target.key);
  }

  return (
    <div className="view-stack" data-view-key={viewKey} data-testid={`wizard-view-${viewKey}`}>
      {/* ── Header slot ────────────────────────────────────────────────────── */}
      {headerSlot}

      {/* ── Step indicator bar ─────────────────────────────────────────────── */}
      <nav
        className="flex items-center gap-1 overflow-x-auto"
        aria-label="Wizard steps"
        role="tablist"
      >
        {steps.map((step, idx) => {
          const isActive = step.key === activeStep;
          const isCompleted = idx < currentIdx;

          return (
            <button
              key={step.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-current={isActive ? 'step' : undefined}
              className={[
                'flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:shadow-focus',
                isActive
                  ? 'bg-accent text-white'
                  : isCompleted
                    ? 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                    : 'bg-zinc-50 text-zinc-400',
              ].join(' ')}
              onClick={() => goTo(idx)}
            >
              {isCompleted ? (
                <Check className="h-3.5 w-3.5 flex-shrink-0 text-green-600" aria-hidden="true" />
              ) : (
                <span
                  className={[
                    'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs',
                    isActive ? 'bg-white text-accent' : 'bg-zinc-200 text-zinc-500',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  {idx + 1}
                </span>
              )}
              <span className="truncate">{step.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Step content ───────────────────────────────────────────────────── */}
      <div className="inline-panel" role="tabpanel" aria-label={currentStep?.label ?? 'Step content'}>
        {currentStep?.description ? (
          <p className="mb-3 text-sm text-zinc-600">{currentStep.description}</p>
        ) : null}
        <div className="relative">
          {currentStep?.render()}
          {loading ? (
            <div
              className="absolute inset-0 flex items-center justify-center bg-white/70"
              role="status"
              aria-busy="true"
              aria-label="Loading"
            >
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Navigation ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="secondary-button"
          disabled={isFirst}
          onClick={() => goTo(currentIdx - 1)}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Previous
        </button>

        <span className="text-sm text-zinc-500">
          Step {currentIdx + 1} of {steps.length}
        </span>

        {isLast ? (
          <button
            type="button"
            className="primary-button"
            disabled={!canAdvance || loading}
            onClick={onFinish}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            Finish
          </button>
        ) : (
          <button
            type="button"
            className="primary-button"
            disabled={!canAdvance || loading}
            onClick={() => goTo(currentIdx + 1)}
          >
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
