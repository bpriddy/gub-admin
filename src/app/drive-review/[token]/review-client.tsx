'use client';

import { useMemo, useReducer, useState } from 'react';
import type {
  ApplyDecisionsResult,
  Decision,
  FieldChangeItem,
  NewEntityGroup,
  ReviewSession,
} from './types';

// ── State ────────────────────────────────────────────────────────────────────

type RowChoice = 'approve' | 'reject' | null;

interface FieldRowState {
  choice: RowChoice;
  overrideValue: string | null; // null = "use proposedValue"; '' = "clear to null"
  /** Set after a successful decide call. Applied/rejected rows are locked. */
  resolved: 'applied' | 'rejected' | null;
  /** Per-item error from the decide response, if any. */
  error: string | null;
}

interface GroupState {
  choice: RowChoice;
  /** Keyed by property. Undefined = use the original proposed value. */
  fieldOverrides: Record<string, string>;
  resolved: 'applied' | 'rejected' | null;
  error: string | null;
}

interface FormState {
  fields: Record<string, FieldRowState>;
  groups: Record<string, GroupState>;
}

type Action =
  | { type: 'setFieldChoice'; proposalId: string; choice: RowChoice }
  | { type: 'setFieldOverride'; proposalId: string; value: string | null }
  | { type: 'setGroupChoice'; groupId: string; choice: RowChoice }
  | { type: 'setGroupOverride'; groupId: string; property: string; value: string }
  | { type: 'clearGroupOverride'; groupId: string; property: string }
  | {
      type: 'markResults';
      approvedIds: Set<string>;
      rejectedIds: Set<string>;
      errors: Array<{ target: string; reason: string }>;
    };

function reducer(state: FormState, action: Action): FormState {
  switch (action.type) {
    case 'setFieldChoice': {
      const prev = state.fields[action.proposalId];
      if (!prev) return state;
      return {
        ...state,
        fields: {
          ...state.fields,
          [action.proposalId]: { ...prev, choice: action.choice, error: null },
        },
      };
    }
    case 'setFieldOverride': {
      const prev = state.fields[action.proposalId];
      if (!prev) return state;
      return {
        ...state,
        fields: {
          ...state.fields,
          [action.proposalId]: { ...prev, overrideValue: action.value },
        },
      };
    }
    case 'setGroupChoice': {
      const prev = state.groups[action.groupId];
      if (!prev) return state;
      return {
        ...state,
        groups: {
          ...state.groups,
          [action.groupId]: { ...prev, choice: action.choice, error: null },
        },
      };
    }
    case 'setGroupOverride': {
      const prev = state.groups[action.groupId];
      if (!prev) return state;
      return {
        ...state,
        groups: {
          ...state.groups,
          [action.groupId]: {
            ...prev,
            fieldOverrides: { ...prev.fieldOverrides, [action.property]: action.value },
          },
        },
      };
    }
    case 'clearGroupOverride': {
      const prev = state.groups[action.groupId];
      if (!prev) return state;
      const next = { ...prev.fieldOverrides };
      delete next[action.property];
      return {
        ...state,
        groups: { ...state.groups, [action.groupId]: { ...prev, fieldOverrides: next } },
      };
    }
    case 'markResults': {
      const fields: Record<string, FieldRowState> = { ...state.fields };
      for (const [id, row] of Object.entries(state.fields)) {
        const err = action.errors.find((e) => e.target === id);
        if (err) {
          fields[id] = { ...row, error: err.reason };
        } else if (action.approvedIds.has(id)) {
          fields[id] = { ...row, resolved: 'applied', error: null };
        } else if (action.rejectedIds.has(id)) {
          fields[id] = { ...row, resolved: 'rejected', error: null };
        }
      }
      const groups: Record<string, GroupState> = { ...state.groups };
      for (const [id, g] of Object.entries(state.groups)) {
        const err = action.errors.find((e) => e.target === id);
        if (err) {
          groups[id] = { ...g, error: err.reason };
        } else if (action.approvedIds.has(id)) {
          groups[id] = { ...g, resolved: 'applied', error: null };
        } else if (action.rejectedIds.has(id)) {
          groups[id] = { ...g, resolved: 'rejected', error: null };
        }
      }
      return { fields, groups };
    }
  }
}

function initialFormState(session: ReviewSession): FormState {
  const fields: Record<string, FieldRowState> = {};
  for (const fc of session.fieldChanges) {
    fields[fc.proposalId] = {
      choice: null,
      overrideValue: null,
      resolved: null,
      error: null,
    };
  }
  const groups: Record<string, GroupState> = {};
  for (const g of session.newEntityGroups) {
    groups[g.proposalGroupId] = {
      choice: null,
      fieldOverrides: {},
      resolved: null,
      error: null,
    };
  }
  return { fields, groups };
}

