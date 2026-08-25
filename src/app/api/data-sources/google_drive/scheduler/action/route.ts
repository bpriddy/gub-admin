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
 *                     custom role to include cloudscheduler.jobs.enable
 *                     (which covers both, despite the RPC names). Terraform
 *                     lives in gcp-universal-backend/terraform/drive_poll.tf.
 *
 *   run-now         → fire the gub-drive-sync Cloud Run Job with the same
 *                     mode the drive-poll-<env> scheduler fires today
 *                     (mode='forward-all'). Bypasses Cloud Scheduler
 *                     entirely — an on-demand equivalent of the scheduler's
 *                     next tick. Uses the run.developer grant on the Job,
 *                     not the scheduler role. (Previously fired mode='poll'
 *                     when the scheduler still fired legacy poll; retargeted
 *                     2026-08-24 alongside the scheduler switch to
 *                     forward-sync-v2.)
 *
 * Returns the updated job info for pause/resume (so the UI can flip its
 * state pill without a separate refetch). run-now returns just
 * { status: 'triggered' } — the Cloud Scheduler job's state is unchanged
 * by an on-demand run.
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
    action: z.enum(['pause', 'resume', 'run-now']),
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
    // run-now — matches what the scheduler fires (forward-sync-v2 driver).
    await triggerDriveSyncJob({ mode: 'forward-all' });
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
