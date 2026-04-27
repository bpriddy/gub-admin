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

## Authorization

This app is an **admin-only, break-glass tool** used rarely. The authorization
boundary is **Cloud IAP**, not in-app role checks: only users explicitly
listed in the IAP IAM binding can reach any page or API route. Once past
IAP, every user has full admin capabilities — the app does not gate features
on `User.isAdmin` or `User.role`.

**Source of truth: Terraform.** The list of authorized emails lives in
`gcp-universal-backend/terraform/environments/<env>.tfvars` as the
`admin_emails` variable, applied via `google_iap_web_cloud_run_service_iam_binding`
(see `terraform/gub_admin_iap.tf` in that repo). The binding is
**authoritative** — anyone added via the GCP console without updating the
tfvars file will be revoked on the next `terraform apply`. To grant or
revoke access, edit `admin_emails` and apply.

The `User.isAdmin` and `User.role` columns remain in the Prisma schema for
possible future use, but are no longer editable from this app. The list
view at `/users` still renders them as read-only badges. The PATCH
endpoint at `/api/users` rejects bodies containing either field with a
400 (Zod `.strict()`); any future caller that tries to write them will
fail loud rather than silently no-op.

What this means in practice:

- To grant admin access: add the email to `admin_emails` in the tfvars
  file in the gcp-universal-backend repo, get a PR review, apply.
- To revoke: remove the email from the same file, apply.
- The audit log (`audit_log` table) still records the IAP-resolved Staff
  member behind every write — see `src/lib/actor.ts`.

## Secrets & rotation

Documents secrets/credentials this service uses and how to rotate them.
For company-wide incident response (escalation, post-mortem, comms), see
IT's canonical incident-response doc. This section covers system-specific
actions only.

This service is **deliberately thin** on secrets: authentication is at
the Cloud IAP layer (see [Authorization](#authorization)) and the DB
connection uses Cloud SQL Auth Proxy. The only true secret is the DB
connection string.

### Inventory

| Credential | Where it lives | Issued by | Used for |
|---|---|---|---|
| `DATABASE_URL` | Secret Manager: `gub-admin-db-url-<env>` (e.g. `gub-admin-db-url-dev`) | Self-managed (Cloud SQL) | Direct DB access from server components and API routes (`BYPASSRLS` access) |
| `IAP_DEV_EMAIL` | `.env.local` only — **never** set on a deployed Cloud Run service | N/A — local dev shortcut | Bypasses Cloud IAP locally, authenticating the request as this email. Three-layer guard in `src/lib/iap-dev-bypass.ts` refuses to boot if set with `NODE_ENV=production` or a non-localhost Host header. |
| Cloud SQL connection | Auto-managed via `--add-cloudsql-instances` | GCP | Connects to the shared Cloud SQL instance — no static credentials |
| IAP IAM binding | Managed in **gcp-universal-backend** (`terraform/gub_admin_iap.tf`) | GCP IAP | Authoritative list of users authorized to reach this app |

### Rotation procedures

#### `DATABASE_URL`

**Preconditions.** None — Cloud Run rolling deploy handles the cutover.
If you're rotating the DB password (not just the connection string),
coordinate so old + new revisions don't both have invalid credentials
during the rollout.

**Steps.**
1. Rotate the password in Cloud SQL → Users (the role is named
   `gub_admin` or similar — see Cloud SQL console).
2. Build the new connection string and add a new secret version:
   ```bash
   echo -n 'postgresql://gub_admin:<NEW_PW>@<host>:5432/gub?sslmode=require' \
     | gcloud secrets versions add gub-admin-db-url-<env> --data-file=-
   ```
3. Trigger a redeploy by pushing an empty commit, or re-running the
   latest Cloud Build trigger. Cloud Run resolves `:latest` at deploy
   time, so a new revision picks up the new version.

**Verification.** Open the deployed admin UI, sign in via IAP, navigate
to `/users` (forces a Prisma query). Confirm rows render without errors.

**Cleanup.** Disable the previous secret version after the new revision
has served traffic for 5+ minutes:
```bash
gcloud secrets versions disable <PREV_VERSION> --secret=gub-admin-db-url-<env>
```

### Cut a user off

If a user needs to lose access to gub-admin, follow the [**Cut a user
off** procedure in
gcp-universal-backend](https://github.com/bpriddy/gcp-universal-backend#cut-a-user-off-revoke-admin-access).
Access here is controlled entirely by the IAP IAM binding declared in
that repo's Terraform tree (`terraform/gub_admin_iap.tf`, var
`admin_emails`). There's no in-app role to flip — see
[Authorization](#authorization) for the design rationale.

### What this service does NOT have

- No JWT signing keys (it consumes JWTs verified against
  gcp-universal-backend's JWKS endpoint, not signs them).
- No Google OAuth client secret (consuming apps that need Workspace
  OAuth — work-flows — own that flow; gub-admin only sees its end users
  via Cloud IAP).
- No third-party API keys.

If a future feature adds a secret, add a row to the inventory above
**and** a rotation procedure. Don't ship a secret with no rotation plan.

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
