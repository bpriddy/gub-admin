/**
 * bot-oauth.ts — gub-admin's helper for the bot-OAuth consent flow.
 *
 * Three operations live here:
 *   - buildAuthorizeUrl(botName, state)  — Google's consent URL with our scopes
 *   - exchangeCodeForTokens(code)        — code → { refresh_token, access_token, id_token, email }
 *   - mintAccessTokenFromRefresh(refreshToken) — for the smoke-test endpoint
 *
 * Companion to gcp-universal-backend/src/modules/workspace/bot-creds.ts (the
 * runtime READ side that GUB uses to mint access tokens at sync time). This
 * file is the WRITE side: gub-admin owns the OAuth flow + writes
 * `bot_credentials` rows, GUB backend just reads them later.
 *
 * See gcp-universal-backend/docs/proposals/bot-oauth-design.md for the
 * full design and gcp-universal-backend/docs/proposals/auth-no-dwd.md
 * for the parent decision.
 *
 * Threat-model note: the refresh token written here is the credential. A
 * leaked SA key (the model we're migrating away from) gives domain-wide
 * Workspace API access scoped only by API; a leaked refresh token here
 * only accesses what the bot user has actually been shared on. That
 * delta is the entire point of this work.
 */

import { z } from 'zod';

// ── Closed bot set ──────────────────────────────────────────────────────────
// Mirrored in the migration's CHECK constraint. Adding a new bot is a
// deliberate code+migration change, not a runtime config knob.

export type BotName = 'directory' | 'drive' | 'groups';

const KNOWN_BOTS: ReadonlySet<BotName> = new Set<BotName>(['directory', 'drive', 'groups']);

export function isKnownBot(name: string): name is BotName {
  return KNOWN_BOTS.has(name as BotName);
}

// ── Per-bot scope catalog ───────────────────────────────────────────────────
// What each bot needs to consent to. Defined here, not as runtime config —
// changing scopes means an explicit code change + a re-authorize click.
//
// userinfo.email is included on every bot so we can audit the actual
// authorized account back from the id_token in the callback.

const USERINFO_EMAIL = 'https://www.googleapis.com/auth/userinfo.email';

const BOT_SCOPES: Record<BotName, readonly string[]> = {
  directory: [
    'https://www.googleapis.com/auth/contacts.readonly',
    'https://www.googleapis.com/auth/directory.readonly',
    USERINFO_EMAIL,
  ],
  drive: [
    // Drive listing + binary downloads (PDFs, Word, images, etc.) via
    // files.get?alt=media.
    'https://www.googleapis.com/auth/drive.readonly',
    // Read structured content of Google-native files via the dedicated
    // Workspace APIs (documents.get, presentations.get,
    // spreadsheets.values.batchGet). The Drive `files.export` path is
    // not the canonical read path for these and is subject to a
    // separate DLP "no export" policy — see
    // feedback_use_conventional_documented_apis.md.
    'https://www.googleapis.com/auth/documents.readonly',
    'https://www.googleapis.com/auth/presentations.readonly',
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    // Drive Activity API — read events (CREATE / EDIT / MOVE / DELETE /
    // COMMENT / etc.) on items the bot can see. Required for the
    // historical-replay backfill model: lets us ask "what changed in
    // this drive on day D" without walking every file's revisions list.
    // Mirror this scope in gub-bot-oauth/src/bots.ts.
    'https://www.googleapis.com/auth/drive.activity.readonly',
    USERINFO_EMAIL,
  ],
  groups: [
    'https://www.googleapis.com/auth/admin.directory.group.readonly',
    'https://www.googleapis.com/auth/admin.directory.group.member.readonly',
    USERINFO_EMAIL,
  ],
};

export function scopesForBot(botName: BotName): readonly string[] {
  return BOT_SCOPES[botName];
}

// ── Display metadata (for the Settings UI) ──────────────────────────────────

export interface BotDisplay {
  botName: BotName;
  label: string;
  description: string;
}

const BOT_DISPLAY: Record<BotName, BotDisplay> = {
  directory: {
    botName: 'directory',
    label: 'Directory (contacts) sync',
    description:
      'Read access to the Workspace directory. Used by the staff sync to pull names, emails, titles, and departments.',
  },
  drive: {
    botName: 'drive',
    label: 'Drive sync',
    description:
      'Read-only access to client/campaign Drive folders shared with the bot user. Used by the document scanner.',
  },
  groups: {
    botName: 'groups',
    label: 'Groups sync',
    description:
      'Read access to Workspace groups and their members. Used by the team-membership sync. Note: Admin SDK requires the bot user to have a limited admin role.',
  },
};

export function listBotDisplay(): readonly BotDisplay[] {
  return Object.values(BOT_DISPLAY);
}

// ── Env access ──────────────────────────────────────────────────────────────
// Optional config — if not set, the Settings page surfaces a configuration
// notice instead of letting the admin click Authorize.

export function getBotOAuthConfig(): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} | null {
  const clientId = process.env.GUB_BOT_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GUB_BOT_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // Prefer an explicit base URL. Falls back to the request-derived host in
  // route handlers (see resolveRedirectUri) — but explicit is safer behind
  // a load balancer that strips Host.
  const baseUrl = process.env.NEXT_PUBLIC_GUB_ADMIN_URL;
  if (!baseUrl) {
    throw new Error(
      'NEXT_PUBLIC_GUB_ADMIN_URL must be set when bot OAuth client is configured. ' +
        'It must match the redirect URI registered in the OAuth client.',
    );
  }
  // Trim trailing slash so we can concatenate the path safely.
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return {
    clientId,
    clientSecret,
    redirectUri: `${cleanBase}/api/sync-credentials/oauth-callback`,
  };
}

