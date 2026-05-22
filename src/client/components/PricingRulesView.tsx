import React, { useState } from 'react';
import { trpc } from '../api/trpc';
import { useCommandRunner } from './useCommandRunner';
import { PricingRuleChainEditor } from './PricingRuleChainEditor';
import type { PricingRuleClauseInput } from './PricingRuleClauseCard';

export function PricingRulesView() {
  const me = trpc.auth.me.useQuery();
  const isManagerOrOwner = me.data?.role === 'manager' || me.data?.role === 'owner';
  const readOnly = me.data ? !isManagerOrOwner : false;

  const summary = trpc.queries.pricingRulesSummary.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [dirtyCustomerId, setDirtyCustomerId] = useState<string | null>(null);
  const { runCommand, isRunning } = useCommandRunner();

  const globalClauses = summary.data?.global ?? [];
  const globalFingerprint = summary.data?.chainFingerprint ?? '0:';

  // Lazy-load customer clauses (plus their chain fingerprint) only when expanded
  const customerData = trpc.queries.pricingRuleClauses.useQuery(
    { scope: 'customer', customerId: expandedCustomerId ?? '' },
    {
      enabled: Boolean(expandedCustomerId),
      refetchOnWindowFocus: false,
    }
  );
  const customerClauses = customerData.data?.clauses ?? [];
  const customerFingerprint = customerData.data?.chainFingerprint ?? '0:';

  const filteredCustomers = (summary.data?.customers ?? []).filter((c) =>
    !search.trim() ||
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  async function saveGlobal(clauses: PricingRuleClauseInput[], fingerprint: string) {
    await runCommand(
      'savePricingRuleChain',
      { scope: 'global', clauses, chainFingerprint: fingerprint },
      'Save global pricing rules'
    );
    await summary.refetch();
  }

  async function saveCustomer(clauses: PricingRuleClauseInput[], fingerprint: string) {
    if (!expandedCustomerId) return;
    await runCommand(
      'savePricingRuleChain',
      {
        scope: 'customer',
        customerId: expandedCustomerId,
        clauses,
        chainFingerprint: fingerprint,
      },
      'Save customer pricing rules'
    );
    setDirtyCustomerId(null);
    await summary.refetch();
    await customerData.refetch();
  }

  async function clearCustomer(customerId: string, customerName: string) {
    if (
      !confirm(
        `Remove all custom rules for ${customerName}? They'll use global defaults.`
      )
    ) {
      return;
    }
    // Use the live customer chain fingerprint — otherwise the optimistic
    // concurrency check rejects the clear (length-only fingerprints never match
    // the server's `length:id:ts|...` format for non-empty chains). The Clear
    // button is only rendered when the editor row is expanded, so the
    // fingerprint is already loaded into `customerData`.
    const fingerprint =
      expandedCustomerId === customerId
        ? customerFingerprint
        : '0:';
    await runCommand(
      'savePricingRuleChain',
      {
        scope: 'customer',
        customerId,
        clauses: [],
        chainFingerprint: fingerprint,
      },
      'Clear customer pricing rules'
    );
    if (expandedCustomerId === customerId) {
      setExpandedCustomerId(null);
    }
    setDirtyCustomerId(null);
    await summary.refetch();
  }

  function tryExpand(customerId: string) {
    if (dirtyCustomerId && dirtyCustomerId !== customerId) {
      if (
        !confirm('You have unsaved changes. Discard and open a different customer?')
      ) {
        return;
      }
      setDirtyCustomerId(null);
    }
    setExpandedCustomerId((prev) => (prev === customerId ? null : customerId));
  }

  if (summary.isLoading) {
    return (
      <div className="view-stack">
        <p className="text-sm text-zinc-500">Loading pricing rules…</p>
      </div>
    );
  }

  if (summary.isError) {
    return (
      <div className="view-stack">
        <p className="text-sm text-red-600">
          Couldn't load pricing rules. Try refreshing.
        </p>
      </div>
    );
  }

  return (
    <div className="view-stack" data-testid="pricing-rules-view">
      <div>
        <h2 className="page-title">Pricing Rules</h2>
        <p className="page-subtitle">
          Markup rules applied at order pricing time. Global rules apply to all
          customers; customer rules override globals for that customer.
        </p>
      </div>

      {/* Global defaults section */}
      <section className="inline-panel" data-testid="global-rules-section">
        <h3 className="section-title">Global defaults</h3>
        <p className="text-xs text-zinc-600 mb-3">
          Applied when a customer has no matching custom rule. The catch-all (last
          rule) is always required.
          {readOnly && (
            <span className="ml-1 text-zinc-400" data-testid="pricing-readonly-note">
              Read-only — only managers can edit.
            </span>
          )}
        </p>
        <PricingRuleChainEditor
          scope="global"
          clauses={globalClauses}
          chainFingerprint={globalFingerprint}
          isRunning={isRunning}
          onSave={saveGlobal}
          readOnly={readOnly}
        />
      </section>

      {/* Customer overrides section */}
      <section className="inline-panel" data-testid="customer-overrides-section">
        <h3 className="section-title">Customer overrides</h3>
        <label className="finder-search mb-2 block">
          <input
            type="text"
            placeholder="Search customers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full"
            aria-label="Search customers by name"
          />
        </label>

        <div className="finder-table-wrap">
          <table className="finder-table" data-testid="customer-overrides-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Rules</th>
                <th>Last updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="text-sm text-zinc-500 py-4 text-center"
                  >
                    No customers found.
                  </td>
                </tr>
              )}
              {filteredCustomers.map((customer) => {
                const isExpanded = expandedCustomerId === customer.id;
                return (
                  <React.Fragment key={customer.id}>
                    <tr
                      className="cursor-pointer hover:bg-zinc-50"
                      onClick={() => tryExpand(customer.id)}
                      data-testid={`customer-row-${customer.id}`}
                    >
                      <td className="font-medium">{customer.name}</td>
                      <td>
                        {customer.hasCustomRules ? (
                          <span className="finder-chip success">
                            {customer.clauseCount} rule
                            {customer.clauseCount !== 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="finder-chip">uses global</span>
                        )}
                      </td>
                      <td className="text-xs text-zinc-500">
                        {customer.lastUpdated
                          ? new Date(customer.lastUpdated).toLocaleDateString()
                          : '—'}
                      </td>
                      <td className="text-xs text-zinc-400">
                        {isExpanded ? '▾' : '▸'}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td
                          colSpan={4}
                          className="p-3 bg-zinc-50 border-t border-line"
                          data-testid={`customer-editor-${customer.id}`}
                        >
                          {customerData.isLoading ? (
                            <p className="text-sm text-zinc-500">
                              Loading rules…
                            </p>
                          ) : (
                            <>
                              <PricingRuleChainEditor
                                scope="customer"
                                customerId={customer.id}
                                clauses={customerClauses}
                                chainFingerprint={customerFingerprint}
                                isRunning={isRunning}
                                onSave={saveCustomer}
                                compact
                                readOnly={readOnly}
                              />
                              {customer.hasCustomRules && !readOnly && (
                                <button
                                  type="button"
                                  className="text-button text-red-600 mt-2 text-xs"
                                  onClick={() =>
                                    clearCustomer(customer.id, customer.name)
                                  }
                                  disabled={isRunning}
                                  data-testid={`clear-rules-${customer.id}`}
                                >
                                  Clear custom rules → use global defaults
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
