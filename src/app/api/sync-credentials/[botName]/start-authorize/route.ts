/**
 * POST /api/sync-credentials/[botName]/start-authorize
 *
 * Begin the bot-OAuth consent flow. Generates a state token, persists it
 * (10-min TTL), and returns the Google consent URL the browser should
 * navigate to.
 *
 * The state token binds the eventual callback to this user + this bot.
 * Without it, an attacker who phishes an admin into clicking a crafted
 * callback URL could write a refresh token they control. The callback
 * verifies the state matches the user still in session before doing
 * anything destructive.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import {
  buildAuthorizeUrl,
  generateStateToken,
  getBotOAuthConfig,
  isKnownBot,
  STATE_TOKEN_TTL_MS,
} from '@/lib/bot-oauth';

interface RouteContext {
  params: { botName: string };
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;
  const { actorId } = actor;

  const { botName } = context.params;
  if (!isKnownBot(botName)) {
    return NextResponse.json(
      { error: 'UNKNOWN_BOT', message: `'${botName}' is not a known bot` },
      { status: 400 },
    );
  }

  const config = getBotOAuthConfig();
  if (!config) {
    return NextResponse.json(
      {
        error: 'BOT_OAUTH_NOT_CONFIGURED',
        message:
          'GUB_BOT_OAUTH_CLIENT_ID and GUB_BOT_OAUTH_CLIENT_SECRET must be set ' +
          'in this environment before bots can be authorized. See ' +
          'docs/proposals/bot-oauth-design.md.',
      },
      { status: 500 },
    );
  }

  const state = generateStateToken();

  // Persist the state row before redirecting. The callback's first step is
  // to look this up; if persist fails, we don't redirect to Google at all.
  await prisma.oAuthStateToken.create({
    data: {
      state,
      staffId: actorId,
      botName,
      expiresAt: new Date(Date.now() + STATE_TOKEN_TTL_MS),
    },
  });

  const authorizeUrl = buildAuthorizeUrl(botName, state, {
    clientId: config.clientId,
    redirectUri: config.redirectUri,
  });

  // We could 302 here, but returning the URL lets the client open it in
  // a new tab/incognito reliably (which the UI prompts the admin to do).
  return NextResponse.json({ authorizeUrl });
}