export function isBotOAuthConfigured(): boolean {
  return Boolean(
    process.env.GUB_BOT_OAUTH_CLIENT_ID && process.env.GUB_BOT_OAUTH_CLIENT_SECRET,
  );
}

// ── URL builders ────────────────────────────────────────────────────────────

/**
 * Construct the Google OAuth consent URL the user is redirected to.
 *
 * `access_type=offline` + `prompt=consent` — the prompt=consent is required
 * to be sure we get a refresh token even on re-auth. Without it, Google
 * sometimes returns a fresh access token but no refresh token (when the
 * user has already consented once); we ALWAYS want a fresh refresh token
 * because re-authorize is also our rotation path.
 *
 * `include_granted_scopes=false` — don't merge in scopes from prior grants.
 * Each bot is its own grant; we want the new consent to be exactly the
 * scopes we asked for, no more.
 */
export function buildAuthorizeUrl(
  botName: BotName,
  state: string,
  config: { clientId: string; redirectUri: string },
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: scopesForBot(botName).join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ── Token endpoint exchange ─────────────────────────────────────────────────

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(), // Required by us; re-checked downstream.
  id_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
  token_type: z.string(),
});

export type GoogleTokenResponse = z.infer<typeof TokenResponseSchema>;

export class TokenExchangeError extends Error {
  readonly httpStatus: number;
  constructor(message: string, httpStatus = 502) {
    super(message);
    this.name = 'TokenExchangeError';
    this.httpStatus = httpStatus;
  }
}

/**
 * Exchange the authorization code from the OAuth callback for tokens.
 * Returns the full token response. Throws TokenExchangeError on any
 * non-2xx, malformed JSON, or missing refresh_token.
 *
 * The caller (the callback handler) is responsible for parsing the
 * id_token and persisting the refresh_token.
 */
export async function exchangeCodeForTokens(
  code: string,
  config: { clientId: string; clientSecret: string; redirectUri: string },
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    // Don't echo the full body — Google's error responses can include
    // the exchange details. Truncate.
    const snippet = text.slice(0, 200);
    throw new TokenExchangeError(
      `Google token endpoint returned ${res.status}: ${snippet}`,
      502,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TokenExchangeError('Token endpoint returned non-JSON', 502);
  }
  const result = TokenResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new TokenExchangeError(
      `Token endpoint returned malformed response: ${result.error.message}`,
      502,
    );
  }
  if (!result.data.refresh_token) {
    // We always pass prompt=consent in the authorize URL, so this shouldn't
    // happen. If it does, it's a Google-side anomaly worth surfacing.
    throw new TokenExchangeError(
      'Token endpoint returned no refresh_token (prompt=consent should have forced one). ' +
        'Try again, or check the OAuth client configuration.',
      502,
    );
  }
  return result.data;
}

/**
 * For the smoke-test endpoint: exchange a stored refresh token for a fresh
 * access token via Google's token endpoint. Returns the access token + its
 * lifetime. Throws TokenExchangeError on any failure (caller surfaces the
 * 'invalid_grant' case as "credential needs re-authorize" in the UI).
 */
export async function mintAccessTokenFromRefresh(
  refreshToken: string,
  config: { clientId: string; clientSecret: string },
): Promise<{ accessToken: string; expiresInSec: number }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new TokenExchangeError(
      `Google token endpoint (refresh) returned ${res.status}: ${text.slice(0, 200)}`,
      502,
    );
  }
  const parsed = JSON.parse(text) as { access_token?: string; expires_in?: number };
  if (!parsed.access_token || !parsed.expires_in) {
    throw new TokenExchangeError('Refresh response missing access_token or expires_in', 502);
  }
  return { accessToken: parsed.access_token, expiresInSec: parsed.expires_in };
}

// ── id_token decoding (for capturing the bot's actual email) ────────────────
// We don't VERIFY the id_token signature here — Google just minted it for us
// in the same response, on the same TLS connection. We just decode the
// payload to extract the email claim.

const IdTokenPayloadSchema = z.object({
  email: z.string().email(),
  email_verified: z.boolean().optional(),
  sub: z.string(),
});

/**
 * Decode the id_token's payload (no verification — we just got it from
 * Google in the same response). Returns null if anything is malformed,
 * which the caller treats as "use the OAuth client_id as the email
 * placeholder" rather than failing the whole flow.
 */
export function decodeIdTokenEmail(idToken: string | undefined): string | null {
  if (!idToken) return null;
  const parts = idToken.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    // Base64URL → base64 → utf-8 string → JSON.
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(padded, 'base64').toString('utf-8');
    const payload = JSON.parse(json) as unknown;
    const result = IdTokenPayloadSchema.safeParse(payload);
    if (!result.success) return null;
    return result.data.email;
  } catch {
    return null;
  }
}

// ── State token utilities ──────────────────────────────────────────────────

export const STATE_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Generate a cryptographically random state token. 32 bytes hex-encoded
 * gives 64 chars / 256 bits — well past collision concerns and resists
 * guessing.
 */
export function generateStateToken(): string {
  // Defer the import so this file stays import-light for tests.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('node:crypto') as typeof import('node:crypto');
  return crypto.randomBytes(32).toString('hex');
}
