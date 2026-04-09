'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface SyncButtonProps {
  sourceKey: string;
  /** Compact style for list pages */
  compact?: boolean;
}

export function SyncButton({ sourceKey, compact }: SyncButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'triggering' | 'triggered' | 'error'>('idle');

  async function handleTrigger() {
    setState('triggering');
    try {
      const res = await fetch(`/api/data-sources/${sourceKey}/sync`, {
        method: 'POST',
      });
      if (res.ok) {
        setState('triggered');
        // Poll for completion by refreshing the page after a delay
        setTimeout(() => {
          router.refresh();
        }, 3000);
        // Reset button after a bit
        setTimeout(() => setState('idle'), 8000);
      } else {
        setState('error');
        setTimeout(() => setState('idle'), 4000);
      }
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 4000);
    }
  }

  if (compact) {
    return (
      <button
        onClick={handleTrigger}
        disabled={state === 'triggering' || state === 'triggered'}
        className={`text-xs px-2 py-1 rounded transition-colors ${
          state === 'triggered'
            ? 'bg-green-100 text-green-700 cursor-default'
            : state === 'error'
              ? 'bg-red-100 text-red-700'
              : state === 'triggering'
                ? 'bg-amber-100 text-amber-700 cursor-wait'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
        title="Trigger a sync now"
      >
        {state === 'triggering'
          ? 'Starting...'
          : state === 'triggered'
            ? 'Sync started'
            : state === 'error'
              ? 'Failed'
              : 'Run now'}
      </button>
    );
  }

  return (
    <button
      onClick={handleTrigger}
      disabled={state === 'triggering' || state === 'triggered'}
      className={`text-sm px-4 py-2 rounded transition-colors ${
        state === 'triggered'
          ? 'bg-green-100 text-green-700 cursor-default'
          : state === 'error'
            ? 'bg-red-100 text-red-700 hover:bg-red-200'
            : state === 'triggering'
              ? 'bg-amber-100 text-amber-700 cursor-wait'
              : 'bg-blue-600 text-white hover:bg-blue-700'
      }`}
    >
      {state === 'triggering'
        ? 'Starting sync...'
        : state === 'triggered'
          ? 'Sync started — refreshing...'
          : state === 'error'
            ? 'Sync failed — try again'
            : 'Run sync now'}
    </button>
  );
}
