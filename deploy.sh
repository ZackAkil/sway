#!/bin/bash
# Exit immediately if a command exits with a non-zero status
set -e

if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

PROJECT_ID="${PROJECT_ID:-your-gcp-project-id}"
SERVICE_NAME="${SERVICE_NAME:-sway}"
REGION="${REGION:-us-central1}"

echo "=========================================================="
echo " Sway: Deploying to Google Cloud Run"
echo " Project: $PROJECT_ID"
echo " Service: $SERVICE_NAME"
echo " Region:  $REGION"
echo "=========================================================="

# Trigger the deploy from source command
gcloud run deploy "$SERVICE_NAME" \
    --source . \
    --project="$PROJECT_ID" \
    --region="$REGION" \
    --allow-unauthenticated \
    --max-instances=1 \
    --set-env-vars="HOST_PASSCODE=${HOST_PASSCODE:-}"

echo ""
echo "=========================================================="
echo " Deployment successful!"
echo "=========================================================="
