import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { z } from 'zod';

function sha256(plain: string): string {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

export async function GET() {
  const clients = await prisma.oAuthClient.findMany({
    select: {
      id: true,
      clientId: true,
      name: true,
      redirectUris: true,
      isActive: true,
      createdAt: true,
      _count: { select: { authCodes: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(clients);
}

const CreateClientSchema = z.object({
  name: z.string().min(1).max(128),
  redirectUris: z.array(z.string().url()).min(1),
});

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = CreateClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const clientId = `gub_${crypto.randomBytes(12).toString('hex')}`;
  const clientSecret = crypto.randomBytes(32).toString('base64url');

  const client = await prisma.oAuthClient.create({
    data: {
      clientId,
      clientSecretHash: sha256(clientSecret),
      name: parsed.data.name,
      redirectUris: parsed.data.redirectUris,
    },
  });

  // Return the plaintext secret ONCE — it is never retrievable again
  return NextResponse.json(
    {
      id: client.id,
      clientId: client.clientId,
      clientSecret,   // only returned on creation
      name: client.name,
      redirectUris: client.redirectUris,
      isActive: client.isActive,
      createdAt: client.createdAt,
    },
    { status: 201 },
  );
}
