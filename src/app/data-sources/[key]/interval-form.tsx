'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';

// ── Cron helpers ────────────────────────────────────────────────────────────

const DAYS_OF_WEEK = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: i === 0 ? '12:00 AM' : i < 12 ? `${i}:00 AM` : i === 12 ? '12:00 PM' : `${i - 12}:00 PM`,
}));

const MINUTE_OPTIONS = [
  { value: '0', label: ':00' },
  { value: '15', label: ':15' },
  { value: '30', label: ':30' },
  { value: '45', label: ':45' },
];

function buildCron(interval: string, hour: string, minute: string, dayOfWeek: string): string | null {
  switch (interval) {
    case 'hourly':
      return `${minute} * * * *`;
    case 'daily':
      return `${minute} ${hour} * * *`;
    case 'weekly':
      return `${minute} ${hour} * * ${dayOfWeek}`;
    default:
      return null;
  }
}

function parseCron(cron: string | null): { hour: string; minute: string; dayOfWeek: string } {
  const defaults = { hour: '6', minute: '0', dayOfWeek: '1' };
  if (!cron) return defaults;

  const parts = cron.split(' ');
  if (parts.length < 5) return defaults;

  return {
    minute: parts[0] ?? '0',
    hour: parts[1] === '*' ? '6' : (parts[1] ?? '6'),
    dayOfWeek: parts[4] === '*' ? '1' : (parts[4] ?? '1'),
  };
}

function describeCron(interval: string, hour: string, minute: string, dayOfWeek: string): string {
  const h = Number(hour);
  const m = Number(minute);
  const time = `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  const day = DAYS_OF_WEEK.find((d) => d.value === dayOfWeek)?.label ?? 'Monday';

  switch (interval) {
    case 'hourly':
      return `Every hour at ${String(m).padStart(2, '0')} minutes past`;
    case 'daily':
      return `Every day at ${time}`;
    case 'weekly':
      return `Every ${day} at ${time}`;
    case 'manual':
      return 'Only when triggered manually';
    default:
      return '';
  }
}

// ── Component ───────────────────────────────────────────────────────────────

interface IntervalFormProps {
  sourceKey: string;
  currentInterval: string;
  currentCron: string | null;
  isActive: boolean;
}

export function IntervalForm({ sourceKey, currentInterval, currentCron, isActive }: IntervalFormProps) {
  const router = useRouter();
  const parsed = useMemo(() => parseCron(currentCron), [currentCron]);

  const [interval, setInterval] = useState(currentInterval);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [dayOfWeek, setDayOfWeek] = useState(parsed.dayOfWeek);
  const [active, setActive] = useState(isActive);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const cron = buildCron(interval, hour, minute, dayOfWeek);

  const dirty =
    interval !== currentInterval ||
    cron !== currentCron ||
    active !== isActive;

  const description = describeCron(interval, hour, minute, dayOfWeek);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/data-sources/${sourceKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          syncInterval: interval,
          cronSchedule: cron,
          isActive: active,
        }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-end gap-4 flex-wrap">
        <label className="block">
          <span className="text-xs text-gray-500 block mb-1">Status</span>
          <select
            value={active ? 'active' : 'inactive'}
            onChange={(e) => setActive(e.target.value === 'active')}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-gray-500 block mb-1">Frequency</span>
          <select
            value={interval}
            onChange={(e) => setInterval(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm"
          >
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="manual">Manual only</option>
          </select>
        </label>

        {interval === 'weekly' && (
          <label className="block">
            <span className="text-xs text-gray-500 block mb-1">Day</span>
            <select
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              {DAYS_OF_WEEK.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </label>
        )}

        {(interval === 'daily' || interval === 'weekly') && (
          <label className="block">
            <span className="text-xs text-gray-500 block mb-1">Time</span>
            <div className="flex gap-1">
              <select
                value={hour}
                onChange={(e) => setHour(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm"
              >
                {HOURS.map((h) => (
                  <option key={h.value} value={h.value}>{h.label.replace(':00', '')}</option>
                ))}
              </select>
              <select
                value={minute}
                onChange={(e) => setMinute(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm"
              >
                {MINUTE_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </label>
        )}

        {interval === 'hourly' && (
          <label className="block">
            <span className="text-xs text-gray-500 block mb-1">At minute</span>
            <select
              value={minute}
              onChange={(e) => setMinute(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            >
              {MINUTE_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
        )}

        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className={`text-sm px-3 py-1.5 rounded ${
            dirty
              ? 'bg-gray-900 text-white hover:bg-gray-700'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
        </button>

        {saved && <span className="text-sm text-green-600">Updated</span>}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <span className="text-xs text-gray-400">{description}</span>
        {cron && <span className="text-xs text-gray-300 font-mono">{cron}</span>}
      </div>
    </div>
  );
}
