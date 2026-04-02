import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Pre-create a user stub by email.  The user row is created with googleSub = null;
// googleSub is populated and locked on their first Google OAuth login.
// Optionally pre-grants UserAppPermission for one or more apps.

const CreateStubSchema = z.object({
  email:       z.string().email(),
  displayName: z.string().min(1).max(256).optional(),
  appIds:      z.array(z.string().min(1)).optional(), // optional pre-grant app access
  role:        z.string().default('viewer'),          // role applied to all appIds
});

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateStubSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { email, displayName, appIds, role } = parsed.data;

  const existing = await prisma.user.findFirst({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: 'A user with this email already exists', userId: existing.id },
      { status: 409 },
    );
  }

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { email, displayName: displayName ?? null, isActive: true },
    });

    if (appIds && appIds.length > 0) {
      // Verify all apps exist before creating permissions
      const apps = await tx.app.findMany({
        where: { appId: { in: appIds }, isActive: true },
        select: { appId: true },
      });
      const validAppIds = new Set(apps.map((a) => a.appId));

      await tx.userAppPermission.createMany({
        data: appIds
          .filter((id) => validAppIds.has(id))
          .map((appId) => ({ userId: created.id, appId, role })),
        skipDuplicates: true,
      });
    }

    return created;
  });

  return NextResponse.json(user, { status: 201 });
}
