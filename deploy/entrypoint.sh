#!/bin/sh
# Container entrypoint for the single-image deployment.
# 1. Validates the port Render assigned.
# 2. Renders and validates the nginx site config.
# 3. Starts nginx, the NestJS API and the FastAPI/SymPy verifier under
#    supervisor (which is itself under tini).
set -eu

umask 022

PORT="${PORT:-10000}"
case "${PORT}" in
  '' | *[!0-9]*)
    echo "entrypoint: PORT must be a number, got '${PORT}'" >&2
    exit 1
    ;;
esac
if [ "${PORT}" -lt 1 ] || [ "${PORT}" -gt 65535 ]; then
  echo "entrypoint: PORT must be between 1 and 65535, got '${PORT}'" >&2
  exit 1
fi

TEMPLATE=/etc/nginx/templates/site.conf.template
if [ ! -f "${TEMPLATE}" ]; then
  echo "entrypoint: missing nginx template ${TEMPLATE}" >&2
  exit 1
fi
if [ ! -f /usr/share/nginx/html/index.html ]; then
  echo "entrypoint: frontend build is missing /usr/share/nginx/html/index.html" >&2
  exit 1
fi

mkdir -p /var/log/nginx /var/lib/nginx /var/log/supervisor /run /etc/nginx/conf.d

sed "s/__PORT__/${PORT}/g" "${TEMPLATE}" > /etc/nginx/conf.d/default.conf

# Fail fast with a clear message if the template was not rendered.
if ! grep -q "listen ${PORT};" /etc/nginx/conf.d/default.conf; then
  echo "entrypoint: failed to render nginx config for port ${PORT}" >&2
  exit 1
fi

# Catch syntax/template mistakes before Render sees a container that serves
# static files but cannot proxy the API.
if ! nginx -t -c /etc/nginx/nginx.conf; then
  echo "entrypoint: nginx configuration test failed" >&2
  exit 1
fi

echo "entrypoint: nginx validated; serving on 0.0.0.0:${PORT} (api -> 127.0.0.1:3000, verifier -> 127.0.0.1:8000)"
echo "entrypoint: node $(node --version), nginx $(nginx -v 2>&1 | sed 's/^nginx version: //'), python $(python3 --version 2>&1)"

exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf
