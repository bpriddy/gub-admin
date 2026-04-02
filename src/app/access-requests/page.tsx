'use client';

import { useEffect, useState } from 'react';

interface AccessRequestRow {
  id: string;
  resourceType: string;
  resourceId: string | null;
  requestedRole: string;
  reason: string | null;
  status: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  grantId: string | null;
  createdAt: string;
  user: { id: string; email: string; displayName: string | null } | null;
  reviewedByStaff: { id: string; fullName: string } | null;
}

interface StaffOption { id: string; fullName: string; email: string }

const STATUS_FILTERS = ['pending', 'approved', 'denied', 'all'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const STATUS_BADGE: Record<string, string> = {
  pending:  'bg-yellow-50 text-yellow-700',
  approved: 'bg-green-50 text-green-700',
  denied:   'bg-red-50 text-red-500',
};

function resourceLabel(resourceType: string, resourceId: string | null): string {
  if (resourceId && resourceId !== '00000000-0000-0000-0000-000000000000') {
    return `${resourceType} · ${resourceId.slice(0, 8)}…`;
  }
  return resourceType;
}

export default function AccessRequestsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [requests, setRequests] = useState<AccessRequestRow[]>([]);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [reviewerId, setReviewerId] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});

  async function load() {
    const res = await fetch(`/api/access-requests?status=${statusFilter}`);
    setRequests(await res.json());
  }

  async function loadStaff() {
    const res = await fetch('/api/staff');
    const all: StaffOption[] = await res.json();
    setStaffList(all);
  }

  useEffect(() => { void load(); }, [statusFilter]);
  useEffect(() => { void loadStaff(); }, []);

  async function handleAction(id: string, action: 'approve' | 'deny') {
    if (!reviewerId) {
      alert('Select a reviewer before approving or denying.');
      return;
    }
    setSubmitting((s) => ({ ...s, [id]: true }));
    await fetch(`/api/access-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        reviewedByStaffId: reviewerId,
        reviewNote: reviewNotes[id] || null,
      }),
    });
    setSubmitting((s) => ({ ...s, [id]: false }));
    void load();
  }

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Access Requests</h1>
        <p className="text-sm text-gray-500 mt-1">
          Users submit these when they believe they should have access to a resource they can&apos;t currently see.
          Approving a request automatically creates the corresponding access grant.
        </p>
      </div>

      {/* Reviewer picker — sits above the table, used for all approve/deny actions */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-5 flex items-center gap-3">
        <label className="text-sm text-gray-600 whitespace-nowrap">Reviewing as:</label>
        <select
          value={reviewerId}
          onChange={(e) => setReviewerId(e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1.5 flex-1 max-w-xs"
        >
          <option value="">— select your name —</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>{s.fullName}</option>
          ))}
        </select>
        {!reviewerId && <span className="text-xs text-amber-600">Required to approve or deny</span>}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`text-sm px-4 py-2 -mb-px capitalize ${
              statusFilter === f
                ? 'border-b-2 border-gray-900 text-gray-900 font-medium'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {f}
            {f === 'pending' && pendingCount > 0 && statusFilter !== 'pending' && (
              <span className="ml-1.5 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-gray-400 italic py-6 text-center">
          No {statusFilter === 'all' ? '' : statusFilter} requests.
        </p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div
              key={r.id}
              className={`bg-white border rounded-lg p-4 ${r.status === 'pending' ? 'border-yellow-200' : 'border-gray-200'}`}
            >
              <div className="flex items-start justify-between gap-4">
                {/* Left: request details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded capitalize ${STATUS_BADGE[r.status] ?? 'bg-gray-50 text-gray-500'}`}>
                      {r.status}
                    </span>
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {r.user?.displayName ?? r.user?.email ?? r.user?.id}
                    </span>
                    <span className="text-xs text-gray-400">{r.user?.email}</span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
                    <span>
                      <span className="text-gray-400">Resource: </span>
                      <span className="font-mono">{resourceLabel(r.resourceType, r.resourceId)}</span>
                    </span>
                    <span>
                      <span className="text-gray-400">Role: </span>
                      <span className="font-medium">{r.requestedRole}</span>
                    </span>
                    <span className="text-gray-400">
                      Submitted {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {r.reason && (
                    <p className="mt-2 text-sm text-gray-600 italic">
                      &ldquo;{r.reason}&rdquo;
                    </p>
                  )}

                  {/* Resolved state */}
                  {r.status !== 'pending' && (
                    <div className="mt-2 text-xs text-gray-400">
                      {r.status === 'approved' ? 'Approved' : 'Denied'} by{' '}
                      {r.reviewedByStaff?.fullName ?? '—'}{' '}
                      {r.reviewedAt ? `on ${new Date(r.reviewedAt).toLocaleDateString()}` : ''}
                      {r.reviewNote && (
                        <span className="block mt-1 text-gray-500">Note: {r.reviewNote}</span>
                      )}
                      {r.grantId && (
                        <span className="block mt-1 text-green-600">
                          Grant ID: <span className="font-mono">{r.grantId.slice(0, 8)}…</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Right: actions (pending only) */}
                {r.status === 'pending' && (
                  <div className="flex flex-col gap-2 shrink-0 w-48">
                    <textarea
                      rows={2}
                      value={reviewNotes[r.id] ?? ''}
                      onChange={(e) => setReviewNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                      placeholder="Note (optional)"
                      className="text-xs border border-gray-300 rounded px-2 py-1 resize-none w-full"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => void handleAction(r.id, 'approve')}
                        disabled={submitting[r.id] || !reviewerId}
                        className="flex-1 text-xs px-2 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-40"
                      >
                        {submitting[r.id] ? '…' : 'Approve'}
                      </button>
                      <button
                        onClick={() => void handleAction(r.id, 'deny')}
                        disabled={submitting[r.id] || !reviewerId}
                        className="flex-1 text-xs px-2 py-1.5 border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-40"
                      >
                        {submitting[r.id] ? '…' : 'Deny'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
