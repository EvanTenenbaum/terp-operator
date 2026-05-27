import React, { useState } from 'react';
import { Filter } from 'lucide-react';
import { FilterCondition, FilterFieldName, FilterGroupInput, FILTER_FIELDS } from '../../shared/filterSchemas';
import { trpc } from '../api/trpc';

interface AdvancedFilterBuilderProps {
  filter: FilterGroupInput;
  onChange: (filter: FilterGroupInput) => void;
  targetView?: string;
  /** Called when the user clicks "Save as view" inside the builder. */
  onSaveAsView?: () => void;
  /** Current result count shown in the builder footer. */
  resultCount?: number;
}

export function AdvancedFilterBuilder({ filter, onChange, targetView = 'inventory', onSaveAsView, resultCount }: AdvancedFilterBuilderProps) {
  const { data: facets } = trpc.filters.getFacets.useQuery();

  const addCondition = (groupPath: number[]) => {
    const newFilter = structuredClone(filter);
    const group = getGroupAtPath(newFilter, groupPath);

    group.conditions.push({
      field: 'category',
      operator: 'equals',
      value: ''
    });

    onChange(newFilter);
  };

  const addGroup = (groupPath: number[]) => {
    const newFilter = structuredClone(filter);
    const group = getGroupAtPath(newFilter, groupPath);

    group.conditions.push({
      logic: 'AND',
      conditions: []
    });

    onChange(newFilter);
  };

  const removeCondition = (groupPath: number[], conditionIndex: number) => {
    const newFilter = structuredClone(filter);
    const group = getGroupAtPath(newFilter, groupPath);

    group.conditions.splice(conditionIndex, 1);

    // Remove empty groups
    if (group.conditions.length === 0 && groupPath.length > 0) {
      const parentGroup = getGroupAtPath(newFilter, groupPath.slice(0, -1));
      parentGroup.conditions.splice(groupPath[groupPath.length - 1], 1);
    }

    onChange(newFilter);
  };

  const updateCondition = (groupPath: number[], conditionIndex: number, updates: any) => {
    const newFilter = structuredClone(filter);
    const group = getGroupAtPath(newFilter, groupPath);

    group.conditions[conditionIndex] = {
      ...group.conditions[conditionIndex],
      ...updates
    };

    onChange(newFilter);
  };

  const toggleLogic = (groupPath: number[]) => {
    const newFilter = structuredClone(filter);
    const group = getGroupAtPath(newFilter, groupPath);

    group.logic = group.logic === 'AND' ? 'OR' : 'AND';

    onChange(newFilter);
  };

  return (
    <div className="builder-panel" data-testid="advanced-filter-builder">
      <div className="builder-panel-header">
        <div className="builder-panel-title">
          <Filter className="h-3.5 w-3.5" aria-hidden="true" />
          Advanced filters — match
          <button
            type="button"
            className={`logic-badge${filter.logic === 'OR' ? ' or' : ''}`}
            onClick={() => onChange({ ...filter, logic: filter.logic === 'AND' ? 'OR' : 'AND' })}
            data-testid="filter-logic-toggle"
            aria-label={`Toggle logic operator (currently ${filter.logic})`}
          >
            {filter.logic}
          </button>
          of all conditions
        </div>
        <button
          type="button"
          className="secondary-button compact-action ml-auto"
          onClick={() => onChange({ logic: 'AND', conditions: [] })}
        >
          ✕ Close builder
        </button>
      </div>

      <div className="builder-panel-body">
        <FilterGroupComponent
          group={filter}
          groupPath={[]}
          facets={facets}
          onAddCondition={addCondition}
          onAddGroup={addGroup}
          onRemoveCondition={removeCondition}
          onUpdateCondition={updateCondition}
          onToggleLogic={toggleLogic}
          depth={0}
        />
      </div>

      <div className="builder-panel-footer">
        <button
          type="button"
          className="primary-button compact-action"
          onClick={() => {/* filter is live — no explicit apply needed */}}
        >
          Apply
          {resultCount != null ? (
            <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">
              {resultCount}
            </span>
          ) : null}
        </button>
        {onSaveAsView ? (
          <button
            type="button"
            className="secondary-button compact-action"
            onClick={onSaveAsView}
          >
            Save as view…
          </button>
        ) : null}
        <button
          type="button"
          className="text-button compact-action ml-auto"
          onClick={() => onChange({ logic: 'AND', conditions: [] })}
        >
          Clear all
        </button>
      </div>
    </div>
  );
}

