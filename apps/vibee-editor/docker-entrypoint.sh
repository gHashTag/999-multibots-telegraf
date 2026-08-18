#!/bin/sh
set -eu

# Railway injects PORT at runtime; fall back to 8080 for local `docker run`.
export PORT="${PORT:-8080}"

# envsubst is given an EXPLICIT variable list. Without the filter it would
# substitute every name present in the environment — Railway injects ~100 —
# and any collision with an nginx runtime variable ($uri, $host, $request_uri)
# silently blanks a directive, e.g. `try_files $uri` becomes `try_files`.
envsubst '${PORT}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

# Fail loudly at start rather than serving a half-broken config.
nginx -t

exec nginx -g 'daemon off;'
