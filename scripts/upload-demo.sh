#!/usr/bin/env bash
set -euo pipefail

# Upload a demo video to GitHub's user-attachments store and print the
# asset URL for a README video embed.
#
# Uses the same (unofficial, undocumented) endpoint the web UI's drag-and-drop
# hits, authenticated with `gh auth token`. If GitHub retires it, fall back to
# dragging the file into any comment box by hand.
#
#   ./scripts/upload-demo.sh docs/media/demo-devices.mp4

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
FILE="${1:-$REPO_ROOT/docs/media/demo-devices.mp4}"
REPOSITORY="${REPOSITORY:-furey/noise}"

REPO_ID=$(gh api "repos/$REPOSITORY" --jq .id)
URL=$(curl -fsS "https://uploads.github.com/user-attachments/assets?name=$(basename "$FILE")&content_type=video/mp4&repository_id=$REPO_ID" \
  -X POST \
  -H "Authorization: Bearer $(gh auth token)" \
  -H "Accept: application/json" \
  --data-binary "@$FILE" | jq -r .url)

echo "$URL"
