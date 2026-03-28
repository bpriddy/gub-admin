import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const BatchGrantSchema = z.object({
  userId: z.string().uuid(),
  accountId: z.string().uuid(),
  /** Array of campaign IDs, or "all" to grant access to all campaigns in the account */
  campaignIds: z.union([z.array(z.string().uuid()), z.literal('all')]),
  role: z.enum(['viewer', 'contributor', 'manager', 'admin']).default('viewer'),
  grantedBy: z.string().uuid(),
  expiresAt: z.string().nullable().optional(),
});

async function upsertGrant(opts: {
  userId: string;
  resourceType: string;
  resourceId: string;
  role: string;
  grantedBy: string;
  expiresAt: Date | null;
}) {
  const { userId, resourceType, resourceId, role, grantedBy, expiresAt } = opts;

  const existing = await prisma.accessGrant.findFirst({
    where: { userId, resourceType, resourceId, revokedAt: null },
  });

  if (existing) {
    return prisma.accessGrant.update({
      where: { id: existing.id },
      data: { role, expiresAt },
    });
  }

  return prisma.accessGrant.create({
    data: { userId, resourceType, resourceId, role, grantedBy, expiresAt },
  });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = BatchGrantSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { userId, accountId, campaignIds, role, grantedBy, expiresAt } = parsed.data;
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

  const grants = await Promise.all(
    resources.map(({ resourceType, resourceId }) =>
      upsertGrant({ userId, resourceType, resourceId, role, grantedBy, expiresAt: expiresAtDate })
    )
  );

  return NextResponse.json({ granted: grants.length, grants }, { status: 201 });
}
