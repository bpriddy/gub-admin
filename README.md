# gub-admin

Admin CMS for the GCP Universal Backend platform. Built with Next.js 14
(App Router), Prisma ORM, and Tailwind CSS. Connects directly to the
shared Cloud SQL PostgreSQL database with `BYPASSRLS` access, gated by
Google Cloud IAP at the network layer.

> **POC Status:** This is part of a working proof of concept across three
> repos. See the [backend docs](https://github.com/bpriddy/gcp-universal-backend/tree/main/docs)
> for comprehensive documentation.

## Features

| Section | Path | Description |
|---------|------|-------------|
| Staff | `/staff` | View and manage staff records, metadata, external IDs |
| Accounts | `/accounts` | Client accounts with change history |
| Campaigns | `/campaigns` | Campaign management with change logs |
| Apps | `/apps` | App registration and permission management |
| App Requests | `/app-access-requests` | Access request review workflow |
| Resourcing | `/resourcing` | Search staff by skills, interests, certifications |
| Data Sources | `/data-sources` | Sync configuration, run history, run details |
| OAuth Clients | `/oauth-clients` | OAuth client management |

## Data Sources Dashboard

The Data Sources section provides visibility into automated data sync:

- **List view** — All configured sources with status, human-readable schedule,
  last sync time, and run counts. Coming-soon sources (Workfront, Google Drive,
  Staff Metadata Import) are dimmed with a badge.
- **Detail view** — Per-source configuration with a friendly dropdown-based
  schedule builder (frequency, day, time) instead of raw cron expressions.
  Includes a run history table with status and counters.
- **Run detail view** — Counter cards (scanned, created, updated, unchanged,
  skipped, errored), pre-rendered summary, changes table with inline diffs,
  skipped entries grouped by reason, and errors table.

## Getting Started

### Prerequisites

- Node.js 20+ (managed via nvm)
- Access to the shared PostgreSQL database

### Setup

```bash
git clone https://github.com/bpriddy/gub-admin.git
cd gub-admin
npm install

# Wire the secret-scan pre-commit hook (required — refuses commit on
# detected API keys, tokens, JSON keys, etc.)
brew install gitleaks        # or see https://github.com/gitleaks/gitleaks#installation
git config core.hooksPath .githooks
```

### Environment

Copy the example and fill in your values:

```bash
cp .env.example .env.local
```

At minimum you'll need `DATABASE_URL`, `GUB_BACKEND_URL`, and (for local
development only) `IAP_DEV_EMAIL` to shortcut past IAP. See `.env.example`
for the full list. `IAP_DEV_EMAIL` only works with `NODE_ENV=development`
on a localhost request — the startup guard in `src/lib/iap-dev-bypass.ts`
refuses to boot if you try to carry it into a deployed service.

### Run locally

```bash
npm run dev
```

Opens on [http://localhost:3001](http://localhost:3001).

### Build

```bash
npm run build
npm start
```

## Tech Stack

- **Next.js 14** — App Router, server components, standalone output
- **Prisma ORM** — Direct database queries from server components
- **Tailwind CSS** — Utility-first styling
- **Zod v4** — Request validation
- **TypeScript** — Strict mode with `exactOptionalPropertyTypes`

## Related Repositories

| Repo | Purpose |
|------|---------|
| [gcp-universal-backend](https://github.com/bpriddy/gcp-universal-backend) | Auth gateway + org data API + sync engines |
| [gub-agent](https://github.com/bpriddy/gub-agent) | ADK agent for Vertex AI Agent Engine / Agentspace |