interface FilterGroupComponentProps {
  group: FilterGroupInput;
  groupPath: number[];
  facets: any;
  onAddCondition: (path: number[]) => void;
  onAddGroup: (path: number[]) => void;
  onRemoveCondition: (path: number[], index: number) => void;
  onUpdateCondition: (path: number[], index: number, updates: any) => void;
  onToggleLogic: (path: number[]) => void;
  depth: number;
}

function FilterGroupComponent({
  group,
  groupPath,
  facets,
  onAddCondition,
  onAddGroup,
  onRemoveCondition,
  onUpdateCondition,
  onToggleLogic,
  depth
}: FilterGroupComponentProps) {
  const maxDepth = 5;
  const canNest = depth < maxDepth;

  return (
    <div className={depth > 0 ? 'nested-group' : ''} data-testid={`filter-group-depth-${depth}`}>
      {depth > 0 && (
        <div className="flex items-center gap-1.5 pb-1 text-xs text-zinc-500">
          Match
          <button
            type="button"
            className={`logic-badge${group.logic === 'OR' ? ' or' : ''}`}
            onClick={() => onToggleLogic(groupPath)}
            data-testid="filter-logic-toggle"
            aria-label={`Toggle logic operator (currently ${group.logic})`}
          >
            {group.logic}
          </button>
          of:
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {group.conditions.map((condition, index) => {
          if ('field' in condition) {
            return (
              <FilterConditionComponent
                key={index}
                condition={condition}
                conditionIndex={index}
                groupPath={groupPath}
                facets={facets}
                onUpdate={(updates) => onUpdateCondition(groupPath, index, updates)}
                onRemove={() => onRemoveCondition(groupPath, index)}
              />
            );
          } else {
            return (
              <FilterGroupComponent
                key={index}
                group={condition}
                groupPath={[...groupPath, index]}
                facets={facets}
                onAddCondition={onAddCondition}
                onAddGroup={onAddGroup}
                onRemoveCondition={onRemoveCondition}
                onUpdateCondition={onUpdateCondition}
                onToggleLogic={onToggleLogic}
                depth={depth + 1}
              />
            );
          }
        })}
      </div>
      <div className="flex items-center gap-1.5 mt-1.5">
        <button
          type="button"
          className="add-filter-btn"
          onClick={() => onAddCondition(groupPath)}
          data-testid="filter-add-condition"
          aria-label="Add filter condition"
        >
          + Add condition
        </button>
        {canNest && (
          <button
            type="button"
            className="add-filter-btn"
            onClick={() => onAddGroup(groupPath)}
            data-testid="filter-add-group"
            aria-label="Add filter group"
          >
            + Add group
          </button>
        )}
      </div>
    </div>
  );
}

interface FilterConditionComponentProps {
  condition: FilterCondition;
  conditionIndex: number;
  groupPath: number[];
  facets: any;
  onUpdate: (updates: any) => void;
  onRemove: () => void;
}

function FilterConditionComponent({
  condition,
  facets,
  onUpdate,
  onRemove
}: FilterConditionComponentProps) {
  const fieldConfig = FILTER_FIELDS[condition.field];
  const fieldType = fieldConfig?.type;

  // Get available operators based on field type
  const getOperators = () => {
    switch (fieldType) {
      case 'number':
        return ['equals', 'not_equals', 'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal', 'between', 'is_null', 'is_not_null'];
      case 'text':
        return ['equals', 'not_equals', 'text_contains', 'text_not_contains', 'starts_with', 'ends_with', 'is_null', 'is_not_null'];
      case 'uuid':
        return ['equals', 'not_equals', 'in', 'not_in', 'is_null', 'is_not_null'];
      case 'array':
        return ['array_contains', 'array_not_contains', 'array_contains_all', 'is_null', 'is_not_null'];
      case 'date':
        return ['equals', 'before', 'after', 'between', 'is_null', 'is_not_null'];
      default:
        return ['equals', 'not_equals'];
    }
  };

  const renderValueInput = () => {
    if (condition.operator === 'is_null' || condition.operator === 'is_not_null') {
      return null;
    }

    if (condition.operator === 'between') {
      if (fieldType === 'number') {
        return (
          <div className="flex items-center gap-1">
            <input
              type="number"
              placeholder="Min"
              value={Array.isArray(condition.value) ? condition.value[0] : ''}
              onChange={(e) => {
                const newValue = [parseFloat(e.target.value) || 0, Array.isArray(condition.value) ? condition.value[1] : 0];
                onUpdate({ value: newValue as any });
              }}
              data-testid="filter-value-min"
              aria-label="Minimum value"
            />
            <span>to</span>
            <input
              type="number"
              placeholder="Max"
              value={Array.isArray(condition.value) ? condition.value[1] : ''}
              onChange={(e) => {
                const newValue = [Array.isArray(condition.value) ? condition.value[0] : 0, parseFloat(e.target.value) || 0];
                onUpdate({ value: newValue as any });
              }}
              data-testid="filter-value-max"
              aria-label="Maximum value"
            />
          </div>
        );
      } else if (fieldType === 'date') {
        return (
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={Array.isArray(condition.value) ? condition.value[0] : ''}
              onChange={(e) => {
                const newValue = [e.target.value, Array.isArray(condition.value) ? condition.value[1] : ''];
                onUpdate({ value: newValue as any });
              }}
              data-testid="filter-value-date-start"
              aria-label="Start date"
            />
            <span>to</span>
            <input
              type="date"
              value={Array.isArray(condition.value) ? condition.value[1] : ''}
              onChange={(e) => {
                const newValue = [Array.isArray(condition.value) ? condition.value[0] : '', e.target.value];
                onUpdate({ value: newValue as any });
              }}
              data-testid="filter-value-date-end"
              aria-label="End date"
            />
          </div>
        );
      }
    }

    // Field-specific inputs with facet dropdowns
    switch (condition.field) {
      case 'category':
        return (
          <select
            value={condition.value as string}
            onChange={(e) => onUpdate({ value: e.target.value })}
            data-testid="filter-value-category"
            aria-label="Category value"
          >
            <option value="">Select category...</option>
            {facets?.categories?.map((cat: string) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        );

      case 'subcategory':
        return (
          <select
            value={condition.value as string}
            onChange={(e) => onUpdate({ value: e.target.value })}
            data-testid="filter-value-subcategory"
            aria-label="Subcategory value"
          >
            <option value="">Select subcategory...</option>
            {facets?.subcategories?.map((sub: any) => (
              <option key={sub.subcategory} value={sub.subcategory}>
                {sub.subcategory} ({sub.category})
              </option>
            ))}
          </select>
        );

      case 'brandId':
        return (
          <select
            value={condition.value as string}
            onChange={(e) => onUpdate({ value: e.target.value })}
            data-testid="filter-value-brand"
            aria-label="Brand value"
          >
            <option value="">Select brand...</option>
            {facets?.brands?.map((brand: any) => (
              <option key={brand.id} value={brand.id}>
                {brand.name} ({brand.alias})
              </option>
            ))}
          </select>
        );

      case 'vendorId':
        return (
          <select
            value={condition.value as string}
            onChange={(e) => onUpdate({ value: e.target.value })}
            data-testid="filter-value-vendor"
            aria-label="Vendor value"
          >
            <option value="">Select vendor...</option>
            {facets?.vendors?.map((vendor: any) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name} ({vendor.alias})
              </option>
            ))}
          </select>
        );

      case 'tags':
        return (
          <select
            multiple
            value={Array.isArray(condition.value) ? condition.value : []}
            onChange={(e) => {
              const selected = Array.from(e.target.selectedOptions, option => option.value);
              onUpdate({ value: selected as any });
            }}
            data-testid="filter-value-tags"
            aria-label="Tags value (multi-select)"
          >
            {facets?.tags?.map((tag: string) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        );

      case 'unitPrice':
      case 'unitCost':
      case 'availableQty':
      case 'ageDays':
        return (
          <input
            type="number"
            value={condition.value as number}
            onChange={(e) => onUpdate({ value: parseFloat(e.target.value) || 0 })}
            placeholder="Enter value"
            data-testid="filter-value-number"
            aria-label={`${condition.field} value`}
          />
        );

      case 'intakeDate':
        return (
          <input
            type="date"
            value={condition.value as string}
            onChange={(e) => onUpdate({ value: e.target.value })}
            data-testid="filter-value-date"
            aria-label="Intake date value"
          />
        );

      default:
        return (
          <input
            type="text"
            value={condition.value as string}
            onChange={(e) => onUpdate({ value: e.target.value })}
            placeholder="Enter value"
            data-testid="filter-value-text"
            aria-label={`${condition.field} value`}
          />
        );
    }
  };

  return (
    <div className="condition-row" data-testid="filter-condition">
      <select
        className="select compact"
        style={{ minWidth: 110 }}
        value={condition.field}
        onChange={(e) => onUpdate({ field: e.target.value as FilterFieldName, operator: 'equals', value: '' })}
        data-testid="filter-field-select"
        aria-label="Filter field"
      >
        {Object.keys(FILTER_FIELDS).map((field) => (
          <option key={field} value={field}>
            {field.replace(/([A-Z])/g, ' $1').trim()}
          </option>
        ))}
      </select>

      <select
        className="select compact"
        style={{ minWidth: 110 }}
        value={condition.operator}
        onChange={(e) => onUpdate({ operator: e.target.value as any })}
        data-testid="filter-operator-select"
        aria-label="Filter operator"
      >
        {getOperators().map((op) => (
          <option key={op} value={op}>
            {op.replace(/_/g, ' ')}
          </option>
        ))}
      </select>

      {renderValueInput()}

      <button
        type="button"
        className="ml-auto flex h-[22px] w-[22px] items-center justify-center rounded border border-line bg-white text-zinc-400 text-sm hover:border-danger hover:text-danger hover:bg-red-50 flex-shrink-0"
        onClick={onRemove}
        data-testid="filter-remove-condition"
        aria-label="Remove this filter condition"
      >×</button>
    </div>
  );
}

// Helper function to navigate nested filter groups
function getGroupAtPath(filter: FilterGroupInput, path: number[]): FilterGroupInput {
  if (!filter || typeof filter !== 'object') {
    throw new Error('Invalid filter object');
  }

  let group = filter;
  for (const segment of path) {
    // Validate segment is safe integer
    if (typeof segment !== 'number' || !Number.isInteger(segment) || segment < 0) {
      throw new Error(`Invalid path segment: ${segment}`);
    }

    // Validate conditions array exists
    if (!Array.isArray(group.conditions)) {
      throw new Error('Filter group has no conditions array');
    }

    // Bounds check
    if (segment >= group.conditions.length) {
      throw new Error(`Path segment ${segment} out of bounds (length: ${group.conditions.length})`);
    }

    const condition = group.conditions[segment];

    // Type guard: must be object with logic property
    if (!condition || typeof condition !== 'object' || !('logic' in condition)) {
      throw new Error('Path does not point to a filter group');
    }

    group = condition as FilterGroupInput;
  }

  return group;
}
