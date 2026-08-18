#!/bin/sh
set -eu

export PORT="${PORT:-8080}"
# Railway private networking. PostgREST is deliberately not public: the only
# way in is through this gateway.
export POSTGREST_HOST="${POSTGREST_HOST:-postgrest.railway.internal}"
export POSTGREST_PORT="${POSTGREST_PORT:-3000}"

# Explicit variable list. Unfiltered, envsubst would eat nginx's own $host,
# $scheme and $proxy_add_x_forwarded_for and silently produce a config that
# proxies with empty headers.
envsubst '${PORT} ${POSTGREST_HOST} ${POSTGREST_PORT}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

nginx -t

exec nginx -g 'daemon off;'
