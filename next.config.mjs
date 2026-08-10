/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Docker — produces a self-contained server.js
  output: 'standalone',
  // Lint is configured but not enforced yet — main has pre-existing findings
  // awaiting a cleanup PR. Without this, `next build` runs ESLint and fails.
  // Remove after the cleanup PR so builds gate on lint again.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
