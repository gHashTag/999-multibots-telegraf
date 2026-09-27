/**
 * DID THE BROWSER ACTUALLY GO DOWN AND COME BACK?
 *
 * "The pod answers HTTP 200" is not the witness anybody thought it was. On the
 * `fixed` driver `stop` is a documented no-op, so for three days (2026-09-24 to
 * 26) every round reported a successful restart while the same unreadable
 * Chromium stayed up: nothing in the log distinguished "restarted and healthy"
 * from "never restarted, still broken".
 *
 * Chromium mints a fresh browser GUID every time it boots, and hands it out in
 * `/json/version` as the path of `webSocketDebuggerUrl`
 * (`ws://host:9222/devtools/browser/<guid>`). That GUID is the cheapest honest
 * witness of a boot that is reachable from outside the pod: same GUID means the
 * same process is still up, whatever the HTTP status said.
 *
 * WHAT THIS DOES NOT CLAIM. A GUID we could not read says nothing -- an
 * unreadable pod is not evidence of a restart in either direction, so the
 * answer is `unknown` and the caller falls back to asking whether the browser
 * works (health.ts). This module never restarts anything; it only says what it
 * saw.
 */

import { httpBase } from './cdp'

/** The browser's boot identity, or '' when the pod would not say. */
export async function browserBootId(
  cdpEndpoint: string,
  timeoutMs = 10_000
): Promise<string> {
  try {
    const res = await fetch(`${httpBase(cdpEndpoint)}/json/version`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return ''
    const info = (await res.json()) as { webSocketDebuggerUrl?: string }
    return bootIdOf(info.webSocketDebuggerUrl ?? '')
  } catch {
    return ''
  }
}

/**
 * The GUID out of a browser socket url. Pure, and deliberately strict: only
 * the `/devtools/browser/<guid>` shape is an identity. A page socket is not one
 * -- pages come and go without the browser restarting, and reading one as a
 * boot identity would report a restart on every new tab.
 */
export function bootIdOf(wsUrl: string): string {
  const m = /\/devtools\/browser\/([^/?#]+)/.exec(String(wsUrl ?? ''))
  return m ? m[1] : ''
}

export type BootVerdict = 'restarted' | 'same-browser' | 'unknown'

/**
 * What the two readings prove. Pure, so the rule is testable without a pod.
 *
 * `unknown` whenever either side is missing: the honest answer when the pod
 * was unreachable, and the one that keeps this from ever manufacturing a
 * restart out of a failed read.
 */
export function bootVerdict(before: string, after: string): BootVerdict {
  if (!before || !after) return 'unknown'
  return before === after ? 'same-browser' : 'restarted'
}
