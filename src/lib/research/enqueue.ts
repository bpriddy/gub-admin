/**
 * enqueueResearchJobs — the shared implementation behind:
 *   - POST /api/research-jobs/enqueue (direct API)
 *   - POST /api/data-sources/[key]/sync (when key='perplexity_deep_research')
 *
 * Kept as a pure function so we don't HTTP-loop to ourselves when the
 * sync-button proxy hands off.
 */
import { prisma } from '@/lib/prisma';
import { TALENT_DOSSIER_V1_VERSION } from './prompt-templates/talent-dossier-v1';

export interface EnqueueOptions {
  staffIds: string[];
  provider?: string;
  preset?: 'deep-research' | 'advanced-deep-research';
  promptTemplateVersion?: string;
  /** If false (default), skip staff that already have a current dossier for this tuple. */
  force?: boolean;
}

export interface EnqueueResult {
  enqueued: number;
  skippedExisting: number;
  missing: string[];
}

export async function enqueueResearchJobs(opts: EnqueueOptions): Promise<EnqueueResult> {
  const provider = opts.provider ?? 'perplexity_agent';
  const preset = opts.preset ?? 'deep-research';
  const promptTemplateVersion = opts.promptTemplateVersion ?? TALENT_DOSSIER_V1_VERSION;
  const force = opts.force ?? false;

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

  return {
    enqueued: result.count,
    skippedExisting: skipSet.size,
    missing,
  };
}