// ── Presentation helpers ────────────────────────────────────────────────────

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v.length === 0 ? '—' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function propertyLabel(prop: string): string {
  // snake_case → Title Case
  return prop
    .split('_')
    .map((s) => (s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : ''))
    .join(' ');
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

// ── Top-level component ─────────────────────────────────────────────────────

export function ReviewClient({
  token,
  session,
}: {
  token: string;
  session: ReviewSession;
}) {
  const [state, dispatch] = useReducer(reducer, session, initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyDecisionsResult | null>(null);

  const { pending, decisions } = useMemo(() => {
    const decs: Decision[] = [];
    let hasPending = false;

    for (const fc of session.fieldChanges) {
      const row = state.fields[fc.proposalId];
      if (!row || row.resolved) continue;
      if (row.choice === 'approve') {
        decs.push({
          proposalId: fc.proposalId,
          decision: 'approve',
          ...(row.overrideValue !== null ? { overrideValue: row.overrideValue } : {}),
        });
        hasPending = true;
      } else if (row.choice === 'reject') {
        decs.push({ proposalId: fc.proposalId, decision: 'reject' });
        hasPending = true;
      }
    }

    for (const g of session.newEntityGroups) {
      const gs = state.groups[g.proposalGroupId];
      if (!gs || gs.resolved) continue;
      if (gs.choice === 'approve') {
        const overrides = Object.keys(gs.fieldOverrides).length
          ? gs.fieldOverrides
          : undefined;
        decs.push({
          proposalGroupId: g.proposalGroupId,
          decision: 'approve',
          ...(overrides ? { fieldOverrides: overrides } : {}),
        });
        hasPending = true;
      } else if (gs.choice === 'reject') {
        decs.push({ proposalGroupId: g.proposalGroupId, decision: 'reject' });
        hasPending = true;
      }
    }

    return { pending: hasPending, decisions: decs };
  }, [session, state]);

  async function handleSubmit() {
    if (!pending || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/drive-review/${encodeURIComponent(token)}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions }),
      });
      const body = (await res.json()) as ApplyDecisionsResult & { error?: string };
      if (!res.ok) {
        setSubmitError(body.error ?? `Submit failed (${res.status})`);
        return;
      }

      // Walk the decisions we sent and mark rows as applied/rejected, unless
      // the backend reported an error for that target.
      const errorTargets = new Set(body.errors.map((e) => e.target));
      const approved = new Set<string>();
      const rejected = new Set<string>();
      for (const d of decisions) {
        const target = 'proposalId' in d ? d.proposalId : d.proposalGroupId;
        if (errorTargets.has(target)) continue;
        if (d.decision === 'approve') approved.add(target);
        else rejected.add(target);
      }
      dispatch({
        type: 'markResults',
        approvedIds: approved,
        rejectedIds: rejected,
        errors: body.errors,
      });
      setResult(body);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {session.newEntityGroups.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            New{' '}
            {session.newEntityGroups.length === 1 ? 'entity' : 'entities'}
          </h2>
          <div className="space-y-3">
            {session.newEntityGroups.map((g) => (
              <NewEntityGroupCard
                key={g.proposalGroupId}
                group={g}
                state={state.groups[g.proposalGroupId]!}
                dispatch={dispatch}
              />
            ))}
          </div>
        </section>
      )}

      {session.fieldChanges.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">
            Proposed changes
          </h2>
          <div className="space-y-3">
            {session.fieldChanges.map((fc) => (
              <FieldChangeRow
                key={fc.proposalId}
                item={fc}
                state={state.fields[fc.proposalId]!}
                dispatch={dispatch}
              />
            ))}
          </div>
        </section>
      )}

      <footer className="sticky bottom-0 -mx-4 sm:-mx-6 lg:-mx-8 bg-white border-t border-gray-200 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="text-sm text-gray-600">
            {result ? (
              <>
                <span className="text-green-700 font-medium">
                  {result.approved} approved
                </span>
                {' · '}
                <span className="text-gray-700 font-medium">
                  {result.rejected} rejected
                </span>
                {result.errors.length > 0 && (
                  <>
                    {' · '}
                    <span className="text-red-700 font-medium">
                      {result.errors.length} failed
                    </span>
                  </>
                )}
              </>
            ) : submitError ? (
              <span className="text-red-700">{submitError}</span>
            ) : pending ? (
              <>{decisions.length} decision{decisions.length === 1 ? '' : 's'} ready</>
            ) : (
              <span className="text-gray-400">Select a choice on any row to enable submit</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!pending || submitting}
            className={`text-sm px-4 py-2 rounded-md transition-colors ${
              !pending || submitting
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {submitting ? 'Submitting…' : 'Submit decisions'}
          </button>
        </div>
      </footer>
    </div>
  );
}

// ── Field-change row ────────────────────────────────────────────────────────

function FieldChangeRow({
  item,
  state,
  dispatch,
}: {
  item: FieldChangeItem;
  state: FieldRowState;
  dispatch: React.Dispatch<Action>;
}) {
  const locked = state.resolved !== null;
  const currentDisplay = formatValue(item.currentValue);
  const proposedDisplay = formatValue(item.proposedValue);
  const [showOverride, setShowOverride] = useState(false);

  return (
    <div
      className={`bg-white border rounded-lg p-4 ${
        state.error
          ? 'border-red-300'
          : state.resolved === 'applied'
            ? 'border-green-300'
            : state.resolved === 'rejected'
              ? 'border-gray-300'
              : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">
              {item.entityName}
            </span>
            <span className="text-xs text-gray-400">
              {item.entityType === 'account' ? 'Account' : 'Campaign'}
            </span>
            <span className="text-xs text-gray-500">
              &middot; {propertyLabel(item.property)}
            </span>
            {item.confidence !== null && (
              <span className="text-xs text-gray-400">
                &middot; confidence {(item.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <div className="mt-2 text-sm flex flex-col sm:flex-row sm:items-center gap-2">
            <code className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 text-gray-600 break-all">
              {currentDisplay}
            </code>
            <span className="text-gray-300">→</span>
            <code className="text-xs bg-blue-50 border border-blue-200 rounded px-2 py-1 text-blue-900 break-all">
              {proposedDisplay}
            </code>
          </div>
          {item.reasoning && (
            <p className="mt-2 text-xs text-gray-500 italic">{item.reasoning}</p>
          )}
          {showOverride && !locked && (
            <div className="mt-3">
              <label className="text-xs text-gray-600 block mb-1">
                Override proposed value
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Leave blank to clear; type a new value to replace"
                  value={state.overrideValue ?? ''}
                  onChange={(e) =>
                    dispatch({
                      type: 'setFieldOverride',
                      proposalId: item.proposalId,
                      value: e.target.value,
                    })
                  }
                />
                <button
                  type="button"
                  className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700"
                  onClick={() => {
                    dispatch({
                      type: 'setFieldOverride',
                      proposalId: item.proposalId,
                      value: null,
                    });
                    setShowOverride(false);
                  }}
                >
                  Cancel override
                </button>
              </div>
            </div>
          )}
          {state.error && (
            <p className="mt-2 text-xs text-red-700">Error: {state.error}</p>
          )}
        </div>
        <RowActions
          locked={locked}
          resolved={state.resolved}
          choice={state.choice}
          onApprove={() =>
            dispatch({
              type: 'setFieldChoice',
              proposalId: item.proposalId,
              choice: state.choice === 'approve' ? null : 'approve',
            })
          }
          onReject={() =>
            dispatch({
              type: 'setFieldChoice',
              proposalId: item.proposalId,
              choice: state.choice === 'reject' ? null : 'reject',
            })
          }
          onToggleOverride={() => setShowOverride((v) => !v)}
          overrideAvailable={state.choice === 'approve'}
          overrideActive={state.overrideValue !== null}
        />
      </div>
      <div className="mt-2 text-xs text-gray-400">
        Expires in {daysUntil(item.expiresAt)} day{daysUntil(item.expiresAt) === 1 ? '' : 's'}
      </div>
    </div>
  );
}

// ── New-entity group card ───────────────────────────────────────────────────

function NewEntityGroupCard({
  group,
  state,
  dispatch,
}: {
  group: NewEntityGroup;
  state: GroupState;
  dispatch: React.Dispatch<Action>;
}) {
  const locked = state.resolved !== null;
  const [showOverrides, setShowOverrides] = useState(false);

  const nameField = group.fields.find((f) => f.property === 'name');
  const displayName =
    nameField && typeof nameField.proposedValue === 'string'
      ? nameField.proposedValue
      : `(unnamed ${group.entityType})`;

  return (
    <div
      className={`bg-white border rounded-lg p-4 ${
        state.error
          ? 'border-red-300'
          : state.resolved === 'applied'
            ? 'border-green-300'
            : state.resolved === 'rejected'
              ? 'border-gray-300'
              : 'border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">{displayName}</span>
            <span className="text-xs text-gray-400">
              {group.entityType === 'account' ? 'New account' : 'New campaign'}
            </span>
            {group.parentAccountName && (
              <span className="text-xs text-gray-500">
                &middot; under {group.parentAccountName}
              </span>
            )}
            {group.confidence !== null && (
              <span className="text-xs text-gray-400">
                &middot; confidence {(group.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            {group.fields.map((f) => (
              <div key={f.proposalId} className="text-sm">
                <dt className="text-xs text-gray-500">{propertyLabel(f.property)}</dt>
                <dd className="text-gray-900 break-words">
                  {state.fieldOverrides[f.property] !== undefined ? (
                    <span className="italic">
                      {formatValue(state.fieldOverrides[f.property])}{' '}
                      <span className="text-xs text-amber-600">(override)</span>
                    </span>
                  ) : (
                    formatValue(f.proposedValue)
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {group.reasoning && (
            <p className="mt-2 text-xs text-gray-500 italic">{group.reasoning}</p>
          )}
          {showOverrides && !locked && (
            <div className="mt-3 space-y-2">
              {group.fields.map((f) => {
                const current =
                  state.fieldOverrides[f.property] ?? formatValue(f.proposedValue);
                return (
                  <div key={f.proposalId} className="flex items-center gap-2">
                    <label className="text-xs text-gray-600 w-24 shrink-0">
                      {propertyLabel(f.property)}
                    </label>
                    <input
                      type="text"
                      className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      value={current}
                      onChange={(e) =>
                        dispatch({
                          type: 'setGroupOverride',
                          groupId: group.proposalGroupId,
                          property: f.property,
                          value: e.target.value,
                        })
                      }
                    />
                    {state.fieldOverrides[f.property] !== undefined && (
                      <button
                        type="button"
                        className="text-xs text-gray-400 hover:text-gray-700"
                        onClick={() =>
                          dispatch({
                            type: 'clearGroupOverride',
                            groupId: group.proposalGroupId,
                            property: f.property,
                          })
                        }
                      >
                        reset
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {state.error && (
            <p className="mt-2 text-xs text-red-700">Error: {state.error}</p>
          )}
        </div>
        <RowActions
          locked={locked}
          resolved={state.resolved}
          choice={state.choice}
          onApprove={() =>
            dispatch({
              type: 'setGroupChoice',
              groupId: group.proposalGroupId,
              choice: state.choice === 'approve' ? null : 'approve',
            })
          }
          onReject={() =>
            dispatch({
              type: 'setGroupChoice',
              groupId: group.proposalGroupId,
              choice: state.choice === 'reject' ? null : 'reject',
            })
          }
          onToggleOverride={() => setShowOverrides((v) => !v)}
          overrideAvailable={state.choice === 'approve'}
          overrideActive={Object.keys(state.fieldOverrides).length > 0}
          batch
        />
      </div>
      <div className="mt-2 text-xs text-gray-400">
        Expires in {daysUntil(group.expiresAt)} day
        {daysUntil(group.expiresAt) === 1 ? '' : 's'}
      </div>
    </div>
  );
}

// ── Approve/Reject buttons ──────────────────────────────────────────────────

function RowActions({
  locked,
  resolved,
  choice,
  onApprove,
  onReject,
  onToggleOverride,
  overrideAvailable,
  overrideActive,
  batch,
}: {
  locked: boolean;
  resolved: 'applied' | 'rejected' | null;
  choice: RowChoice;
  onApprove: () => void;
  onReject: () => void;
  onToggleOverride: () => void;
  overrideAvailable: boolean;
  overrideActive: boolean;
  batch?: boolean;
}) {
  if (resolved === 'applied') {
    return (
      <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 shrink-0">
        ✓ applied
      </span>
    );
  }
  if (resolved === 'rejected') {
    return (
      <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 shrink-0">
        rejected
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      {overrideAvailable && (
        <button
          type="button"
          onClick={onToggleOverride}
          disabled={locked}
          className={`text-xs px-2 py-1 rounded border ${
            overrideActive
              ? 'border-amber-300 bg-amber-50 text-amber-700'
              : 'border-gray-200 text-gray-500 hover:text-gray-700'
          }`}
          title={batch ? 'Edit field values' : 'Override proposed value'}
        >
          {overrideActive ? 'edited' : 'edit'}
        </button>
      )}
      <button
        type="button"
        onClick={onApprove}
        disabled={locked}
        className={`text-xs px-3 py-1 rounded ${
          choice === 'approve'
            ? 'bg-green-600 text-white'
            : 'bg-white border border-green-200 text-green-700 hover:bg-green-50'
        }`}
      >
        {batch ? 'Approve all' : 'Approve'}
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={locked}
        className={`text-xs px-3 py-1 rounded ${
          choice === 'reject'
            ? 'bg-gray-700 text-white'
            : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
        }`}
      >
        {batch ? 'Reject all' : 'Reject'}
      </button>
    </div>
  );
}
