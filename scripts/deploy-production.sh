#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/skin-cra}"
DATA_DIR="${DATA_DIR:-/var/lib/skin-cra}"
BRANCH="${BRANCH:-main}"

cd "$APP_DIR"

mkdir -p "$DATA_DIR/uploads"

copy_initial_file() {
  local source_path="$1"
  local target_path="$2"
  local fallback_content="$3"

  if [ -e "$target_path" ]; then
    return
  fi

  if [ -e "$source_path" ] && [ ! -L "$source_path" ]; then
    cp "$source_path" "$target_path"
  else
    printf '%s\n' "$fallback_content" > "$target_path"
  fi
}

if [ -d "public/uploads" ] && [ ! -L "public/uploads" ]; then
  cp -a public/uploads/. "$DATA_DIR/uploads/" 2>/dev/null || true
fi

copy_initial_file "public/landing-content.json" "$DATA_DIR/landing-content.json" "{}"
copy_initial_file "server/stripe-secrets.json" "$DATA_DIR/stripe-secrets.json" '{
  "testSecretKey": "",
  "liveSecretKey": ""
}'
copy_initial_file "server/trial-orders.json" "$DATA_DIR/trial-orders.json" '{
  "orders": []
}'

chmod 600 "$DATA_DIR/stripe-secrets.json" || true

git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

mkdir -p public server "$DATA_DIR/uploads"

rm -rf public/uploads
ln -s "$DATA_DIR/uploads" public/uploads

rm -f public/landing-content.json
ln -s "$DATA_DIR/landing-content.json" public/landing-content.json

rm -f server/stripe-secrets.json
ln -s "$DATA_DIR/stripe-secrets.json" server/stripe-secrets.json

rm -f server/trial-orders.json
ln -s "$DATA_DIR/trial-orders.json" server/trial-orders.json

npm ci
npm run build

pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
