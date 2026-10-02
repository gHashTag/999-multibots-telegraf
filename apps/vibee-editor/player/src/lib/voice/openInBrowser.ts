import { getWebApp } from '@/lib/telegram'

/**
 * A WebView that will not hand over the microphone is a dead end inside
 * Telegram; the same page in the phone's browser asks for it normally.
 */
export function openInBrowser(): void {
  const url = `${window.location.origin}${window.location.pathname}`
  const wa = getWebApp()
  if (wa && typeof wa.openLink === 'function') wa.openLink(url)
  else window.open(url, '_blank', 'noopener')
}
