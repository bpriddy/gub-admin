/**
 * Job runner — drives the research_jobs queue.
 *
 * processNextJob() is one full cycle:
 *   1. Claim the next runnable job via SELECT … FOR UPDATE SKIP LOCKED
 *      (atomic — multiple worker invocations can't pick the same row).
 *   2. Flip status=running, attempts++.
 *   3. Build the StaffContext from staff + team_members + staff_external_ids.
 *   4. Call provider.generate(). Minutes, sometimes.
 *   5. UPSERT a staff_research_dossiers row keyed on
 *      (staff_id, provider, preset, prompt_template_version).
 *   6. Flip the job to status=completed with result_dossier_id.
 *
 * Failures: backoff and re-queue for `attempts < MAX_ATTEMPTS`, then
 * status=failed. The route at /api/research-jobs/process-next calls this
 * function once per Cloud Scheduler tick; it's safe to fire many times
 * per minute — SKIP LOCKED guarantees at most one worker holds any
 * given job.
 */
import { prisma } from '@/lib/prisma';
import type { DossierProvider, StaffContext } from './types';
import { PerplexityAgentProvider } from './providers/perplexity-agent.provider';

/** Registry of supported providers. New providers are added here. */
const PROVIDER_FACTORIES: Record<string, () => DossierProvider> = {
  perplexity_agent: () => {
    const apiKey = process.env['PERPLEXITY_API_KEY'];
    if (!apiKey) throw new Error('PERPLEXITY_API_KEY not set in environment');
    return new PerplexityAgentProvider(apiKey);
  },
};

/** Exponential backoff: 1m, 2m, 4m, ... capped at 30m. */
const BACKOFF_BASE_MS = 60 * 1000;
const BACKOFF_MAX_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export type ProcessResult =
  | { kind: 'idle' }
  | { kind: 'completed'; jobId: string; dossierId: string; staffId: string }
  | { kind: 'failed'; jobId: string; error: string; willRetry: boolean };

export async function processNextJob(): Promise<ProcessResult> {
  const claimedJob = await claimNextJob();
  if (!claimedJob) return { kind: 'idle' };

  const factory = PROVIDER_FACTORIES[claimedJob.provider];
  if (!factory) {
    return failJob(claimedJob.id, `unknown provider: ${claimedJob.provider}`, false);
  }

  let provider: DossierProvider;
  try {
    provider = factory();
  } catch (e) {
    // Construction failure (e.g. missing env var) — not retryable.
    return failJob(claimedJob.id, `provider construct failed: ${(e as Error).message}`, false);
  }

  // Build the staff context for the prompt. We hit the DB at run-time
  // rather than caching on the job row because team / external ID
  // membership changes between enqueue and run shouldn't invalidate the
  // job.
  let ctx: StaffContext;
  try {
    ctx = await buildStaffContext(claimedJob.staffId);
  } catch (e) {
    // Staff might have been deleted between enqueue and run.
    return failJob(claimedJob.id, `staff context build failed: ${(e as Error).message}`, false);
  }

  let dossier;
  try {
    dossier = await provider.generate(ctx, {
      preset: claimedJob.preset,
      promptTemplateVersion: claimedJob.promptTemplateVersion,
    });
  } catch (e) {
    const msg = (e as Error).message;
    const willRetry = claimedJob.attempts < MAX_ATTEMPTS;
    return failJob(claimedJob.id, msg, willRetry);
  }

  // Persist the dossier and flip the job to completed in a single
  // transaction so a partial write can't strand the job in `running`.
  const upserted = await prisma.$transaction(async (tx) => {
    const row = await tx.staffResearchDossier.upsert({
      where: {
        staffId_provider_preset_promptTemplateVersion: {
          staffId: claimedJob.staffId,
          provider: claimedJob.provider,
          preset: claimedJob.preset,
          promptTemplateVersion: claimedJob.promptTemplateVersion,
        },
      },
      create: {
        staffId: claimedJob.staffId,
        provider: claimedJob.provider,
        preset: claimedJob.preset,
        promptTemplateVersion: claimedJob.promptTemplateVersion,
        contentMarkdown: dossier.contentMarkdown,
        citations: dossier.citations,
        searchResults: dossier.searchResults,
        usageMetadata: dossier.usageMetadata,
        confidence: dossier.confidence,
      },
      update: {
        contentMarkdown: dossier.contentMarkdown,
        citations: dossier.citations,
        searchResults: dossier.searchResults,
        usageMetadata: dossier.usageMetadata,
        confidence: dossier.confidence,
        generatedAt: new Date(),
      },
    });
    await tx.researchJob.update({
      where: { id: claimedJob.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        resultDossierId: row.id,
        error: null,
      },
    });
    return row;
  });

  return {
    kind: 'completed',
    jobId: claimedJob.id,
    dossierId: upserted.id,
    staffId: claimedJob.staffId,
  };
}

/**
 * Claim atomically via SELECT … FOR UPDATE SKIP LOCKED — Postgres-only
 * pattern that lets concurrent workers race for jobs without locking
 * each other out. Prisma's API doesn't expose SKIP LOCKED, so this drops
 * to raw SQL inside a single transaction with the status flip.
 */
async function claimNextJob() {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM research_jobs
      WHERE status = 'queued'
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;
    if (rows.length === 0) return null;
    const jobId = rows[0]!.id;
    return tx.researchJob.update({
      where: { id: jobId },
      data: {
        status: 'running',
        attempts: { increment: 1 },
        startedAt: new Date(),
      },
    });
  });
}

async function buildStaffContext(staffId: string): Promise<StaffContext> {
  const staff = await prisma.staff.findUniqueOrThrow({
    where: { id: staffId },
    select: {
      id: true,
      fullName: true,
      email: true,
      title: true,
      department: true,
    },
  });
  const [teamMemberships, externalIds] = await Promise.all([
    prisma.teamMember.findMany({
      where: { staffId },
      include: { team: { select: { name: true } } },
    }),
    prisma.staffExternalId.findMany({
      where: { staffId },
      select: { system: true, externalId: true },
    }),
  ]);
  return {
    staffId: staff.id,
    fullName: staff.fullName,
    email: staff.email,
    title: staff.title,
    department: staff.department,
    teamNames: teamMemberships.map((m) => m.team.name).filter((n): n is string => Boolean(n)),
    externalIds: externalIds.map((e) => ({ system: e.system, externalId: e.externalId })),
  };
}

async function failJob(
  jobId: string,
  error: string,
  willRetry: boolean,
): Promise<ProcessResult> {
  if (willRetry) {
    const job = await prisma.researchJob.findUniqueOrThrow({ where: { id: jobId } });
    // Exponential, capped. attempts has already been incremented by the
    // claim step, so attempts=1 → 1m, attempts=2 → 2m, attempts=3 → 4m.
    const backoffMs = Math.min(
      BACKOFF_BASE_MS * Math.pow(2, Math.max(0, job.attempts - 1)),
      BACKOFF_MAX_MS,
    );
    await prisma.researchJob.update({
      where: { id: jobId },
      data: {
        status: 'queued',
        error,
        nextAttemptAt: new Date(Date.now() + backoffMs),
      },
    });
  } else {
    await prisma.researchJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error,
        completedAt: new Date(),
      },
    });
  }
  return { kind: 'failed', jobId, error, willRetry };
}
