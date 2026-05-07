/**
 * GET /api/sync-credentials — list bots and their authorization state.
 *
 * Returns one row per known bot (directory, drive, groups). Rows that have
 * never been authorized show only the display metadata; rows that have
 * been authorized include googleEmail, scopes, authorizedAt, lastUsedAt,
 * and the staff name of the operator who clicked Authorize.
 *
 * The refresh token itself is NEVER returned. There's no admin-facing
 * "view token" path — credentials enter the DB once via the callback and
 * only leave as ephemeral access tokens to Google.
 *
 * Read-only; lists three rows; rendered in Settings → Sync Credentials.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import {
  isBotOAuthConfigured,
  listBotDisplay,
  scopesForBot,
  type BotName,
} from '@/lib/bot-oauth';

export async function GET() {
  // Even though IAP gates the page itself, the API also requires an actor
  // — same defense-in-depth as the rest of the admin write surface.
  const actor = await requireActor();
  if ('response' in actor) return actor.response;

  const display = listBotDisplay();
  const rows = await prisma.botCredential.findMany({
    where: { botName: { in: display.map((d) => d.botName) } },
    include: {
      authorizedByStaff: { select: { id: true, fullName: true, email: true } },
    },
  });
  const rowByBot = new Map(rows.map((r) => [r.botName, r]));

  const out = display.map((d) => {
    const row = rowByBot.get(d.botName);
    if (!row) {
      // Never authorized.
      return {
        botName: d.botName,
        label: d.label,
        description: d.description,
        scopesNeeded: scopesForBot(d.botName as BotName),
        authorized: false as const,
      };
    }
    return {
      botName: d.botName,
      label: d.label,
      description: d.description,
      scopesNeeded: scopesForBot(d.botName as BotName),
      authorized: true as const,
      googleEmail: row.googleEmail,
      scopesGranted: row.scopes,
      authorizedAt: row.authorizedAt,
      lastUsedAt: row.lastUsedAt,
      authorizedByStaff: row.authorizedByStaff,
      // Surface scope drift as a UI signal — if the bot was authorized
      // with fewer scopes than the code now asks for, it needs re-auth.
      scopeDrift: scopesForBot(d.botName as BotName).some(
        (s) => !row.scopes.includes(s),
      ),
    };
  });

  return NextResponse.json({
    configured: isBotOAuthConfigured(),
    bots: out,
  });
}

