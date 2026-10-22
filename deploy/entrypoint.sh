#!/bin/sh
# Container entrypoint for the single-image deployment.
# 1. Renders the nginx site config with the port Render provides.
# 2. Starts nginx, the NestJS API and the FastAPI/SymPy verifier.
set -eu

PORT="${PORT:-10000}"

mkdir -p /var/log/nginx /var/lib/nginx /run /etc/nginx/conf.d

sed "s/__PORT__/${PORT}/g" /etc/nginx/templates/site.conf.template \
  > /etc/nginx/conf.d/default.conf

# Fail fast with a clear message if the port is already taken.
if ! grep -q "listen ${PORT};" /etc/nginx/conf.d/default.conf; then
  echo "entrypoint: failed to render nginx config for port ${PORT}" >&2
  exit 1
fi

echo "entrypoint: serving the app on port ${PORT} (api -> 127.0.0.1:3000, verifier -> 127.0.0.1:8000)"

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
