#!/usr/bin/env bash
set -euo pipefail

HOST="${NOISE_DEPLOY_HOST:-progists}"
TARGET="/srv/noise/dist/"
SITE="https://noise.furey.dev"

main() {
  cd "$(dirname "$0")"
  npm run build
  ssh "$HOST" "mkdir -p $TARGET"
  rsync -az --delete --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r dist/ "$HOST:$TARGET"
  echo "deploy: copied dist to $HOST:$TARGET"
  curl -sS -o /dev/null -w "deploy: $SITE answered %{http_code}\n" "$SITE/" || true
}

main "$@"
