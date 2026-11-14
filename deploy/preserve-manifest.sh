#!/usr/bin/env bash
# A workflow rerun must not assign a new digest to an already released revision.
set -euo pipefail
: "${GITHUB_REPOSITORY:?}" "${GITHUB_RUN_ID:?}" "${REVISION:?}" "${GITHUB_OUTPUT:?}" "${IMAGE_REPOSITORY:?}"
mkdir -p publication
runs="$(gh api "repos/$GITHUB_REPOSITORY/actions/workflows/ci.yml/runs?event=push&branch=main&head_sha=$REVISION&per_page=100" \
  --jq '.workflow_runs[] | select(.conclusion == "success" or (.id | tostring) == env.GITHUB_RUN_ID) | .id')"
for run in $runs; do
  artifact="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$run/artifacts" \
    --jq '.artifacts[] | select(.name == "deployment-manifest" and .expired == false) | .id' | head -1)"
  [ -n "$artifact" ] || continue
  gh api "repos/$GITHUB_REPOSITORY/actions/artifacts/$artifact/zip" > publication/existing.zip
  unzip -p publication/existing.zip deployment.json > publication/deployment.json
  jq -e --arg revision "$REVISION" --arg prefix "$IMAGE_REPOSITORY@sha256:" '
    (keys == ["images", "revision"]) and .revision == $revision
    and (.images | keys) == ["web"]
    and (.images.web | startswith($prefix))
    and (.images.web | ltrimstr($prefix) | test("^[a-f0-9]{64}$"))' publication/deployment.json >/dev/null ||
    { echo "::error::Existing deployment manifest for $REVISION is invalid"; exit 1; }
  echo "preserved=true" >> "$GITHUB_OUTPUT"
  if [ "$run" = "$GITHUB_RUN_ID" ]; then echo "artifact_exists=true" >> "$GITHUB_OUTPUT"; fi
  echo "Preserving previously published manifest for $REVISION from run $run"
  exit 0
done
echo "preserved=false" >> "$GITHUB_OUTPUT"
