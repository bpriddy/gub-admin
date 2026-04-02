'use client';

import { useEffect, useState } from 'react';

interface AppAccessRequestRow {
  id: string;
  appId: string;
  reason: string | null;
  status: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  user:            { id: string; email: string; displayName: string | null } | null;
  app:             { appId: string; name: string } | null;
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

export default function AppAccessRequestsPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [requests, setRequests]         = useState<AppAccessRequestRow[]>([]);
  const [staffList, setStaffList]       = useState<StaffOption[]>([]);
  const [reviewerId, setReviewerId]     = useState('');
  const [reviewNotes, setReviewNotes]   = useState<Record<string, string>>({});
  const [submitting, setSubmitting]     = useState<Record<string, boolean>>({});

  async function load() {
    const res = await fetch(`/api/app-access-requests?status=${statusFilter}`);
    setRequests(await res.json());
  }

  useEffect(() => {
    fetch('/api/staff')
      .then((r) => r.json())
      .then(setStaffList);
  }, []);

  useEffect(() => { void load(); }, [statusFilter]);

  async function review(id: string, action: 'approve' | 'deny') {
    if (!reviewerId) return alert('Select a reviewer first');
    setSubmitting((s) => ({ ...s, [id]: true }));
    await fetch(`/api/app-access-requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        reviewedByStaffId: reviewerId,
        reviewNote: reviewNotes[id] ?? null,
      }),
    });
    setSubmitting((s) => ({ ...s, [id]: false }));
    void load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">App access requests</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Users who hit the request-access screen on a gated app. Approving creates a{' '}
          <code className="text-xs bg-gray-100 px-1 rounded">UserAppPermission</code> entry.
        </p>
      </div>

      {/* Reviewer picker */}
      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-500 whitespace-nowrap">Reviewing as</label>
        <select
          value={reviewerId}
          onChange={(e) => setReviewerId(e.target.value)}
          className="text-sm border border-gray-300 rounded px-2 py-1"
        >
          <option value="">— select reviewer —</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>{s.fullName} ({s.email})</option>
          ))}
        </select>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`text-sm px-3 py-1.5 border-b-2 transition-colors capitalize ${
              statusFilter === f
                ? 'border-gray-900 text-gray-900 font-medium'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Request cards */}
      <div className="space-y-3">
        {requests.length === 0 && (
          <p className="text-sm text-gray-400">No {statusFilter === 'all' ? '' : statusFilter} requests.</p>
        )}

        {requests.map((req) => {
          const isPending = req.status === 'pending';
          return (
            <div key={req.id} className="border border-gray-200 rounded-lg bg-white p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {req.user?.displayName ?? req.user?.email ?? req.id}
                    </span>
                    <span className="text-xs text-gray-400">{req.user?.email}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_BADGE[req.status] ?? 'bg-gray-50 text-gray-500'}`}>
                      {req.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Requesting access to{' '}
                    <span className="font-medium text-gray-700">{req.app?.name ?? req.appId}</span>
                    <code className="ml-1 text-xs text-gray-400 bg-gray-50 px-1 rounded">{req.appId}</code>
                  </p>
                  {req.reason && (
                    <p className="text-xs text-gray-500 italic">"{req.reason}"</p>
                  )}
                  <p className="text-xs text-gray-300">
                    Requested {new Date(req.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {isPending ? (
                <div className="space-y-2 pt-1 border-t border-gray-100">
                  <textarea
                    rows={2}
                    placeholder="Review note (optional)"
                    value={reviewNotes[req.id] ?? ''}
                    onChange={(e) => setReviewNotes((n) => ({ ...n, [req.id]: e.target.value }))}
                    className="w-full text-xs border border-gray-200 rounded px-2 py-1 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={!reviewerId || submitting[req.id]}
                      onClick={() => review(req.id, 'approve')}
                      className="text-xs bg-green-600 text-white px-3 py-1.5 rounded disabled:opacity-40 hover:bg-green-700"
                    >
                      {submitting[req.id] ? '…' : 'Approve'}
                    </button>
                    <button
                      disabled={!reviewerId || submitting[req.id]}
                      onClick={() => review(req.id, 'deny')}
                      className="text-xs bg-red-500 text-white px-3 py-1.5 rounded disabled:opacity-40 hover:bg-red-600"
                    >
                      {submitting[req.id] ? '…' : 'Deny'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-1 border-t border-gray-100 text-xs text-gray-400 space-y-0.5">
                  <p>Reviewed by {req.reviewedByStaff?.fullName ?? '—'} on {req.reviewedAt ? new Date(req.reviewedAt).toLocaleDateString() : '—'}</p>
                  {req.reviewNote && <p className="italic">"{req.reviewNote}"</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
