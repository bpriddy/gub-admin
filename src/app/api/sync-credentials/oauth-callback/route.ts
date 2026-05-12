/**
 * GET /api/sync-credentials/oauth-callback
 *
 * Google redirects here after the consent screen with `?code=&state=` (or
 * `?error=...` if the user denied). Validates state, exchanges the code,
 * persists the refresh token, and redirects back to the Settings page
 * with a success/error indicator.
 *
 * ── Deployment requirement: this path MUST be exempt from IAP ──────────────
 *
 * When IAP fronts gub-admin in deployed environments, the bot user's
 * browser (signed into Google as the bot, NOT as an admin) cannot pass
 * IAP — IAP rejects unauthorized identities, and the bot is not
 * authorized to use gub-admin. So Google's redirect to this callback URL
 * would fail before any of our code runs.
 *
 * The fix: configure IAP at the load balancer to exempt this exact path.
 * The route's security gate is the OAuth state token — single-use, 32-byte
 * random, 10-min TTL, server-generated, bound to a real authenticated
 * admin at start-authorize time. IAP on the callback would be
 * redundant; state validation is what matters. This matches industry
 * standard for OAuth 2.0 callbacks (Auth0, Stripe Connect, GitHub OAuth
 * — none of them gate the callback behind a second auth layer).
 *
 * Operator: see docs/proposals/bot-oauth-design.md "Deployment — IAP
 * exemption" for the exact load balancer config.
 *
 * ── Critical security path ─────────────────────────────────────────────────
 *
 *   1. State token must exist in oauth_state_tokens and be unexpired
 *      (proves the flow was started by an authenticated admin within
 *      the last 10 minutes — admin must have passed IAP to hit
 *      start-authorize, which inserted the state row).
 *   2. State token is deleted before the exchange (single-use; defeats
 *      replay).
 *   3. Token exchange happens with our dedicated bot OAuth client_id +
 *      client_secret. Google verifies these against the redirect_uri it
 *      issued the code for; an attacker can't forge a code.
 *   4. Refresh token is persisted; existing row for the same bot_name is
 *      replaced (re-authorize semantics). The audit field
 *      `authorized_by_staff_id` carries the staff who STARTED the flow
 *      (from the state row) — not whoever happens to be in browser
 *      session at callback time.
 *
 * ── What we deliberately don't do ──────────────────────────────────────────
 *
 *   - Verify the IAP identity of the caller via `requireActor()`. Pre-IAP-
 *     exemption, that check made sense (the operator's session would
 *     still be live). Post-IAP-exemption, the caller IS the bot user's
 *     browser; there's no actor identity to read. The state token is
 *     the binding between "an admin started this" and "this callback
 *     completes that flow."
 *   - Verify the request's `Origin` header. Google's redirect doesn't
 *     send one; this is a top-level navigation, not a cross-origin
 *     request.
 *
 * Failure modes redirect to Settings with `?error=<code>` so the page
 * can render a useful message. We never echo Google's raw error
 * descriptions back to the URL — they can be misleading and leak details.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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
  // No IAP-identity check here. This route MUST be exempt from IAP at the
  // load balancer in deployed envs — the bot user's browser cannot pass
  // IAP. Security gate is the state token validated below. See the
  // module docstring "Deployment requirement" section.

  const url = new URL(request.url);
  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  // User denied consent or Google reported an error.
  if (error) {
    // Best-effort cleanup of the (now-dead) state row. State is a unique
    // server-generated random; no staff scoping needed.
    if (state) {
      await prisma.oAuthStateToken
        .deleteMany({ where: { state } })
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
  // Note: we deliberately do NOT verify that some "current actor" matches
  // stateRow.staffId here — there is no actor identity at the callback
  // (IAP is exempt). The state token's existence + freshness + single-use
  // semantics ARE the proof that this is a real flow started by an
  // authenticated admin within the last 10 minutes. The admin's identity
  // is preserved as stateRow.staffId for the audit trail below.

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
  // authorizedByStaffId comes from the state row (set at start-authorize by
  // a verified IAP-authenticated admin), not from any "current actor" at
  // callback time — see the deletion of requireActor() above.
  await prisma.botCredential.upsert({
    where: { botName },
    create: {
      botName,
      googleEmail,
      refreshToken: tokens.refresh_token!, // exchangeCodeForTokens guarantees this
      scopes: tokens.scope?.split(' ').filter(Boolean) ?? [],
      oauthClientId: config.clientId,
      authorizedByStaffId: stateRow.staffId,
      authorizedAt: new Date(),
      // lastUsedAt left null — gets bumped on first runtime use.
    },
    update: {
      googleEmail,
      refreshToken: tokens.refresh_token!,
      scopes: tokens.scope?.split(' ').filter(Boolean) ?? [],
      oauthClientId: config.clientId,
      authorizedByStaffId: stateRow.staffId,
      authorizedAt: new Date(),
      lastUsedAt: null, // Reset — re-authorize is a fresh start.
    },
  });

  return redirectToSettings(request, 'just_authorized', botName);
}
