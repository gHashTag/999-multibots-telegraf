#!/bin/sh
set -eu

# The static bundle has no reason to receive the retired backend's runtime
# configuration. Inspect NUL-delimited entries so embedded newlines cannot
# hide a nonempty named variable or a host stored under an unrelated name.
fail_forbidden_backend_environment() {
  printf '%s\n' 'FATAL: forbidden backend environment detected (redacted)' >&2
  exit 78
}

if ! env -0 >/dev/null 2>&1; then
  fail_forbidden_backend_environment
fi

if env -0 | while IFS= read -r -d '' entry; do
  name=${entry%%=*}
  value=${entry#*=}
  upper_name=$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')

  case "$upper_name" in
    *SUPABASE*)
      if [ -n "$value" ]; then
        exit 78
      fi
      ;;
  esac

  lower_value=$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')
  host_marker='supabase.'
  case "$lower_value" in
    *"$host_marker"*)
      exit 78
      ;;
  esac
done; then
  :
else
  fail_forbidden_backend_environment
fi

# A command argument is used by executable contract tests and is also the
# conventional safe way to inspect this container. The environment guard above
# always runs first; the production image supplies no command and continues to
# nginx below.
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

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
