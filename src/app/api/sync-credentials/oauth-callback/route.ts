/**
 * GET /api/sync-credentials/oauth-callback
 *
 * Google redirects here after the consent screen with `?code=&state=` (or
 * `?error=...` if the user denied). Validates state, exchanges the code,
 * persists the refresh token, and redirects back to the Settings page
 * with a success/error indicator.
 *
 * Critical security path:
 *   1. State token must exist and be unexpired
 *   2. State token must belong to the currently-authenticated operator
 *      (defends against a phished callback URL)
 *   3. State token is deleted before the exchange (single-use)
 *   4. Token exchange happens with our dedicated bot OAuth client_id +
 *      client_secret — Google verifies these against the redirect_uri
 *   5. Refresh token is persisted; existing row for the same bot_name is
 *      replaced (re-authorize semantics)
 *
 * Failure modes redirect to Settings with `?error=<code>` so the page
 * can render a useful message. We never echo Google's raw error
 * descriptions back to the URL — they can be misleading and leak details.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireActor } from '@/lib/actor';
import {
  decodeIdTokenEmail,
  exchangeCodeForTokens,
  getBotOAuthConfig,
  isKnownBot,
  TokenExchangeError,
  type BotName,
} from '@/lib/bot-oauth';

const SETTINGS_PATH = '/settings/sync-credentials';

function redirectToSettings(
  request: NextRequest,
  result: 'just_authorized' | 'error',
  param: string,
): NextResponse {
  // Build the redirect URL relative to gub-admin's origin (not Google's).
  const url = new URL(SETTINGS_PATH, request.url);
  url.searchParams.set(result, param);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  // Require actor — the callback runs in the operator's session, so this
  // should always be present unless someone hand-crafted the URL.
  const actor = await requireActor();
  if ('response' in actor) {
    // Bypass the JSON 403 — redirect to Settings with an error code so
    // the operator sees something coherent.
    return redirectToSettings(request, 'error', 'unauthorized');
  }
  const { actorId } = actor;

  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  // User denied consent or Google reported an error.
  if (error) {
    // Best-effort: delete any state row matching this user (their flow's
    // dead anyway). Don't block on this.
    if (state) {
      await prisma.oAuthStateToken
        .deleteMany({ where: { state, staffId: actorId } })
        .catch(() => undefined);
    }
    return redirectToSettings(request, 'error', 'consent_denied');
  }

  if (!code || !state) {
    return redirectToSettings(request, 'error', 'missing_params');
  }

  // ── State validation ─────────────────────────────────────────────────────

  const stateRow = await prisma.oAuthStateToken.findUnique({
    where: { state },
  });
  if (!stateRow) {
    return redirectToSettings(request, 'error', 'invalid_state');
  }
  if (stateRow.expiresAt.getTime() < Date.now()) {
    // Clean up the stale row (cosmetic — sweeper would handle it eventually).
    await prisma.oAuthStateToken
      .delete({ where: { id: stateRow.id } })
      .catch(() => undefined);
    return redirectToSettings(request, 'error', 'state_expired');
  }
  if (stateRow.staffId !== actorId) {
    // Phishing attempt: someone is finishing a flow they didn't start.
    return redirectToSettings(request, 'error', 'state_user_mismatch');
  }
  if (!isKnownBot(stateRow.botName)) {
    // Defensive — the state row's bot_name should always be valid because
    // start-authorize guards on it. Belt-and-suspenders.
    return redirectToSettings(request, 'error', 'invalid_state');
  }
  const botName = stateRow.botName as BotName;

  // Single-use: delete the state row before doing anything destructive.
  // If the rest of this handler fails, the user just retries from the
  // Settings page (gets a fresh state).
  await prisma.oAuthStateToken.delete({ where: { id: stateRow.id } });

  // ── Token exchange ───────────────────────────────────────────────────────

  const config = getBotOAuthConfig();
  if (!config) {
    // Configuration vanished mid-flow (someone yanked the env). Surface
    // it; rare but concrete failure mode.
    return redirectToSettings(request, 'error', 'oauth_not_configured');
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri: config.redirectUri,
    });
  } catch (err) {
    if (err instanceof TokenExchangeError) {
      return redirectToSettings(request, 'error', 'token_exchange_failed');
    }
    throw err;
  }

  // Pull the bot's actual email from the id_token (not from config). If
  // decode fails, we still proceed but record a synthetic placeholder —
  // missing audit metadata is a small loss compared to losing the credential.
  const googleEmail = decodeIdTokenEmail(tokens.id_token) ?? 'unknown@unknown';

  // ── Persist credential ───────────────────────────────────────────────────
  // Upsert by bot_name. Re-authorize replaces the existing row entirely.
  await prisma.botCredential.upsert({
    where: { botName },
    create: {
      botName,
      googleEmail,
      refreshToken: tokens.refresh_token!, // exchangeCodeForTokens guarantees this
      scopes: tokens.scope?.split(' ').filter(Boolean) ?? [],
      oauthClientId: config.clientId,
      authorizedByStaffId: actorId,
      authorizedAt: new Date(),
      // lastUsedAt left null — gets bumped on first runtime use.
    },
    update: {
      googleEmail,
      refreshToken: tokens.refresh_token!,
      scopes: tokens.scope?.split(' ').filter(Boolean) ?? [],
      oauthClientId: config.clientId,
      authorizedByStaffId: actorId,
      authorizedAt: new Date(),
      lastUsedAt: null, // Reset — re-authorize is a fresh start.
    },
  });

  return redirectToSettings(request, 'just_authorized', botName);
}
