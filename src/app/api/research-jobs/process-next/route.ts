/**
 * POST /api/research-jobs/process-next
 *
 * The "worker tick." Cloud Scheduler hits this on a cadence matching
 * Perplexity's Tier 0 rate limit (~12s = 5 rpm). One tick = one full
 * job cycle:
 *   1. Claim one queued job atomically (FOR UPDATE SKIP LOCKED).
 *   2. Call the provider (minutes).
 *   3. Persist the dossier + flip job to completed (or failed).
 *
 * Returns:
 *   { kind: 'idle' }                                        — no work
 *   { kind: 'completed', jobId, dossierId, staffId }        — happy path
 *   { kind: 'failed',    jobId, error, willRetry }          — provider/staff error
 *
 * Auth: IAP-allowlisted to the Cloud Scheduler service account. Phase C
 * wires the Cloud Scheduler job + IAP grant; until then this route is
 * still IAP-gated to the admin set (Cloud Scheduler will 403 until the
 * SA is allowlisted, which is the intended sequencing).
 *
 * Long-running: a happy-path call can take 1–5 minutes (the Perplexity
 * Agent API is sync). Cloud Run's request timeout is configurable up to
 * 60 minutes; default 5 minutes for Next.js routes. If we see timeouts
 * we'll bump the service's `--timeout` flag.
 */
import { NextResponse } from 'next/server';
import { processNextJob } from '@/lib/research/job-runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min; Cloud Run --timeout overrides this.

export async function POST() {
  try {
    const result = await processNextJob();
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error';
    // Don't 5xx for an in-progress job-claim race or transient DB hiccup —
    // Cloud Scheduler will retry on its own. Log and return 200 idle.
    console.error('[research-jobs/process-next] unexpected error', e);
    return NextResponse.json(
      { kind: 'error', message },
      { status: 500 },
    );
  }
}
