'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { policyTypeSpec, type GrantResultCounts } from '@/lib/grant-policy';

export interface PolicyRowData {
  id: string;
  teamName: string;
  resourceType: string;
  resourceId: string | null;
  /** Name of the record resourceId points at, when it still exists. */
  resourceLabel: string | null;
  role: string;
  isActive: boolean;
  ratifiedByName: string;
  /** The server's verdict: may the viewer activate this policy right now (a fresh preview exists)? */
  activatable: boolean;
  /** Why not, when it may not. */
  gateMessage: string | null;
}

/** Response of POST /api/grant-policies/:id/preview. */
export interface PreviewData {
  previewedAt: string;
  validUntil: string;
  skipped: string | null;
  skippedText: string | null;
  counters: Record<string, number>;
  targets: { resourceType: string; resourceId: string; name: string | null }[];
  statusCounts: GrantResultCounts;
  grantsTotal: number;
  grants: {
    userId: string;
    email: string | null;
    displayName: string | null;
    resourceType: string;
    resourceId: string;
    resourceName: string | null;
    role: string;
    /** A known result (see GRANT_RESULTS) or, for one this page does not know yet, the backend's own word. */
    status: string;
    /** The role of the grant the sync holds; set with `role_change`. */
    heldRole: string | null;
  }[];
}

type Busy = 'preview' | 'activate' | 'deactivate' | null;

const STATUS_TEXT: Record<string, string> = {
  create: 'would be created',
  role_change: 'role would change',
  kept: 'already in place',
  covered: 'covered by another grant',
};

function describeResult(g: PreviewData['grants'][number]): string {
  if (g.status === 'role_change') {
    return `${STATUS_TEXT['role_change']}: ${g.heldRole ?? 'its current role'} → ${g.role} (the held grant is replaced)`;
  }
  return STATUS_TEXT[g.status] ?? `${g.status} (not recognised by this page)`;
}

function describeTarget(row: PolicyRowData): string {
  if (row.resourceId) return row.resourceLabel ?? `${row.resourceId} (not found)`;
  const rule = policyTypeSpec(row.resourceType)?.resourceId;
  if (rule === 'optional') return 'every one (wildcard)';
  if (rule === 'none') return 'whole table';
  return '—';
}

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function PolicyRow({
  row,
  canWrite,
  previewAvailable,
}: {
  row: PolicyRowData;
  canWrite: boolean;
  previewAvailable: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);

  async function call(action: Exclude<Busy, null>): Promise<Response | null> {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/grant-policies/${row.id}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: unknown; error?: unknown };
        setError(
          typeof body.message === 'string'
            ? body.message
            : typeof body.error === 'string'
              ? body.error
              : `HTTP ${res.status}`,
        );
        return null;
      }
      return res;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function runPreview() {
    const res = await call('preview');
    if (!res) return;
    setPreview((await res.json()) as PreviewData);
    // The server decides when the policy becomes activatable; reload its verdict.
    router.refresh();
  }

  async function activate() {
    if (
      !confirm(
        `Activate this policy?\n\nEvery member of '${row.teamName}' becomes eligible for a '${row.role}' grant on ${describeTarget(
          row,
        )} at the next grant sync.`,
      )
    ) {
      return;
    }
    if (await call('activate')) {
      setPreview(null);
      router.refresh();
    }
  }

  async function deactivate() {
    if (
      !confirm(
        `Deactivate this policy?\n\nThe grants it produced are revoked at the next grant sync.`,
      )
    ) {
      return;
    }
    if (await call('deactivate')) {
      setPreview(null);
      router.refresh();
    }
  }

  const disabled = busy !== null || !canWrite;

  return (
    <>
      <tr className={row.isActive ? '' : 'bg-gray-50/50'}>
        <td className="px-4 py-3 align-top font-medium text-gray-900 break-words">
          {row.teamName}
        </td>
        <td className="px-4 py-3 align-top">
          <div className="text-xs font-mono text-gray-600">{row.resourceType}</div>
          <div className="text-sm text-gray-900 break-words">{describeTarget(row)}</div>
        </td>
        <td className="px-4 py-3 align-top text-gray-700">{row.role}</td>
        <td className="px-4 py-3 align-top">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              row.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {row.isActive ? 'active' : 'inactive'}
          </span>
        </td>
        <td className="px-4 py-3 align-top text-xs text-gray-600">{row.ratifiedByName}</td>
        <td className="px-4 py-3 align-top">
          <div className="flex items-center gap-2 justify-end flex-wrap">
            <button
              onClick={runPreview}
              disabled={disabled || !previewAvailable}
              title={previewAvailable ? undefined : 'The backend cannot preview policies yet'}
              className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {busy === 'preview' ? 'Previewing…' : 'Preview'}
            </button>
            {row.isActive ? (
              <button
                onClick={deactivate}
                disabled={disabled}
                className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                {busy === 'deactivate' ? '…' : 'Deactivate'}
              </button>
            ) : (
              <button
                onClick={activate}
                disabled={disabled || !row.activatable}
                title={row.activatable ? undefined : (row.gateMessage ?? undefined)}
                className="text-xs px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50"
              >
                {busy === 'activate' ? '…' : 'Activate'}
              </button>
            )}
          </div>
          {!row.isActive && !row.activatable && row.gateMessage && (
            <p className="text-xs text-gray-400 mt-1 text-right">{row.gateMessage}</p>
          )}
          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mt-1">
              {error}
            </p>
          )}
        </td>
      </tr>
      {preview && (
        <tr>
          <td colSpan={6} className="px-4 py-3 bg-gray-50 border-t border-gray-100">
            <PreviewPanel preview={preview} onClose={() => setPreview(null)} />
          </td>
        </tr>
      )}
    </>
  );
}

