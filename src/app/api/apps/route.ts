import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

export async function GET() {
  const apps = await prisma.app.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { permissions: true, accessRequests: true } } },
  });
  return NextResponse.json(apps);
}

const CreateAppSchema = z.object({
  appId:        z.string().min(1).max(64).regex(/^[a-z0-9-]+$/, 'appId must be lowercase letters, numbers, and hyphens only'),
  name:         z.string().min(1).max(128),
  description:  z.string().max(512).optional(),
  autoAccess:   z.boolean().default(false),
  dbIdentifier: z.string().max(256).nullable().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateAppSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const existing = await prisma.app.findUnique({ where: { appId: parsed.data.appId } });
  if (existing) return NextResponse.json({ error: 'An app with this appId already exists' }, { status: 409 });

  const app = await prisma.app.create({ data: parsed.data });
  return NextResponse.json(app, { status: 201 });
}
