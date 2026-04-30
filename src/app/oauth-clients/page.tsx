/**
 * Legacy redirect — the OAuth Agent Clients surface moved into Settings.
 * Old bookmarks land here and get bounced to /settings/oauth-clients.
 *
 * Safe to delete this stub once we're confident no external links / docs
 * reference /oauth-clients anymore (give it a deprecation cycle first).
 */
import { redirect } from 'next/navigation';

export default function LegacyOAuthClientsRedirect(): never {
  redirect('/settings/oauth-clients');
}
