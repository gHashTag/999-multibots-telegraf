/**
 * THE API'S ORIGIN, FOR A HANDSHAKE THE BROWSER CAN MAKE EARLY.
 *
 * MEASURED 2026-09-24 against production, from a cold client:
 *
 *   app.t27.ai            dns 136 ms   tls  95 ms   ttfb 452 ms
 *   the render's origin   dns  82 ms   tls 198 ms   ttfb 445 ms
 *
 * The app is served from one host and its API lives on another, so the SECOND
 * of those handshakes does not begin until the first API call is made -- after
 * the HTML, the main bundle and the route chunk have all arrived. A quarter to a
 * third of a second of the first screen is a DNS lookup and a TLS negotiation
 * that could have happened while the bundle was still downloading.
 *
 * `<link rel="preconnect">` moves it there. It is the cheapest part of the
 * one-origin question: if the app is ever served from the same host as the API,
 * this returns null and the tag disappears on its own -- there is nothing to
 * preconnect to when there is no second origin.
 *
 * WHY A FUNCTION AND NOT A LITERAL IN index.html. The host is a build-time
 * variable (VITE_API_URL). A hand-written tag would be a second home for it,
 * and the wrong host in a preconnect is a silent cost: the browser opens a
 * connection to somewhere nobody is going to ask.
 */

/**
 * The origin to preconnect to, or null when there is nothing to gain: no API
 * url configured, a relative one, a same-origin one, or an unparseable value.
 */
export function apiPreconnectOrigin(
  apiUrl: string | undefined,
  selfOrigin?: string
): string | null {
  const raw = String(apiUrl ?? '').trim()
  if (!raw) return null
  // A relative base ('/api', '') is already this origin: nothing to open.
  if (!/^https?:\/\//i.test(raw)) return null
  let origin: string
  try {
    origin = new URL(raw).origin
  } catch {
    return null
  }
  if (selfOrigin && origin === String(selfOrigin).trim()) return null
  return origin
}
