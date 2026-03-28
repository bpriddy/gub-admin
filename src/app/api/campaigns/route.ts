import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get('accountId');

  const campaigns = await prisma.campaign.findMany({
    where: accountId ? { accountId } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      account: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(campaigns);
}

const CreateCampaignSchema = z.object({
  accountId: z.string().uuid(),
  name: z.string().min(1),
  status: z.string().default('pitch'),
  budget: z.string().nullable().optional(),
  assetsUrl: z.string().url().nullable().optional(),
  awardedAt: z.string().nullable().optional(),
  liveAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  createdBy: z.string().uuid(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = CreateCampaignSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { awardedAt, liveAt, endsAt, budget, ...rest } = parsed.data;
  const campaign = await prisma.campaign.create({
    data: {
      ...rest,
      budget: budget ? budget : null,
      awardedAt: awardedAt ? new Date(awardedAt) : null,
      liveAt: liveAt ? new Date(liveAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
    },
  });
  return NextResponse.json(campaign, { status: 201 });
}
