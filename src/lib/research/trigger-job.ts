/**
 * triggerResearchJob — start the gub-research-worker Cloud Run Job via
 * the Admin API.
 *
 * This is the "enqueue is the trigger" half of the design: after
 * enqueueResearchJobs() inserts rows, it calls this to kick the worker.
 * The Job has no HTTP surface and no Cloud Scheduler — the only ways it
 * starts are this call and the ingestion script's equivalent.
 *
 * Auth: gub-admin's Cloud Run runtime SA. It has `roles/run.developer`
 * scoped to the job resource (granted by the worker's setup-gcp.sh), so
 * GoogleAuth's Application Default Credentials inside Cloud Run are
 * sufficient — no token plumbing, and this never touches an IAP surface
 * (the Admin API is IAM-gated).
 *
 * Concurrency note: if a Job execution is already draining, this starts
 * a second one. That's intentionally NOT guarded — the worker claims
 * rows with SELECT … FOR UPDATE SKIP LOCKED, so concurrent drains split
 * the queue safely (never double-process). Worst case is briefly higher
 * Perplexity concurrency, which the worker's own RESEARCH_MAX_CONCURRENCY
 * bounds per-process. Simpler than a "list executions first" round-trip,
 * matching the deliberately-minimal design.
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

/**
 * Fire-and-return. Resolves once Cloud Run accepts the run request (it
 * does not wait for the Job to finish — Jobs are async by nature).
 * Throws TriggerJobError on misconfig or a non-2xx from the Admin API;
 * the caller decides whether to surface or swallow (enqueue treats a
 * trigger failure as non-fatal — rows are already queued and the next
 * enqueue/manual run will pick them up).
 */
export async function triggerResearchJob(): Promise<void> {
  const project = process.env['GCP_PROJECT_ID'];
  const region = process.env['GCP_REGION'];
  const job = process.env['RESEARCH_JOB_NAME'];
  if (!project || !region || !job) {
    throw new TriggerJobError(
      'GCP_PROJECT_ID / GCP_REGION / RESEARCH_JOB_NAME must be set to trigger the research Job',
    );
  }
  const url =
    `https://run.googleapis.com/v2/projects/${project}` +
    `/locations/${region}/jobs/${job}:run`;
  try {
    const client = await auth().getClient();
    await client.request({ url, method: 'POST' });
  } catch (e) {
    throw new TriggerJobError(
      `Cloud Run jobs:run failed for ${job}: ${(e as Error).message}`,
    );
  }
}
