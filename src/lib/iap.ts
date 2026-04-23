import { headers } from 'next/headers';
import { resolveDevBypassEmail } from '@/lib/iap-dev-bypass';

export interface IAPIdentity {
  email: string;
}

/**
 * Extract the IAP-authenticated user identity from request headers.
 * Cloud IAP sets `x-goog-authenticated-user-email` on every request.
 * Format: "accounts.google.com:user@example.com".
 *
 * In local development, `resolveDevBypassEmail` may substitute an
 * IAP_DEV_EMAIL value — but only when NODE_ENV=development AND the
 * request Host header is localhost. A startup guard ensures
 * IAP_DEV_EMAIL outside development refuses to boot.
 */
export function getIAPIdentity(): IAPIdentity {
  const headersList = headers();
  const host = headersList.get('host');
  // `host` is "hostname[:port]" — strip the port for the bypass check.
  const hostname = host ? (host.split(':')[0] ?? null) : null;

  const devEmail = resolveDevBypassEmail(hostname);
  if (devEmail) {
    return { email: devEmail };
  }

  const raw = headersList.get('x-goog-authenticated-user-email');
  if (!raw) {
    throw new Error('IAP header missing — is this behind Cloud IAP?');
  }

  // Strip the "accounts.google.com:" prefix IAP prepends.
  const email = raw.includes(':') ? (raw.split(':')[1] ?? raw) : raw;
  return { email };
}
