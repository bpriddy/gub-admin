/**
 * Legacy redirect — the CORS allow-list folded into the consolidated
 * Trusted Apps registry. Old bookmarks land here and get bounced to
 * /settings/trusted-apps.
 *
 * Safe to delete this stub once we're confident no external links / docs
 * reference /settings/cors-origins anymore (give it a deprecation cycle
 * first).
 */
import { redirect } from 'next/navigation';

export default function LegacyCorsOriginsRedirect(): never {
  redirect('/settings/trusted-apps');
}
