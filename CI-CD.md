# CI/CD — GitHub Actions + GCP Workload Identity Federation

This repo has two GitHub Actions workflows:

| Workflow | File | Trigger | What it does |
|---|---|---|---|
| CI | `.github/workflows/ci.yml` | PRs, pushes to `main`/`dev` | `npm ci` → `npx tsc --noEmit` → `next build` (with dummy `DATABASE_URL`) |
| Deploy | `.github/workflows/deploy.yml` | Manual (`workflow_dispatch`) | Build image → push to Artifact Registry → roll the Cloud Run service |

GitHub Actions authenticates to GCP with **Workload Identity Federation (WIF)
via OIDC** — no static service-account keys anywhere.

Current environment values (dev):

- GCP project: `os-test-491819` (project number `843516467880`)
- Region: `us-central1`
- Cloud Run service: `gub-admin-<env>` (dev/staging/prod) — **IAM-gated**
  (`--no-allow-unauthenticated`; IAP/invoker IAM is the gate)
- Artifact Registry repo: `gub-admin`
- Runtime service account: `sa-gub-admin-<env>@os-test-491819.iam.gserviceaccount.com`

## Relationship to Cloud Build

`cloudbuild/<env>.yaml` remains the **configuration source of truth** (env
vars incl. the `NODE_ENV=production` guard, `DATABASE_URL` secret, Cloud SQL
attachment, scaling, IAM posture). The GitHub Actions deploy is
**image-only** — it preserves all of that and refuses to run against an
environment that hasn't been provisioned. Config changes and first-time
provisioning go through `gcloud builds submit --config cloudbuild/<env>.yaml`.

Don't enable the `push:` trigger in `deploy.yml` while the Cloud Build trigger
for the same branch is active — each push would deploy twice. Cut over by
disabling the Cloud Build trigger first.

## One-time GCP setup

### 1. Workload Identity Pool + provider (once per GCP project, shared by all repos)

Skip if another repo already created it (see e.g.
`gcp-universal-backend/CI-CD.md`):

```bash
export PROJECT_ID="os-test-491819"
export PROJECT_NUMBER="843516467880"

gcloud iam workload-identity-pools create "github-actions" \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions"

# GCP requires an attribute condition for providers on the shared GitHub issuer.
gcloud iam workload-identity-pools providers create-oidc "github-actions-provider" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="github-actions" \
  --display-name="GitHub Actions Provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository_owner == 'bpriddy'"
```

### 2. Dedicated deployer service account (this repo)

```bash
export SA_NAME="gha-gub-admin"
export SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create "$SA_NAME" \
  --project="$PROJECT_ID" \
  --display-name="GitHub Actions deployer — gub-admin"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.admin"

# Deploys attach the runtime SA — grant actAs per environment SA.
for env in dev staging prod; do
  gcloud iam service-accounts add-iam-policy-binding \
    "sa-gub-admin-${env}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser" \
    --member="serviceAccount:${SA_EMAIL}"
done
```

### 3. Bind the deployer SA to THIS GitHub repo

```bash
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github-actions/attribute.repository/bpriddy/gub-admin"
```

## GitHub repository variables

Settings → Secrets and variables → Actions → **Variables** (no secrets needed):

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | `os-test-491819` |
| `GCP_PROJECT_NUMBER` | `843516467880` |
| `GCP_REGION` | `us-central1` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/843516467880/locations/global/workloadIdentityPools/github-actions/providers/github-actions-provider` |
| `GCP_SERVICE_ACCOUNT_EMAIL` | `gha-gub-admin@os-test-491819.iam.gserviceaccount.com` |

```bash
REPO=bpriddy/gub-admin
gh variable set GCP_PROJECT_ID -R "$REPO" -b "os-test-491819"
gh variable set GCP_PROJECT_NUMBER -R "$REPO" -b "843516467880"
gh variable set GCP_REGION -R "$REPO" -b "us-central1"
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER -R "$REPO" -b "projects/843516467880/locations/global/workloadIdentityPools/github-actions/providers/github-actions-provider"
gh variable set GCP_SERVICE_ACCOUNT_EMAIL -R "$REPO" -b "gha-gub-admin@os-test-491819.iam.gserviceaccount.com"
```

## Deploying

1. Actions → **Deploy** → Run workflow → pick `dev`, `staging`, or `prod`.
2. The workflow verifies the service exists, builds from the repo
   `Dockerfile` (multi-stage Next.js standalone build; Prisma client is
   generated inside the build), pushes
   `us-central1-docker.pkg.dev/os-test-491819/gub-admin/<service>:<short-sha>`
   (plus `:latest`), then rolls the service.
3. **`prod` deploys at 0% traffic** (mirroring `cloudbuild/prod.yaml`): the new
   revision comes up receiving no traffic so it can be smoke-tested first. The
   run logs print the promotion command — promote when satisfied:
   ```
   gcloud run services update-traffic gub-admin-prod --to-latest --region us-central1 --project os-test-491819
   ```
   `dev` and `staging` promote on deploy.
4. Rollback: re-run Deploy from the last good commit, or shift traffic back
   with `gcloud run services update-traffic`.

## CI notes

- CI mirrors the Cloud Build typecheck step and adds `next build` with the
  same dummy `DATABASE_URL` the Dockerfile uses, so a broken production build
  fails the PR instead of the deploy.
- ESLint + Prettier are now configured in this repo with `lint`, `format`,
  and `format:check` scripts. CI does not enforce them yet — clean up the
  pre-existing findings on main first, then add a lint step to `ci.yml`.
- There is no test script in this repo; when tests land, add them to CI.

## Validation checklist

- [ ] Open a test PR → CI runs and passes.
- [ ] Run Deploy (dev) → auth step exchanges the OIDC token (no key prompt).
- [ ] Image appears in Artifact Registry with the commit's short SHA tag.
- [ ] Service rolls to a new revision and the admin UI loads (through IAP/IAM).
- [ ] `NODE_ENV` on the new revision is still `production` (image-only deploy preserves env).
