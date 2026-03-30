#!/usr/bin/env bash
###############################################################################
# setup-gcp.sh  (gub-admin)
#
# One-time GCP resource provisioning for gub-admin.
# Run once per project — after gcp-universal-backend/scripts/setup-gcp.sh
# and setup-cloud-sql.sh have already been run (they provision the shared
# Cloud SQL instance and the baseline IAM / Secret Manager setup).
#
# Usage:
#   ./scripts/setup-gcp.sh <project-id> <region>
#
# Example:
#   ./scripts/setup-gcp.sh my-gcp-project us-central1
###############################################################################
set -euo pipefail

PROJECT_ID="${1:?Usage: $0 <project-id> <region>}"
REGION="${2:?Usage: $0 <project-id> <region>}"
AR_REPO="gub-admin"
ENVS=("dev" "staging" "prod")

echo "Setting up gub-admin GCP resources in project: $PROJECT_ID / region: $REGION"
echo ""

gcloud config set project "$PROJECT_ID"

# ── Enable required APIs ──────────────────────────────────────────────────────
echo "→ Enabling APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  sqladmin.googleapis.com

# ── Artifact Registry repository ─────────────────────────────────────────────
echo "→ Creating Artifact Registry repository: $AR_REPO..."
gcloud artifacts repositories create "$AR_REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="gub-admin container images" \
  2>/dev/null || echo "   (already exists, skipping)"

# ── Per-environment resources ─────────────────────────────────────────────────
for ENV in "${ENVS[@]}"; do
  SERVICE="gub-admin-$ENV"
  SA_NAME="sa-$SERVICE"
  SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

  echo ""
  echo "── Environment: $ENV ─────────────────────────────────────────────────"

  # Service account
  echo "→ Creating service account: $SA_NAME..."
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="gub-admin $ENV runtime" \
    2>/dev/null || echo "   (already exists, skipping)"

  # IAM roles
  echo "→ Granting runtime IAM roles to $SA_NAME..."
  for ROLE in \
    roles/secretmanager.secretAccessor \
    roles/cloudtrace.agent \
    roles/logging.logWriter \
    roles/monitoring.metricWriter \
    roles/cloudsql.client; do
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member="serviceAccount:$SA_EMAIL" \
      --role="$ROLE" \
      --quiet
  done

  # Secret Manager placeholders — DATABASE_URL is written by setup-cloud-sql.sh
  # via the shared gub_$ENV database. If gub-admin needs a dedicated DB user,
  # create a separate gub_admin_$ENV user and store its URL here instead.
  echo "→ Creating Secret Manager secret: gub-admin-db-url-$ENV..."
  gcloud secrets create "gub-admin-db-url-$ENV" \
    --replication-policy=automatic \
    2>/dev/null || echo "   (already exists, skipping)"
done

# ── Cloud Build service account permissions ───────────────────────────────────
echo ""
echo "── Cloud Build permissions ───────────────────────────────────────────────"
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
CB_SA="$PROJECT_NUMBER@cloudbuild.gserviceaccount.com"

echo "→ Granting Cloud Build SA permissions..."
for ROLE in \
  roles/run.admin \
  roles/iam.serviceAccountUser \
  roles/artifactregistry.writer \
  roles/secretmanager.secretAccessor \
  roles/cloudsql.client; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$CB_SA" \
    --role="$ROLE" \
    --quiet
done

# ── Cloud Build triggers ──────────────────────────────────────────────────────
echo ""
echo "── Creating Cloud Build triggers ────────────────────────────────────────"

declare -A BRANCH_MAP
BRANCH_MAP[dev]="^dev$"
BRANCH_MAP[staging]="^staging$"
BRANCH_MAP[prod]="^main$"

for ENV in "${ENVS[@]}"; do
  TRIGGER_NAME="gub-admin-deploy-$ENV"
  echo "→ Creating trigger: $TRIGGER_NAME (branch: ${BRANCH_MAP[$ENV]})..."
  gcloud builds triggers create github \
    --name="$TRIGGER_NAME" \
    --repo-name="gub-admin" \
    --repo-owner="bpriddy" \
    --branch-pattern="${BRANCH_MAP[$ENV]}" \
    --build-config="cloudbuild/$ENV.yaml" \
    --region="$REGION" \
    2>/dev/null || echo "   (trigger $TRIGGER_NAME already exists, skipping)"
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "========================================================================="
echo "  gub-admin setup complete."
echo ""
echo "  Next steps:"
echo ""
echo "  1. Populate gub-admin-db-url-<env> secrets."
echo "     gub-admin connects to the same databases as gcp-universal-backend."
echo "     You can use the same DATABASE_URL, or create a separate read-only"
echo "     DB user per env and store that URL here."
echo ""
echo "     To copy from GUB secrets:"
echo "       for ENV in dev staging prod; do"
echo "         gcloud secrets versions access latest --secret=\"\${ENV}-database-url\" \\"
echo "           | gcloud secrets versions add \"gub-admin-db-url-\${ENV}\" --data-file=-"
echo "       done"
echo ""
echo "  2. Connect gub-admin GitHub repo to Cloud Build (if not already):"
echo "     https://console.cloud.google.com/cloud-build/triggers/connect"
echo ""
echo "  3. Push to dev/staging/main to trigger the first deploy."
echo "========================================================================="
