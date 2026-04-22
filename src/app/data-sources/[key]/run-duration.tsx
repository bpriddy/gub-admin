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
  /** Extra className for the wrapping element. */
  className?: string;
  /**
   * Rendering variant.
   *   'inline' (default) — a single span, sits in table cells / page subtitles.
   *   'big'              — a full-width card with large typography and a
   *                        pulsing indicator while running. Use as a banner
   *                        above the content on pages where the user
   *                        watches the sync progress.
   */
  size?: 'inline' | 'big';
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
export function RunDuration({
  startedAt,
  durationMs,
  status,
  className,
  size = 'inline',
}: Props) {
  const isLive = status === 'running' && durationMs === null;

  // SSR-safe: on the server we have no wallclock, so initialize to null.
  // The client swaps in the live value once useEffect mounts. The wrapping
  // span uses suppressHydrationWarning because the text is deliberately
  // different between server and client — this is React's documented
  // escape hatch for clock-like components.
  const [liveMs, setLiveMs] = useState<number | null>(null);

  useEffect(() => {
    if (!isLive) return;
    const tick = () => setLiveMs(Math.max(0, Date.now() - new Date(startedAt).getTime()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isLive, startedAt]);

  const displayMs = isLive ? liveMs : durationMs;
  const formatted = displayMs === null ? '—' : formatDuration(displayMs);

  if (size === 'big') {
    const label = isLive
      ? 'Running'
      : status === 'success'
        ? 'Completed in'
        : status === 'failed'
          ? 'Failed after'
          : 'Duration';
    const accent = isLive
      ? 'border-amber-200 bg-amber-50'
      : status === 'success'
        ? 'border-green-200 bg-green-50'
        : status === 'failed'
          ? 'border-red-200 bg-red-50'
          : 'border-gray-200 bg-white';
    const textColor = isLive
      ? 'text-amber-900'
      : status === 'success'
        ? 'text-green-900'
        : status === 'failed'
          ? 'text-red-900'
          : 'text-gray-900';

    return (
      <div
        className={`mb-6 border rounded-lg px-6 py-4 flex items-center gap-5 ${accent} ${className ?? ''}`}
      >
        {isLive && (
          <span className="relative flex w-3 h-3" aria-hidden>
            <span className="absolute inset-0 rounded-full bg-amber-400 opacity-75 animate-ping" />
            <span className="relative inline-flex w-3 h-3 rounded-full bg-amber-500" />
          </span>
        )}
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wider text-gray-600 font-medium">
            {label}
          </div>
          <div
            className={`text-4xl font-semibold tabular-nums mt-1 ${textColor}`}
            suppressHydrationWarning
          >
            {formatted}
          </div>
        </div>
      </div>
    );
  }

  // Inline (default) — compact span, used in table cells / subtitles.
  return (
    <span
      className={`tabular-nums ${className ?? ''}`}
      title={isLive ? 'running — live' : undefined}
      suppressHydrationWarning
    >
      {formatted}
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
