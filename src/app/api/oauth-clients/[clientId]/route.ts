import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  _request: Request,
  { params }: { params: { clientId: string } },
) {
  const { clientId } = params;

  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  await prisma.oAuthClient.update({
    where: { clientId },
    data: { isActive: false },
  });

  return new NextResponse(null, { status: 204 });
}

export async function PATCH(
  request: Request,
  { params }: { params: { clientId: string } },
) {
  const { clientId } = params;
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { isActive, redirectUris } = body as { isActive?: boolean; redirectUris?: string[] };

  const data: { isActive?: boolean; redirectUris?: string[] } = {};
  if (typeof isActive === 'boolean') data.isActive = isActive;
  if (Array.isArray(redirectUris) && redirectUris.length > 0) data.redirectUris = redirectUris;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Provide isActive or redirectUris to update' }, { status: 400 });
  }

  const updated = await prisma.oAuthClient.update({
    where: { clientId },
    data,
    select: { id: true, clientId: true, name: true, redirectUris: true, isActive: true, createdAt: true },
  });

  return NextResponse.json(updated);
}
