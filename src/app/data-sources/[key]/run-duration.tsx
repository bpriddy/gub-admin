'use client';

import { useEffect, useState } from 'react';

interface Props {
  /** ISO timestamp of when the run started. */
  startedAt: string;
  /**
   * Final duration in ms. Set only on completed runs (success / failed).
   * For a run still in 'running' state this is always null.
   */
  durationMs: number | null;
  /** 'running' | 'success' | 'failed' (anything else renders static). */
  status: string;
  /** Extra className for the wrapping span. */
  className?: string;
}

/**
 * Renders a sync run's duration.
 *
 *   - Completed runs (success / failed): static `durationMs` value.
 *   - Running runs: live-ticks once a second using wallclock - startedAt.
 *     Uses a 1s interval; cheap at any plausible page size. When the page
 *     refreshes and the run is no longer 'running', the final durationMs
 *     replaces the live value automatically.
 *
 * Intended to be used anywhere a run's duration is displayed. Generic —
 * no source-specific logic, so it slots into every data source.
 */
export function RunDuration({ startedAt, durationMs, status, className }: Props) {
  const isLive = status === 'running' && durationMs === null;

  const [liveMs, setLiveMs] = useState<number>(() =>
    Math.max(0, Date.now() - new Date(startedAt).getTime()),
  );

  useEffect(() => {
    if (!isLive) return;
    const tick = () => setLiveMs(Math.max(0, Date.now() - new Date(startedAt).getTime()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isLive, startedAt]);

  const displayMs = isLive ? liveMs : durationMs;
  if (displayMs === null) return <span className={className}>—</span>;

  return (
    <span className={`tabular-nums ${className ?? ''}`} title={isLive ? 'running — live' : undefined}>
      {formatDuration(displayMs)}
      {isLive && <span aria-hidden className="ml-1 text-amber-500">•</span>}
    </span>
  );
}

/**
 * Human-friendly duration:
 *   < 1s     → '820ms'
 *   < 60s    → '12.3s'
 *   < 1h     → '3m 07s'
 *   >= 1h    → '1h 04m 12s'
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) {
    const tenths = Math.floor((ms % 1000) / 100);
    return `${totalSec}.${tenths}s`;
  }
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}
