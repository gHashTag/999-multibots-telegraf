const WIDGET_DOMAINS = ['app.t27.ai', 'vibee-editor-production.up.railway.app']

export function shouldUseTelegramFallback(hostname?: string): boolean {
  const host =
    hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')
  if (!host) return true
  return !WIDGET_DOMAINS.includes(host)
}
