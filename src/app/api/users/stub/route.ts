import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Pre-create a user stub by email. The user row is created with
// googleSub = null; googleSub is populated and locked on their first
// Google OAuth login.
//
// Note (2026-05-04): the optional `appIds` + `role` fields previously
// pre-granted UserAppPermission rows. That table was removed along with
// the per-app access gate (see remove-app-access-gating.md). Per-app
// authorization now belongs to each consuming app — this endpoint only
// pre-creates the GUB identity stub.

const CreateStubSchema = z.object({
  email:       z.string().email(),
  displayName: z.string().min(1).max(256).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateStubSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { email, displayName } = parsed.data;

  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: 'A user with this email already exists', userId: existing.id },
      { status: 409 },
    );
  }

  const user = await prisma.user.create({
    data: { email, displayName: displayName ?? null, isActive: true },
  });

  return NextResponse.json(user, { status: 201 });
}
