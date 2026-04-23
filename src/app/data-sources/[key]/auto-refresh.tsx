'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  /** Poll interval in ms. Default 10_000 (10s). */
  intervalMs?: number;
  /**
   * When false, polling stops (useful on the run detail page once the
   * sync has terminated — no more state changes to catch).
   */
  enabled?: boolean;
}

/**
 * Headless component that calls `router.refresh()` on an interval so a
 * server-rendered page stays in sync with the DB. Uses Next.js's built-in
 * refresh mechanism (re-invokes server components, reconciles the
 * rendered tree) — no manual fetch / state management required.
 *
 * Behaviors:
 *   - Skips the refresh when the tab is backgrounded (document.visibilityState
 *     !== 'visible') so we don't spin up DB work for a tab nobody is looking at.
 *   - Cleans the interval on unmount + when `enabled` flips to false.
 *
 * Renders nothing.
 */
export function AutoRefresh({ intervalMs = 10_000, enabled = true }: Props) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      router.refresh();
    };
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, router]);

  return null;
}
