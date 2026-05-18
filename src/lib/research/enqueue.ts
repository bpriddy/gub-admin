/**
 * enqueueResearchJobs — insert research_jobs rows, then fire the worker.
 *
 * Called by POST /api/data-sources/[key]/sync when
 * key='perplexity_deep_research' (the Sync button — a human behind IAP).
 * The ingestion script in the gub-research-worker repo does the
 * equivalent itself (direct DB insert + Admin API) — it deliberately
 * does NOT call gub-admin over HTTP, so no machine ever hits the IAP gate.
 *
 * "Enqueue is the trigger": after inserting rows we kick the Cloud Run
 * Job via the Admin API. There is no Cloud Scheduler. Trigger failure is
 * non-fatal — rows are already queued; the next enqueue (or a manual
 * `gcloud run jobs execute`) drains them.
 */
import { prisma } from '@/lib/prisma';
import { DEFAULT_PROMPT_TEMPLATE_VERSION } from './prompt-version';
import { triggerResearchJob } from './trigger-job';

export interface EnqueueOptions {
  staffIds: string[];
  provider?: string;
  preset?: 'deep-research' | 'advanced-deep-research';
  promptTemplateVersion?: string;
  /** If false (default), skip staff that already have a current dossier for this tuple. */
  force?: boolean;
  /** If false, insert rows but don't fire the Job (default true). */
  trigger?: boolean;
}

export interface EnqueueResult {
  enqueued: number;
  skippedExisting: number;
  missing: string[];
  triggered: boolean;
  triggerError?: string;
}

export async function enqueueResearchJobs(opts: EnqueueOptions): Promise<EnqueueResult> {
  const provider = opts.provider ?? 'perplexity_agent';
  const preset = opts.preset ?? 'deep-research';
  const promptTemplateVersion =
    opts.promptTemplateVersion ?? DEFAULT_PROMPT_TEMPLATE_VERSION;
  const force = opts.force ?? false;
  const trigger = opts.trigger ?? true;

  // Verify staff exist; missing IDs returned so the caller can correct.
  const existing = await prisma.staff.findMany({
    where: { id: { in: opts.staffIds } },
    select: { id: true },
  });
  const existingIdsArr = existing.map((s) => s.id);
  const existingIds = new Set(existingIdsArr);
  const missing = opts.staffIds.filter((id) => !existingIds.has(id));

  // Dedup against current dossiers for the same tuple unless force.
  let skipSet = new Set<string>();
  if (!force) {
    const currentDossiers = await prisma.staffResearchDossier.findMany({
      where: {
        staffId: { in: existingIdsArr },
        provider,
        preset,
        promptTemplateVersion,
      },
      select: { staffId: true },
    });
    skipSet = new Set(currentDossiers.map((d) => d.staffId));
  }

  const toEnqueue = existingIdsArr.filter((id) => !skipSet.has(id));

  const result = await prisma.researchJob.createMany({
    data: toEnqueue.map((staffId) => ({
      staffId,
      provider,
      preset,
      promptTemplateVersion,
    })),
  });

  // Fire the worker. Non-fatal: rows are committed; a trigger failure
  // just means the drain is deferred to the next enqueue/manual run.
  let triggered = false;
  let triggerError: string | undefined;
  if (trigger && result.count > 0) {
    try {
      await triggerResearchJob();
      triggered = true;
    } catch (e) {
      triggerError = (e as Error).message;
    }
  }

  return {
    enqueued: result.count,
    skippedExisting: skipSet.size,
    missing,
    triggered,
    ...(triggerError ? { triggerError } : {}),
  };
}
