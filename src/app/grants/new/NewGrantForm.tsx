'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ── Resource types ────────────────────────────────────────────────────────────
// Entity grants: user picks a specific record (account, campaign, office, team)
// Functional grants: no specific resource — grants a capability across the system
// Staff scope grants: shortcut to the existing dedicated /grants/staff form

const ENTITY_TYPES = [
  { value: 'account',  label: 'Account' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'office',   label: 'Office' },
  { value: 'team',     label: 'Team' },
] as const;

const FUNCTIONAL_TYPES = [
  {
    value: 'func:temporal',
    label: 'Temporal access',
    description: 'Controls how far back a user can query historical data',
    roles: [
      { value: 'current_only', label: 'Current state only (default)' },
      { value: 'rolling_1yr',  label: 'Rolling 1 year' },
      { value: 'rolling_2yr',  label: 'Rolling 2 years' },
      { value: 'rolling_5yr',  label: 'Rolling 5 years' },
      { value: 'all_time',     label: 'All time (full history)' },
    ],
  },
  {
    value: 'func:export',
    label: 'Export / bulk download',
    description: 'Allows downloading data exports',
    roles: [
      { value: 'allowed', label: 'Allowed' },
    ],
  },
  {
    value: 'func:admin_ui',
    label: 'Admin UI access',
    description: 'Access to the admin CMS',
    roles: [
      { value: 'read_only', label: 'Read-only' },
      { value: 'editor',    label: 'Editor' },
      { value: 'full',      label: 'Full access' },
    ],
  },
] as const;

type EntityTypeName = typeof ENTITY_TYPES[number]['value'];
type FunctionalTypeName = typeof FUNCTIONAL_TYPES[number]['value'];
type GrantCategory = 'entity' | 'functional';

type Resource = { id: string; name: string };

type Props = {
  users: { id: string; email: string; displayName: string | null }[];
  staff: { id: string; fullName: string }[];
  accounts: Resource[];
  campaigns: Resource[];
  offices: Resource[];
  teams: Resource[];
};

const ENTITY_ROLES = ['viewer', 'contributor', 'manager', 'admin'];

// Scope grants for offices and teams. `specific` means "this single record"
// (uses entity type `office` or `team` + resourceId). `all` and `active` are
// cohort grants (no resourceId — the resourceType itself encodes the cohort).
//
//   office + specific  → resourceType='office',          resourceId=<uuid>
//   office + all       → resourceType='office_all',      resourceId=null
//   office + active    → resourceType='office_active',   resourceId=null
//   team   + specific  → resourceType='team',            resourceId=<uuid>
//   team   + all       → resourceType='team_all',        resourceId=null
//   team   + active    → resourceType='team_active',     resourceId=null
type EntityScope = 'specific' | 'all' | 'active';

const SCOPE_OPTIONS: { value: EntityScope; label: string; description: string }[] = [
  { value: 'specific', label: 'Specific',        description: 'One record you pick below' },
  { value: 'all',      label: 'All',             description: 'Every record, including inactive/closed' },
  { value: 'active',   label: 'Active only',     description: 'Only records where is_active = true (recommended for broad staff)' },
];

function resolveResourceType(entityType: EntityTypeName, scope: EntityScope): string {
  if (scope === 'specific') return entityType; // 'account' | 'campaign' | 'office' | 'team'
  if (entityType === 'office') return scope === 'all' ? 'office_all' : 'office_active';
  if (entityType === 'team')   return scope === 'all' ? 'team_all'   : 'team_active';
  // account / campaign don't have cohort grants; fall back to specific
  return entityType;
}

