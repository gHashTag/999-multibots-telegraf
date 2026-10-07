#!/bin/sh
set -eu

export PORT="${PORT:-8080}"
# Railway private networking. PostgREST is deliberately not public: the only
# way in is through this gateway.
export POSTGREST_HOST="${POSTGREST_HOST:-postgrest.railway.internal}"
export POSTGREST_PORT="${POSTGREST_PORT:-3000}"
# supabase/storage-api, also private; reached only through /storage/v1/.
export STORAGE_HOST="${STORAGE_HOST:-supabase-storage.railway.internal}"
export STORAGE_PORT="${STORAGE_PORT:-5000}"

# Explicit variable list. Unfiltered, envsubst would eat nginx's own $host,
# $scheme and $proxy_add_x_forwarded_for and silently produce a config that
# proxies with empty headers.
envsubst '${PORT} ${POSTGREST_HOST} ${POSTGREST_PORT} ${STORAGE_HOST} ${STORAGE_PORT}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

nginx -t

exec nginx -g 'daemon off;'
