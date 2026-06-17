import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
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
  const resources: { resourceType: string; resourceId: string }[] = [
    { resourceType: 'account', resourceId: accountId },
    ...resolvedCampaignIds.map((id) => ({ resourceType: 'campaign', resourceId: id })),
  ];

  const grants = await prisma.$transaction(
    async (tx) => {
      // One round-trip: fetch every existing non-revoked grant for the
      // (user, resource) pairs we're about to upsert. We collapse the
      // per-resource findFirst loop into a single OR-joined findMany so the
      // transaction wall-clock stays O(round-trips), not O(resources).
      const existing = await tx.accessGrant.findMany({
        where: {
          userId,
          revokedAt: null,
          OR: [
            { resourceType: 'account', resourceId: accountId },
            { resourceType: 'campaign', resourceId: { in: resolvedCampaignIds } },
          ],
        },
        select: {
          id: true,
          resourceType: true,
          resourceId: true,
          role: true,
          expiresAt: true,
        },
      });
      const existingByKey = new Map(
        existing.map((e) => [`${e.resourceType}:${e.resourceId}`, e]),
      );

      const toUpdate: typeof existing = [];
      const toCreate: Array<{ id: string; resourceType: string; resourceId: string }> = [];
      for (const r of resources) {
        const found = existingByKey.get(`${r.resourceType}:${r.resourceId}`);
        if (found) {
          toUpdate.push(found);
        } else {
          // Pre-generate the row id so we can include it in createMany AND
          // reference it from the audit_log createMany without an extra
          // SELECT to recover ids.
          toCreate.push({
            id: randomUUID(),
            resourceType: r.resourceType,
            resourceId: r.resourceId,
          });
        }
      }

      const now = new Date();

      // All updates share the same data (role/expires/granter/grantedAt);
      // only the WHERE clause differs by id → one updateMany suffices.
      if (toUpdate.length > 0) {
        await tx.accessGrant.updateMany({
          where: { id: { in: toUpdate.map((r) => r.id) } },
          data: { role, expiresAt: expiresAtDate, grantedBy: actorId, grantedAt: now },
        });
      }

      if (toCreate.length > 0) {
        await tx.accessGrant.createMany({
          data: toCreate.map((r) => ({
            id: r.id,
            userId,
            resourceType: r.resourceType,
            resourceId: r.resourceId,
            role,
            grantedBy: actorId,
            expiresAt: expiresAtDate,
          })),
        });
      }

      const auditEntries = [
        ...toUpdate.map((r) => ({
          action: 'grant_updated',
          entityType: 'access_grant',
          entityId: r.id,
          actorId,
          before: { role: r.role, expiresAt: r.expiresAt },
          after: {
            userId,
            resourceType: r.resourceType,
            resourceId: r.resourceId,
            role,
            expiresAt: expiresAtDate,
          },
        })),
        ...toCreate.map((r) => ({
          action: 'grant_created',
          entityType: 'access_grant',
          entityId: r.id,
          actorId,
          after: {
            userId,
            resourceType: r.resourceType,
            resourceId: r.resourceId,
            role,
            expiresAt: expiresAtDate,
          },
        })),
      ];

      if (auditEntries.length > 0) {
        await tx.auditLog.createMany({ data: auditEntries });
      }

      return [
        ...toUpdate.map((r) => ({ id: r.id })),
        ...toCreate.map((r) => ({ id: r.id })),
      ];
    },
    // Safety ceiling well above any realistic batch. The optimized
    // implementation above is 4 queries regardless of N, so this should
    // never bind in practice — but it guards against unexpected DB
    // latency spikes the way the previous 5s default did not.
    { timeout: 30_000 },
  );

  return NextResponse.json({ granted: grants.length, grants }, { status: 201 });
}
