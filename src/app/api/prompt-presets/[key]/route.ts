/**
 * /api/prompt-presets/[key] — edit a prompt preset at runtime.
 *
 * Consumers (gub-drive-sync's runPreset) load the row fresh on EVERY LLM
 * call, so a PATCH here is live immediately — including scans in flight.
 * Presets are CREATED by GUB migrations; this route only edits existing
 * rows (no POST/DELETE). The full before/after template goes to audit_log,
 * which doubles as the rollback trail for prompt edits.
 *
 * Concurrency: the editor sends expectedUpdatedAt (the updatedAt of the
 * version it loaded); when the row has moved on we 409 instead of letting
 * one admin's stale save silently revert another's edit. The before
 * snapshot is read INSIDE the same transaction as the update so the audit
 * trail can't misattribute a concurrent edit.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';

const PatchSchema = z
  .object({
    description: z.string().max(2_000).optional(),
    // Trimmed: a pasted trailing space/newline otherwise reaches the Gemini
    // API verbatim and 404s every consuming call for this preset.
    model: z.string().trim().min(1).max(200).optional(),
    // Decimal(3,2) column; LLM temperature range.
    temperature: z.number().min(0).max(2).optional(),
    isActive: z.boolean().optional(),
    template: z.string().trim().min(1, 'template cannot be empty').max(200_000).optional(),
    // Optimistic-concurrency token (ISO timestamp from the loaded row).
    // Optional so scripted callers can force-write; the UI always sends it.
    expectedUpdatedAt: z.string().optional(),
  })
  .strict()
  .refine(
    (d) =>
      d.description !== undefined ||
      d.model !== undefined ||
      d.temperature !== undefined ||
      d.isActive !== undefined ||
      d.template !== undefined,
    { message: 'Must update at least one field' },
  );

// Same placeholder syntax runPreset renders. The variables column is the
// declared variable list for the template — recomputed here whenever the
// template changes so the shared-table invariant holds.
const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function detectVariables(template: string): string[] {
  const names = new Set<string>();
  const re = new RegExp(PLACEHOLDER.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) names.add(m[1]!);
  return Array.from(names);
}

export async function PATCH(request: Request, { params }: { params: { key: string } }) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;
  const { actorId } = actor;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let key: string;
  try {
    key = decodeURIComponent(params.key);
  } catch {
    return NextResponse.json({ error: 'Malformed key' }, { status: 400 });
  }

  const updates: {
    description?: string | null;
    model?: string;
    temperature?: number;
    isActive?: boolean;
    template?: string;
    variables?: string[];
    updatedBy: string;
  } = { updatedBy: actorId };
  if (parsed.data.description !== undefined) {
    updates.description = parsed.data.description.trim() === '' ? null : parsed.data.description;
  }
  if (parsed.data.model !== undefined) updates.model = parsed.data.model;
  if (parsed.data.temperature !== undefined) updates.temperature = parsed.data.temperature;
  if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
  if (parsed.data.template !== undefined) {
    updates.template = parsed.data.template;
    updates.variables = detectVariables(parsed.data.template);
  }

  const result = await prisma.$transaction(async (tx) => {
    // Fetched inside the transaction: the audit `before` snapshot and the
    // concurrency check must describe the row the update actually replaces.
    const existing = await tx.promptPreset.findUnique({ where: { key } });
    if (!existing) return { kind: 'not_found' as const };
    if (
      parsed.data.expectedUpdatedAt !== undefined &&
      existing.updatedAt.toISOString() !== parsed.data.expectedUpdatedAt
    ) {
      return { kind: 'conflict' as const };
    }

    const row = await tx.promptPreset.update({
      where: { id: existing.id },
      data: updates,
    });
    await tx.auditLog.create({
      data: {
        action: 'prompt_preset_updated',
        entityType: 'prompt_preset',
        entityId: row.id,
        actorId,
        // Full template text on both sides: audit_log is the rollback trail
        // for prompt edits (there is no other history).
        before: {
          key: existing.key,
          description: existing.description,
          model: existing.model,
          temperature: Number(existing.temperature),
          isActive: existing.isActive,
          template: existing.template,
        },
        after: {
          key: row.key,
          description: row.description,
          model: row.model,
          temperature: Number(row.temperature),
          isActive: row.isActive,
          template: row.template,
        },
      },
    });
    return { kind: 'updated' as const, row };
  });

  if (result.kind === 'not_found') {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }
  if (result.kind === 'conflict') {
    return NextResponse.json({ error: 'CONFLICT: preset changed since it was loaded' }, { status: 409 });
  }

  // Canonical STORED values (trimmed template, Decimal-rounded temperature)
  // — the editor syncs its form to this, not to what it sent.
  const { row } = result;
  return NextResponse.json({
    key: row.key,
    description: row.description,
    model: row.model,
    temperature: Number(row.temperature),
    isActive: row.isActive,
    template: row.template,
    updatedAt: row.updatedAt.toISOString(),
  });
}
