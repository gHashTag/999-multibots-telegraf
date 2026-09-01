/** A request label safe enough for operational logs. */
export function redactedRequestPath(url: string | undefined): string {
  return (url || '/')
    .split('?')[0]
    .replace(/^(\/api\/telegram\/stars-wh)\/[^/]+$/, '$1/[redacted]')
}
