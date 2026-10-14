'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { POLICY_ROLES, type PolicyTypeSpec, type TargetKind } from '@/lib/grant-policy';

interface Props {
  types: PolicyTypeSpec[];
  teams: { id: string; name: string }[];
  options: Record<TargetKind, { id: string; name: string }[]>;
}

const WILDCARD = '*';

export function CreatePolicyForm({ types, teams, options }: Props) {
  const router = useRouter();
  const [teamId, setTeamId] = useState('');
  const [resourceType, setResourceType] = useState(types[0]?.value ?? '');
  const [resourceId, setResourceId] = useState('');
  const [role, setRole] = useState<string>('viewer');
  const [state, setState] = useState<'idle' | 'saving' | 'error' | 'created'>('idle');
  const [error, setError] = useState<string | null>(null);

  const spec = types.find((t) => t.value === resourceType);
  const needsResource = spec?.resourceId === 'required' || spec?.resourceId === 'optional';
  const ready =
    teamId !== '' &&
    spec !== undefined &&
    (!needsResource || resourceId !== '') &&
    state !== 'saving';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setState('saving');
    setError(null);
    try {
      const res = await fetch('/api/grant-policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId,
          resourceType,
          resourceId: needsResource && resourceId !== WILDCARD ? resourceId : null,
          role,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: unknown; error?: unknown };
        setError(
          typeof body.message === 'string'
            ? body.message
            : typeof body.error === 'string'
              ? body.error
              : `HTTP ${res.status}`,
        );
        setState('error');
        return;
      }
      setState('created');
      setResourceId('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setState('error');
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-gray-200 rounded-lg p-4 space-y-3"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Team <span className="text-red-500">*</span>
          </label>
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            disabled={state === 'saving'}
          >
            <option value="">Choose a team…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Role <span className="text-red-500">*</span>
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            disabled={state === 'saving'}
          >
            {POLICY_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Grants access to <span className="text-red-500">*</span>
          </label>
          <select
            value={resourceType}
            onChange={(e) => {
              setResourceType(e.target.value);
              setResourceId('');
            }}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            disabled={state === 'saving'}
          >
            {types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {spec && <p className="text-xs text-gray-400 mt-1">{spec.description}</p>}
        </div>
        {needsResource && spec?.targetKind && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Which {spec.targetKind} <span className="text-red-500">*</span>
            </label>
            <select
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
              disabled={state === 'saving'}
            >
              <option value="">Choose…</option>
              {spec.resourceId === 'optional' && (
                <option value={WILDCARD}>Every {spec.targetKind} (wildcard)</option>
              )}
              {options[spec.targetKind].map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500">
        The policy is created <strong>inactive</strong> and ratified by you. It grants nothing until
        you preview it and activate it.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!ready}
          className={`text-sm px-4 py-1.5 rounded text-white ${
            ready ? 'bg-gray-900 hover:bg-gray-700' : 'bg-gray-300 cursor-not-allowed'
          }`}
        >
          {state === 'saving' ? 'Creating…' : 'Create inactive policy'}
        </button>
        {state === 'created' && <span className="text-xs text-green-700">Created.</span>}
        {state === 'error' && error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-1.5">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
