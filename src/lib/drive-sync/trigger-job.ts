/**
 * triggerDriveSyncJob — start the gub-drive-sync Cloud Run Job via the
 * Admin API.
 *
 * Drive sync was extracted from gcp-universal-backend into its own Cloud
 * Run Job (see ../../../../gub-drive-sync). The Job is the only thing
 * that runs the six machine modes — poll, run-full-sync, continue, cron,
 * notify, sweep-expired. The reviewer-facing /review endpoints still
 * live in GUB (browser-reachable surface; Job model can't host it).
 *
 * This helper fires the Job with a per-execution argument override that
 * picks the mode. From gub-admin, the only mode we trigger is
 * 'run-full-sync' (the Sync button). Cloud Scheduler triggers 'poll'
 * separately; the Job itself self-triggers 'continue' at chunk
 * boundaries. We don't expose those modes here.
 *
 * Auth: gub-admin's Cloud Run runtime SA has `roles/run.developer`
 * scoped to the Job resource (granted by gub-drive-sync's setup-gcp.sh).
 * GoogleAuth's ADC inside Cloud Run is sufficient — no token plumbing,
 * and this never touches an IAP surface (the Admin API is IAM-gated).
 *
 * Mirror of src/lib/research/trigger-job.ts, with the body extended to
 * carry argument overrides.
 */
import { GoogleAuth } from 'google-auth-library';

export class TriggerJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TriggerJobError';
  }
}

let cachedAuth: GoogleAuth | null = null;
function auth(): GoogleAuth {
  cachedAuth ??= new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  return cachedAuth;
}

export type DriveSyncMode =
  | 'run-full-sync'
  | 'poll'
  | 'notify'
  | 'sweep-expired'
  // Pattern A enqueue-as-trigger: gub-admin writes a drive_backfill_request
  // row then fires the Job in this mode to drain it. The Job's main.ts
  // dispatches to processBackfillQueue (src/drive/backfill-queue.ts).
  | 'backfill-pending';

export interface TriggerDriveSyncOptions {
  /** Which mode to fire. Default: 'run-full-sync' (the Sync button). */
  mode?: DriveSyncMode;
}

/**
 * Fire-and-return. Resolves once Cloud Run accepts the run request (it
 * does not wait for the Job to finish). Throws TriggerJobError on
 * misconfig or non-2xx from the Admin API.
 */
export async function triggerDriveSyncJob(
  opts: TriggerDriveSyncOptions = {},
): Promise<void> {
  const mode = opts.mode ?? 'run-full-sync';
  const project = process.env['GCP_PROJECT_ID'];
  const region = process.env['GCP_REGION'];
  const job = process.env['DRIVE_SYNC_JOB_NAME'];
  if (!project || !region || !job) {
    throw new TriggerJobError(
      'GCP_PROJECT_ID / GCP_REGION / DRIVE_SYNC_JOB_NAME must be set to trigger the Drive sync Job',
    );
  }
  const url =
    `https://run.googleapis.com/v2/projects/${project}` +
    `/locations/${region}/jobs/${job}:run`;

  // Per-execution argument override. The Job's main.ts dispatches on
  // argv[2] — we set it here so the same image can run any mode.
  const body = {
    overrides: {
      containerOverrides: [
        {
          args: [mode],
        },
      ],
    },
  };

  try {
    const client = await auth().getClient();
    await client.request({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: body,
    });
  } catch (e) {
    throw new TriggerJobError(
      `Cloud Run jobs:run failed for ${job} (mode=${mode}): ${(e as Error).message}`,
    );
  }
}
