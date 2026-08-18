# Path-stripping gateway that lets @supabase/supabase-js talk to a bare
# PostgREST. See nginx.conf.template for why the rewrite is unavoidable.

FROM nginx:alpine

RUN apk add --no-cache gettext

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint-gateway.sh
RUN chmod +x /docker-entrypoint-gateway.sh

EXPOSE 8080
ENTRYPOINT ["/docker-entrypoint-gateway.sh"]
