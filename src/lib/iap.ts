import { headers } from 'next/headers';

export interface IAPIdentity {
  email: string;
}

/**
 * Extract the IAP-authenticated user identity from request headers.
 * Cloud IAP sets x-goog-authenticated-user-email on every request.
 * Format: "accounts.google.com:user@example.com"
 *
 * In local dev, set IAP_DEV_EMAIL env var to bypass.
 */
export function getIAPIdentity(): IAPIdentity {
  // Local dev bypass
  if (process.env.IAP_DEV_EMAIL) {
    return { email: process.env.IAP_DEV_EMAIL };
  }

  const headersList = headers();
  const raw = headersList.get('x-goog-authenticated-user-email');

  if (!raw) {
    throw new Error('IAP header missing — is this behind Cloud IAP?');
  }

  // Strip "accounts.google.com:" prefix
  const email = raw.includes(':') ? raw.split(':')[1] : raw;

  return { email };
}
