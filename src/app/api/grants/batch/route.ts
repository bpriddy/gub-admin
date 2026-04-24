import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { requireActor } from '@/lib/actor';

// Note: `grantedBy` is NOT in this schema on purpose. The server resolves
// the acting Staff from the IAP identity (see src/lib/actor.ts). Accepting
// it from the body would let any IAP-authenticated user forge attribution.
const BatchGrantSchema = z.object({
  userId: z.string().uuid(),
  accountId: z.string().uuid(),
  /** Array of campaign IDs, or "all" to grant access to all campaigns in the account */
  campaignIds: z.union([z.array(z.string().uuid()), z.literal('all')]),
  role: z.enum(['viewer', 'contributor', 'manager', 'admin']).default('viewer'),
  expiresAt: z.string().nullable().optional(),
});

interface UpsertResult {
  id: string;
  isNew: boolean;
  previousRole: string | null;
  previousExpiresAt: Date | null;
}

async function upsertGrant(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  opts: {
    userId: string;
    resourceType: string;
    resourceId: string;
    role: string;
    grantedBy: string;
    expiresAt: Date | null;
  },
): Promise<UpsertResult> {
  const { userId, resourceType, resourceId, role, grantedBy, expiresAt } = opts;

  const existing = await tx.accessGrant.findFirst({
    where: { userId, resourceType, resourceId, revokedAt: null },
  });

  if (existing) {
    await tx.accessGrant.update({
      where: { id: existing.id },
      data: { role, expiresAt, grantedBy, grantedAt: new Date() },
    });
    return { id: existing.id, isNew: false, previousRole: existing.role, previousExpiresAt: existing.expiresAt };
  }

  const created = await tx.accessGrant.create({
    data: { userId, resourceType, resourceId, role, grantedBy, expiresAt },
  });
  return { id: created.id, isNew: true, previousRole: null, previousExpiresAt: null };
}

export async function POST(request: Request) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;
  const { actorId } = actor;

  const body = await request.json();
  const parsed = BatchGrantSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { userId, accountId, campaignIds, role, expiresAt } = parsed.data;
  const expiresAtDate = expiresAt ? new Date(expiresAt) : null;

  // Resolve campaign IDs if "all"
  let resolvedCampaignIds: string[];
  if (campaignIds === 'all') {
    const campaigns = await prisma.campaign.findMany({
      where: { accountId },
      select: { id: true },
    });
    resolvedCampaignIds = campaigns.map((c) => c.id);
  } else {
    resolvedCampaignIds = campaignIds;
  }

  // All resources to grant: the account itself + each campaign
  const resources = [
    { resourceType: 'account', resourceId: accountId },
    ...resolvedCampaignIds.map((id) => ({ resourceType: 'campaign', resourceId: id })),
  ];

  const grants = await prisma.$transaction(async (tx) => {
    const results: { id: string }[] = [];

    for (const { resourceType, resourceId } of resources) {
      const result = await upsertGrant(tx, {
        userId,
        resourceType,
        resourceId,
        role,
        grantedBy: actorId,
        expiresAt: expiresAtDate,
      });

      await tx.auditLog.create({
        data: {
          action: result.isNew ? 'grant_created' : 'grant_updated',
          entityType: 'access_grant',
          entityId: result.id,
          actorId,
          ...(result.isNew ? {} : { before: { role: result.previousRole, expiresAt: result.previousExpiresAt } }),
          after: { userId, resourceType, resourceId, role, expiresAt: expiresAtDate },
        },
      });

      results.push({ id: result.id });
    }

    return results;
  });

  return NextResponse.json({ granted: grants.length, grants }, { status: 201 });
}
