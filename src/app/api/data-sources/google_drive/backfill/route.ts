/**
 * POST /api/data-sources/google_drive/backfill
 *
 * Pattern A enqueue-as-trigger (see project_standalone_job_pattern.md).
 * This handler:
 *   1. Validates the request + actor
 *   2. Writes a drive_backfill_request row (`pending`)
 *   3. Fires the gub-drive-sync Cloud Run Job in `backfill-pending` mode
 *      via the Admin API (triggerDriveSyncJob — mirrors triggerResearchJob)
 *   4. Returns 201 with the row id + trigger status
 *
 * The Job's processBackfillQueue claims the row (SKIP-LOCKED), drains
 * any other pending rows, exits. NO Cloud Scheduler. Trigger failure is
 * non-fatal (row stays pending; operator can re-click or run manually).
 *
 * Request body:
 *   { accountId: string (UUID), scans?: number (default 1, min 1) }
 *
 * Response (201):
 *   { id: string, status: 'pending' }
 *
 * Errors:
 *   400 — malformed body, scans out of range, account has no drive_folder_id
 *   403 — actor not in staff (handled by requireActor)
 *   404 — account doesn't exist
 *   409 — there's already a pending/running request for this account
 *
 * Concurrency: 409 on existing pending/running prevents duplicate queuing
 * if the user double-clicks. The watcher's claim is also idempotent
 * (status='pending' guarded), but the 409 surfaces the right UX feedback.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import { triggerDriveSyncJob, TriggerJobError } from '@/lib/drive-sync/trigger-job';

const BodySchema = z.object({
  accountId: z.string().uuid(),
  scans: z.number().int().min(1).max(50).default(1),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;

  let body: z.infer<typeof BodySchema>;
  try {
    const json = await req.json();
    body = BodySchema.parse(json);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid request body' },
      { status: 400 },
    );
  }

  const account = await prisma.account.findUnique({
    where: { id: body.accountId },
    select: { id: true, driveFolderId: true },
  });
  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }
  if (!account.driveFolderId) {
    return NextResponse.json(
      { error: 'Account has no drive_folder_id — set one before queuing a backfill' },
      { status: 400 },
    );
  }

  const live = await prisma.driveBackfillRequest.findFirst({
    where: {
      accountId: body.accountId,
      status: { in: ['pending', 'running'] },
    },
    select: { id: true, status: true },
  });
  if (live) {
    return NextResponse.json(
      {
        error: `A ${live.status} backfill request already exists for this account`,
        existingRequestId: live.id,
      },
      { status: 409 },
    );
  }

  const created = await prisma.driveBackfillRequest.create({
    data: {
      accountId: body.accountId,
      scans: body.scans,
      requestedBy: actor.actorId,
    },
    select: { id: true, status: true },
  });

  // Pattern A: enqueue is the trigger. Fire the gub-drive-sync Job in
  // backfill-pending mode immediately after writing the row. The Job
  // claims the row (SKIP-LOCKED), drains anything else pending, exits.
  // No Cloud Scheduler in this loop.
  //
  // Trigger failure is non-fatal for the request: the row is queued, so
  // the operator can recover by re-clicking (idempotent — the next
  // trigger picks up the same pending row) or by running
  // `npm run backfill-pending` in gub-drive-sync locally. In dev the
  // GCP env vars aren't set and TriggerJobError fires expectedly —
  // we log it and let the response succeed.
  let triggered = false;
  let triggerError: string | null = null;
  try {
    await triggerDriveSyncJob({ mode: 'backfill-pending' });
    triggered = true;
  } catch (err) {
    triggerError =
      err instanceof TriggerJobError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'unknown trigger error';
    console.warn(
      JSON.stringify({
        msg: 'backfill.trigger_failed',
        requestId: created.id,
        error: triggerError,
      }),
    );
  }

  return NextResponse.json(
    { ...created, triggered, triggerError },
    { status: 201 },
  );
}
