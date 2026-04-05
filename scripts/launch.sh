#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

unset CI

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies…"
  npm install
fi

mode="${1:-start}"
case "$mode" in
  start) npm start ;;
  web) npm run web ;;
  ios) npm run ios ;;
  android) npm run android ;;
  *)
    echo "Usage: $(basename "$0") [start|web|ios|android]"
    exit 1
    ;;
esac
