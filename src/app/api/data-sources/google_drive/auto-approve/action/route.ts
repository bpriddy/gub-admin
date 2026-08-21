/**
 * /api/data-sources/google_drive/auto-approve/action
 *
 * Sibling of the poll scheduler action route. Three imperative verbs
 * for the dev-only auto-approve toggle:
 *
 *   pause / resume  → Cloud Scheduler pause/resume on drive-auto-
 *                     approve-<env>. Off = paused; on = enabled. This
 *                     IS the toggle.
 *
 *   approve-now     → Fire the GUB endpoint directly (bypasses the
 *                     scheduler). One-off pass over the pending pile
 *                     without waiting for the next 15-min tick. Useful
 *                     right after toggling on, or when you want a
 *                     visible result immediately.
 *
 * Returns the updated scheduler job for pause/resume, and the
 * autoApproveAllPending result payload for approve-now.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  pauseDriveAutoApproveJob,
  resumeDriveAutoApproveJob,
} from '@/lib/cloud-scheduler';

const ActionSchema = z
  .object({
    action: z.enum(['pause', 'resume', 'approve-now']),
  })
  .strict();

/**
 * Fire the GUB auto-approve endpoint using the runtime SA's identity.
 * Same fetch shape as the trigger-job helpers — plain server-side
 * HTTPS. GUB is --allow-unauthenticated in dev so no bearer token
 * needed today; add one here when GUB tightens.
 */
async function callGubAutoApprove(): Promise<{
  ok: boolean;
  status: number;
  body: unknown;
}> {
  const gubUrl =
    process.env['GUB_BACKEND_URL'] ??
    process.env['NEXT_PUBLIC_GUB_URL'] ??
    'http://localhost:3000';
  const res = await fetch(
    `${gubUrl}/integrations/google-drive/auto-approve-all-pending`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    },
  );
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = ActionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { action } = parsed.data;

  try {
    if (action === 'pause') {
      const job = await pauseDriveAutoApproveJob();
      return NextResponse.json({ action, job });
    }
    if (action === 'resume') {
      const job = await resumeDriveAutoApproveJob();
      return NextResponse.json({ action, job });
    }
    // approve-now
    const result = await callGubAutoApprove();
    if (!result.ok) {
      // Surface GUB's error verbatim — this is the common failure mode
      // (AUTO_APPROVE_AS_STAFF_ID missing/invalid on GUB) that operators
      // will actually hit. Its detail line tells them exactly what to fix.
      return NextResponse.json(
        {
          error: `GUB auto-approve returned ${result.status}`,
          detail: result.body,
        },
        { status: result.status >= 400 && result.status < 500 ? result.status : 502 },
      );
    }
    return NextResponse.json({ action, result: result.body });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to ${action}`, detail },
      { status: 502 },
    );
  }
}
