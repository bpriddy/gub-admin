/**
 * DELETE /api/data-sources/google_drive/backfill/[id]
 *
 * Cancel a pending backfill request. Marks the row `failed` with an
 * operator-cancellation error message rather than hard-deleting — the
 * row stays in history for audit ("queued, then cancelled" is a real
 * event worth surfacing).
 *
 * Cancellable: PENDING or RUNNING rows. Terminal rows (completed,
 * failed) return 409.
 *
 * Originally only allowed cancelling pending. Extended to running after
 * a real-world case where a Cloud Run Job execution died mid-run (e.g.,
 * task timeout, SIGKILL) without updating the row — left the row stuck
 * in `running` forever, blocking the per-account live-request guard.
 * Stale-recovery (60min) eventually catches it on the next Job
 * invocation, but operator needs immediate UI recovery.
 *
 * Small race accepted: if the cancel lands while the Job IS still
 * working on this row, the Job's eventual update-to-completed could
 * overwrite the cancel. In practice this is rare (cancel intent
 * usually signals "this is hung") and harmless (cursor preserved
 * either way; operator just cancels again if needed).
 *
 * Response:
 *   200 — cancelled, returns updated row
 *   403 — actor not in staff
 *   404 — row doesn't exist
 *   409 — row is terminal (completed, failed)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import { getIAPIdentity } from '@/lib/iap';

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;

  const existing = await prisma.driveBackfillRequest.findUnique({
    where: { id: params.id },
    select: { id: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 });
  }
  if (existing.status !== 'pending' && existing.status !== 'running') {
    return NextResponse.json(
      {
        error: `Cannot cancel a ${existing.status} request`,
        currentStatus: existing.status,
      },
      { status: 409 },
    );
  }
  const wasRunning = existing.status === 'running';

  // Capture the operator's email for the error_message so the audit
  // trail shows WHO cancelled. The staff lookup at the top gives us
  // the actor id; this gives the human-readable identity.
  const { email } = getIAPIdentity();

  const cancelled = await prisma.driveBackfillRequest.update({
    where: { id: params.id },
    data: {
      status: 'failed',
      completedAt: new Date(),
      errorMessage: wasRunning
        ? `cancelled by ${email} (was running — Cloud Run Job execution may still be in flight)`
        : `cancelled by ${email}`,
      // Clear next_attempt_at so any retry-eligible flag is reset
      // (defensive — pending rows shouldn't have one set, but be sure).
      nextAttemptAt: null,
    },
    select: { id: true, status: true, errorMessage: true },
  });

  return NextResponse.json(cancelled);
}
