/**
 * DELETE /api/data-sources/google_drive/backfill/[id]
 *
 * Cancel a pending backfill request. Marks the row `failed` with an
 * operator-cancellation error message rather than hard-deleting — the
 * row stays in history for audit ("queued, then cancelled" is a real
 * event worth surfacing).
 *
 * Only PENDING rows are cancellable. Running rows are not — the Cloud
 * Run Job execution is actively working and cancelling at the DB layer
 * would orphan it. Stuck running rows are handled by the watcher's
 * 60-min stale-recovery on next invocation (reclaimStaleRunning marks
 * them failed and re-queues nothing — it's terminal).
 *
 * Response:
 *   200 — cancelled, returns updated row
 *   403 — actor not in staff
 *   404 — row doesn't exist
 *   409 — row is not in pending state (running, completed, failed)
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
  if (existing.status !== 'pending') {
    return NextResponse.json(
      {
        error: `Cannot cancel a ${existing.status} request`,
        currentStatus: existing.status,
      },
      { status: 409 },
    );
  }

  // Capture the operator's email for the error_message so the audit
  // trail shows WHO cancelled. The staff lookup at the top gives us
  // the actor id; this gives the human-readable identity.
  const { email } = getIAPIdentity();

  const cancelled = await prisma.driveBackfillRequest.update({
    where: { id: params.id },
    data: {
      status: 'failed',
      completedAt: new Date(),
      errorMessage: `cancelled by ${email}`,
      // Clear next_attempt_at so any retry-eligible flag is reset
      // (defensive — pending rows shouldn't have one set, but be sure).
      nextAttemptAt: null,
    },
    select: { id: true, status: true, errorMessage: true },
  });

  return NextResponse.json(cancelled);
}
