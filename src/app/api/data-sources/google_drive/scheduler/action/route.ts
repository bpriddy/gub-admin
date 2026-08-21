/**
 * /api/data-sources/google_drive/scheduler/action — imperative controls
 * for the Drive poll scheduler.
 *
 * Sibling of ../route.ts (the cadence editor's read + update surface).
 * Split into its own file because the semantics are different: this
 * endpoint accepts action verbs, not schedule edits.
 *
 * Actions:
 *   pause / resume  → call Cloud Scheduler's pause / resume RPCs on the
 *                     drive-poll-<env> job. Requires the runtime SA's
 *                     custom role to include cloudscheduler.jobs.{pause,
 *                     resume} — added in the same commit that lands this
 *                     route (see gcp-universal-backend/terraform/
 *                     drive_poll.tf). If the terraform hasn't been
 *                     applied yet, both 403; the UI surfaces the error.
 *
 *   poll-now        → fire the gub-drive-sync Cloud Run Job with
 *                     mode='poll'. Bypasses Cloud Scheduler entirely —
 *                     an on-demand equivalent of what the scheduler
 *                     would do on its next tick. Uses the run.developer
 *                     grant on the Job, not the scheduler role, so this
 *                     works even before the pause/resume terraform
 *                     lands.
 *
 * Returns the updated job info for pause/resume (so the UI can flip its
 * state pill without a separate refetch). Poll-now returns just
 * { status: 'triggered' } — the Cloud Scheduler job's state is unchanged
 * by an on-demand poll.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  pauseDrivePollJob,
  resumeDrivePollJob,
  type DrivePollJobInfo,
} from '@/lib/cloud-scheduler';
import { triggerDriveSyncJob, TriggerJobError } from '@/lib/drive-sync/trigger-job';

const ActionSchema = z
  .object({
    action: z.enum(['pause', 'resume', 'poll-now']),
  })
  .strict();

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
    if (action === 'pause' || action === 'resume') {
      const job: DrivePollJobInfo =
        action === 'pause' ? await pauseDrivePollJob() : await resumeDrivePollJob();
      return NextResponse.json({ action, job });
    }
    // poll-now
    await triggerDriveSyncJob({ mode: 'poll' });
    return NextResponse.json({ action, status: 'triggered' });
  } catch (err) {
    const detail =
      err instanceof TriggerJobError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Unknown error';
    // 403 is the interesting failure mode for pause/resume before the
    // terraform apply lands — surface it as-is so the UI can render a
    // helpful message.
    return NextResponse.json(
      { error: `Failed to ${action}`, detail },
      { status: 502 },
    );
  }
}
