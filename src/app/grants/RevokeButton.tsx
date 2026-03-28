'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RevokeButton({ grantId }: { grantId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRevoke() {
    if (!confirm('Revoke this access grant?')) return;
    setLoading(true);
    // revokedBy should be the current admin staff ID — using a placeholder here.
    // In production this would come from the IAP identity resolved to a staff record.
    const res = await fetch('/api/grants', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grantId, revokedBy: '00000000-0000-0000-0000-000000000000' }),
    });
    setLoading(false);
    if (res.ok) router.refresh();
  }

  return (
    <button
      onClick={handleRevoke}
      disabled={loading}
      className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
    >
      {loading ? '…' : 'Revoke'}
    </button>
  );
}
