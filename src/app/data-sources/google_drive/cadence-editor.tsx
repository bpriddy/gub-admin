'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Mirrors CADENCE_PRESETS keys in the API route. Kept in sync by hand —
// if you add a preset there, add it here too.
const CADENCE_OPTIONS: { value: string; label: string }[] = [
  { value: '1h', label: 'Every 1 hour' },
  { value: '2h', label: 'Every 2 hours' },
  { value: '6h', label: 'Every 6 hours' },
  { value: '12h', label: 'Every 12 hours' },
  { value: '24h', label: 'Daily at 7am ET' },
];

interface Props {
  /** The currently-selected preset, or null if Cloud Scheduler holds a custom cron. */
  current: string | null;
  /** The raw cron expression and time zone from Cloud Scheduler, for the "custom" case. */
  liveSchedule: string;
  liveTimeZone: string;
}

export function CadenceEditor({ current, liveSchedule, liveTimeZone }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(current ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!selected) return;
    setState('saving');
    setError(null);
    try {
      const res = await fetch('/api/data-sources/google_drive/scheduler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cadence: selected }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown; detail?: unknown };
        const detail =
          typeof body.detail === 'string'
            ? body.detail
            : typeof body.error === 'string'
              ? body.error
              : `HTTP ${res.status}`;
        setError(detail);
        setState('error');
        return;
      }
      setState('saved');
      // Refresh the server-rendered page so the status panel reads the
      // newly-saved cron from Cloud Scheduler. "Displayed = deployed."
      router.refresh();
      setTimeout(() => setState('idle'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setState('error');
    }
  }

  const isCustom = current === null;
  const isDirty = selected && selected !== current;

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Polling cadence</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            disabled={state === 'saving'}
          >
            {isCustom && (
              <option value="" disabled>
                Custom: {liveSchedule} {liveTimeZone}
              </option>
            )}
            {CADENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={save}
          disabled={!isDirty || state === 'saving'}
          className={`text-sm px-3 py-1.5 rounded text-white ${
            !isDirty || state === 'saving'
              ? 'bg-gray-300 cursor-not-allowed'
              : 'bg-gray-900 hover:bg-gray-700'
          }`}
        >
          {state === 'saving'
            ? 'Saving…'
            : state === 'saved'
              ? 'Saved'
              : state === 'error'
                ? 'Retry'
                : 'Save'}
        </button>
      </div>
      {state === 'error' && error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}
      <p className="text-xs text-gray-500">
        Saving updates the Cloud Scheduler job directly. The next tick uses
        the new cadence; in-flight syncs are unaffected.
      </p>
    </div>
  );
}
