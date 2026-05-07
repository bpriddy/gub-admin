/**
 * POST /api/sync-credentials/[botName]/test
 *
 * Smoke test: mint an access token from the stored refresh token, call
 * Google's userinfo endpoint, return success/failure to the UI. Intended
 * for the "Test" button on the Settings page so an admin can verify a
 * credential before scheduling a sync.
 *
 * Does NOT bump last_used_at — this is a smoke test, not a real sync. If
 * we bumped, the UI's "last used" affordance would show "just now" any
 * time someone clicked Test, which is misleading.
 *
 * Returns:
 *   200 { ok: true, googleEmail }
 *   404 { ok: false, code: 'NOT_AUTHORIZED' }       — bot has never been authorized
 *   502 { ok: false, code: 'TOKEN_REFRESH_FAILED' } — refresh token rejected by Google
 *                                                     (most likely revoked or expired)
 *   502 { ok: false, code: 'USERINFO_FAILED' }     — refresh worked but userinfo didn't
 */

import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import {
  getBotOAuthConfig,
  isKnownBot,
  mintAccessTokenFromRefresh,
  TokenExchangeError,
} from '@/lib/bot-oauth';

interface RouteContext {
  params: { botName: string };
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const actor = await requireActor();
  if ('response' in actor) return actor.response;

  const { botName } = context.params;
  if (!isKnownBot(botName)) {
    return NextResponse.json(
      { ok: false, code: 'UNKNOWN_BOT', message: `'${botName}' is not a known bot` },
      { status: 400 },
    );
  }

  const config = getBotOAuthConfig();
  if (!config) {
    return NextResponse.json(
      { ok: false, code: 'OAUTH_NOT_CONFIGURED' },
      { status: 500 },
    );
  }

  const row = await prisma.botCredential.findUnique({ where: { botName } });
  if (!row) {
    return NextResponse.json(
      { ok: false, code: 'NOT_AUTHORIZED', message: 'Bot has not been authorized yet' },
      { status: 404 },
    );
  }

  // 1. Mint an access token from the refresh token. If this fails with
  //    invalid_grant, the refresh token is dead and the bot needs re-auth.
  let accessToken: string;
  try {
    const result = await mintAccessTokenFromRefresh(row.refreshToken, {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
    accessToken = result.accessToken;
  } catch (err) {
    const message =
      err instanceof TokenExchangeError ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        code: 'TOKEN_REFRESH_FAILED',
        message:
          'Could not mint an access token from the stored refresh token. ' +
          'Most likely the credential has been revoked or expired — re-authorize.',
        detail: message,
      },
      { status: 502 },
    );
  }

  // 2. Call userinfo to confirm the token actually works.
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable>');
      return NextResponse.json(
        {
          ok: false,
          code: 'USERINFO_FAILED',
          message: `userinfo returned ${res.status}`,
          detail: body.slice(0, 200),
        },
        { status: 502 },
      );
    }
    const userinfo = (await res.json()) as { email?: string };
    return NextResponse.json({
      ok: true,
      botName,
      googleEmail: userinfo.email ?? row.googleEmail,
      // Intentionally NOT echoing the access token, scopes, or anything else
      // that could be used as a credential.
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        code: 'USERINFO_FAILED',
        message: 'Network error calling userinfo',
        detail: String(err).slice(0, 200),
      },
      { status: 502 },
    );
  }
}