export function PreviewPanel({ preview, onClose }: { preview: PreviewData; onClose: () => void }) {
  const c = preview.counters;
  const shown = preview.grants.length;
  return (
    <div className="text-xs text-gray-700 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-gray-800">
          Preview from {time(preview.previewedAt)} (valid for activation until{' '}
          {time(preview.validUntil)})
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
          Close
        </button>
      </div>

      {preview.skipped && (
        <div className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          The sync would <strong>skip</strong> this policy: {preview.skippedText}. Nothing would be
          granted, so it cannot be activated as it is.
        </div>
      )}

      <div>
        Team members found: {c['membersSeen'] ?? 0}
        {(c['membersWithoutUser'] ?? 0) > 0 && (
          <> ({c['membersWithoutUser']} without a user yet, picked up once they have signed in)</>
        )}
        . Grants: <strong>{preview.statusCounts.create}</strong> would be created,{' '}
        {preview.statusCounts.role_change > 0 && (
          <>
            <strong>{preview.statusCounts.role_change}</strong> would change role (the held grant is
            replaced),{' '}
          </>
        )}
        {preview.statusCounts.kept} already in place, {preview.statusCounts.covered} covered by
        another grant
        {(c['roleConflicts'] ?? 0) > 0 && <>, {c['roleConflicts']} role conflicts</>}.
        {preview.statusCounts.other > 0 && (
          <>
            {' '}
            <strong>{preview.statusCounts.other}</strong> more have a result this page does not
            recognise (listed first, as the backend reports them).
          </>
        )}
      </div>

      {preview.targets.length > 0 && (
        <div>
          <div className="font-semibold text-gray-800 mb-1">
            Resources covered ({preview.targets.length})
          </div>
          <ul className="space-y-0.5 max-h-40 overflow-y-auto">
            {preview.targets.map((t) => (
              <li key={`${t.resourceType}:${t.resourceId}`}>
                <span className="font-mono text-gray-500">{t.resourceType}</span>{' '}
                {t.name ?? <span className="font-mono">{t.resourceId}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {shown > 0 && (
        <div>
          <div className="font-semibold text-gray-800 mb-1">
            Grants (
            {shown === preview.grantsTotal ? shown : `first ${shown} of ${preview.grantsTotal}`})
          </div>
          <div className="max-h-64 overflow-y-auto bg-white border border-gray-200 rounded">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium text-gray-600">Member</th>
                  <th className="text-left px-3 py-1.5 font-medium text-gray-600">Resource</th>
                  <th className="text-left px-3 py-1.5 font-medium text-gray-600">Role</th>
                  <th className="text-left px-3 py-1.5 font-medium text-gray-600">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.grants.map((g) => (
                  <tr key={`${g.userId}:${g.resourceType}:${g.resourceId}`}>
                    <td className="px-3 py-1.5 break-all">{g.email ?? g.userId}</td>
                    <td className="px-3 py-1.5 break-words">
                      <span className="font-mono text-gray-500">{g.resourceType}</span>{' '}
                      {g.resourceName ?? <span className="font-mono">{g.resourceId}</span>}
                    </td>
                    <td className="px-3 py-1.5">{g.role}</td>
                    <td className="px-3 py-1.5">{describeResult(g)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
