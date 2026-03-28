import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const UpdateCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.string().optional(),
  budget: z.string().nullable().optional(),
  assetsUrl: z.string().url().nullable().optional(),
  awardedAt: z.string().nullable().optional(),
  liveAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
});

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: params.id },
    include: {
      account: { select: { id: true, name: true } },
      changes: { orderBy: { changedAt: 'desc' }, take: 50 },
    },
  });
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(campaign);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json();
  const parsed = UpdateCampaignSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { awardedAt, liveAt, endsAt, ...rest } = parsed.data;
  const campaign = await prisma.campaign.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(awardedAt !== undefined ? { awardedAt: awardedAt ? new Date(awardedAt) : null } : {}),
      ...(liveAt !== undefined ? { liveAt: liveAt ? new Date(liveAt) : null } : {}),
      ...(endsAt !== undefined ? { endsAt: endsAt ? new Date(endsAt) : null } : {}),
    },
  });
  return NextResponse.json(campaign);
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  await prisma.campaign.delete({ where: { id: params.id } });
  return new NextResponse(null, { status: 204 });
}