export default function NewGrantForm({ users, staff, accounts, campaigns, offices, teams }: Props) {
  const router = useRouter();
  const [category, setCategory] = useState<GrantCategory>('entity');
  const [entityType, setEntityType] = useState<EntityTypeName>('account');
  const [scope, setScope] = useState<EntityScope>('specific');
  const [functionalType, setFunctionalType] = useState<FunctionalTypeName>('func:temporal');
  const [form, setForm] = useState({
    userId: '',
    resourceId: '',
    role: 'viewer',
    grantedBy: '',
    expiresAt: '',
  });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ granted: number } | null>(null);
  const [error, setError] = useState('');

  const funcDef = FUNCTIONAL_TYPES.find((f) => f.value === functionalType)!;
  const resourceType =
    category === 'entity' ? resolveResourceType(entityType, scope) : functionalType;
  const scopeSupported = entityType === 'office' || entityType === 'team';
  const needsResourceId = category === 'entity' && scope === 'specific';

  const resourceOptions: Resource[] =
    entityType === 'account'  ? accounts  :
    entityType === 'campaign' ? campaigns :
    entityType === 'office'   ? offices   :
    teams;

  function handleCategoryChange(cat: GrantCategory) {
    setCategory(cat);
    setForm((f) => ({ ...f, resourceId: '', role: cat === 'entity' ? 'viewer' : funcDef.roles[0].value }));
  }

  function handleEntityTypeChange(t: EntityTypeName) {
    setEntityType(t);
    // account + campaign don't support cohort scopes; force 'specific' so the
    // form submits the right resourceType.
    if (t === 'account' || t === 'campaign') setScope('specific');
    setForm((f) => ({ ...f, resourceId: '' }));
  }

  function handleScopeChange(s: EntityScope) {
    setScope(s);
    // Cohort scopes don't use resourceId.
    if (s !== 'specific') setForm((f) => ({ ...f, resourceId: '' }));
  }

  function handleFunctionalTypeChange(t: FunctionalTypeName) {
    setFunctionalType(t);
    const def = FUNCTIONAL_TYPES.find((f) => f.value === t)!;
    setForm((f) => ({ ...f, role: def.roles[0].value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (needsResourceId && !form.resourceId) {
      setError('Please select a resource.');
      return;
    }
    setSaving(true);
    setError('');
    setResult(null);

    const res = await fetch('/api/grants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: form.userId,
        resourceType,
        // Only include resourceId for 'specific' scope. Cohort grants
        // (office_all, office_active, team_all, team_active) rely on the
        // API's nil-UUID default.
        resourceId: needsResourceId ? form.resourceId : undefined,
        role: form.role,
        grantedBy: form.grantedBy,
        expiresAt: form.expiresAt || null,
      }),
    });

    setSaving(false);
    if (res.ok) {
      setResult(await res.json());
    } else {
      const d = await res.json();
      setError(JSON.stringify(d.error));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 bg-white border border-gray-200 rounded-lg p-5">

      {/* Category */}
      <div>
        <label className="block text-xs text-gray-500 mb-2">Grant type</label>
        <div className="flex gap-3">
          {(['entity', 'functional'] as GrantCategory[]).map((cat) => (
            <label key={cat} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="category"
                checked={category === cat}
                onChange={() => handleCategoryChange(cat)}
              />
              {cat === 'entity' ? 'Resource grant' : 'Functional grant'}
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {category === 'entity'
            ? 'Access to a specific record in the database.'
            : 'A cross-cutting capability independent of any specific record.'}
        </p>
      </div>

      {/* Entity type + resource picker */}
      {category === 'entity' && (
        <>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Resource type *</label>
            <div className="flex gap-3 flex-wrap">
              {ENTITY_TYPES.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="entityType"
                    checked={entityType === value}
                    onChange={() => handleEntityTypeChange(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          {/* Scope — only applies to offices and teams (cohort grants) */}
          {scopeSupported && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">Scope *</label>
              <div className="space-y-1.5">
                {SCOPE_OPTIONS.map(({ value, label, description }) => (
                  <label key={value} className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="scope"
                      checked={scope === value}
                      onChange={() => handleScopeChange(value)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="text-sm font-medium">{label}</span>
                      <span className="text-xs text-gray-400 ml-2">{description}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Sends <code className="text-[10px] bg-gray-100 px-1 rounded">{resourceType}</code>{' '}
                {scope === 'specific' ? 'with a resource id.' : 'with no resource id.'}
              </p>
            </div>
          )}

          {needsResourceId && (
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {ENTITY_TYPES.find((t) => t.value === entityType)?.label} *
              </label>
              {resourceOptions.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No {entityType}s found.</p>
              ) : (
                <select
                  value={form.resourceId}
                  onChange={(e) => setForm((f) => ({ ...f, resourceId: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
                  required
                >
                  <option value="">— select —</option>
                  {resourceOptions.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            >
              {ENTITY_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Functional type + role */}
      {category === 'functional' && (
        <>
          <div>
            <label className="block text-xs text-gray-500 mb-2">Capability *</label>
            <div className="space-y-2">
              {FUNCTIONAL_TYPES.map(({ value, label, description }) => (
                <label key={value} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="functionalType"
                    checked={functionalType === value}
                    onChange={() => handleFunctionalTypeChange(value)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-xs text-gray-400 ml-2">{description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Level *</label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            >
              {funcDef.roles.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* User */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">User *</label>
        <select
          value={form.userId}
          onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
          required
        >
          <option value="">— select user —</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName ? `${u.displayName} (${u.email})` : u.email}
            </option>
          ))}
        </select>
      </div>

      {/* Granted by */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Granted By (staff) *</label>
        <select
          value={form.grantedBy}
          onChange={(e) => setForm((f) => ({ ...f, grantedBy: e.target.value }))}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
          required
        >
          <option value="">— select staff member —</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.fullName}</option>
          ))}
        </select>
      </div>

      {/* Expires at */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Expires At (optional)</label>
        <input
          type="datetime-local"
          value={form.expiresAt}
          onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      {result && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">
          Grant created.{' '}
          <button type="button" onClick={() => router.push('/grants')} className="underline">
            View all grants
          </button>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="text-sm px-3 py-1.5 bg-gray-900 text-white rounded hover:bg-gray-700 disabled:opacity-50"
        >
          {saving ? 'Granting…' : 'Create Grant'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
