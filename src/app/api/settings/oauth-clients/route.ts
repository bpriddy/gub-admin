/**
 * /api/settings/oauth-clients — list + create OAuth Agent Clients.
 *
 * Replaces the older /api/oauth-clients endpoints. The settings-namespaced
 * version mirrors /api/settings/cors-origins:
 *   - requireActor() resolves the IAP-authenticated Staff member, who is
 *     attributed in the audit log entry.
 *   - The client_secret returned on POST is the only time it ever appears
 *     in plaintext — only the SHA-256 is persisted.
 *   - Validation goes through src/lib/oauth-client-validation.ts (rejects
 *     wildcards, query/fragment, http://non-localhost, malformed URLs).
 */
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import { validateClientName, validateRedirectUris } from '@/lib/oauth-client-validation';

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
      updatedAt: true,
      _count: { select: { authCodes: true, pendingAuths: true } },
    },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json(clients);
}

const CreateSchema = z
  .object({
    name: z.string().min(1),
    redirectUris: z.array(z.string()).min(1),
  })
  .strict();

export async function POST(request: Request) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;
  const { actorId } = actor;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const nameResult = validateClientName(parsed.data.name);
  if (!nameResult.ok) {
    return NextResponse.json({ error: 'INVALID_NAME', reason: nameResult.reason }, { status: 400 });
  }

  const urisResult = validateRedirectUris(parsed.data.redirectUris);
  if (!urisResult.ok) {
    return NextResponse.json(
      { error: 'INVALID_REDIRECT_URIS', reason: urisResult.reason },
      { status: 400 },
    );
  }

  const clientId = `gub_${crypto.randomBytes(12).toString('hex')}`;
  const clientSecret = crypto.randomBytes(32).toString('base64url');

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.oAuthClient.create({
      data: {
        clientId,
        clientSecretHash: sha256(clientSecret),
        name: nameResult.normalized,
        redirectUris: urisResult.normalized,
      },
    });
    await tx.auditLog.create({
      data: {
        action: 'oauth_client_created',
        entityType: 'oauth_client',
        entityId: row.id,
        actorId,
        after: {
          clientId: row.clientId,
          name: row.name,
          redirectUris: row.redirectUris,
          isActive: row.isActive,
        },
      },
    });
    return row;
  });

  // Return the plaintext secret ONCE — it is never retrievable again.
  return NextResponse.json(
    {
      id: created.id,
      clientId: created.clientId,
      clientSecret,
      name: created.name,
      redirectUris: created.redirectUris,
      isActive: created.isActive,
      createdAt: created.createdAt,
    },
    { status: 201 },
  );
}
