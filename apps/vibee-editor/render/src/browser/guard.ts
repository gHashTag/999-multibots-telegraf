/**
 * WHERE AN AGENT MAY NOT ACT WITHOUT BEING TOLD TWICE.
 *
 * `browser_ask_permission` is a brake an agent pulls. This is the one it
 * cannot drive past.
 *
 * ── WHY BY PLACE AND NOT BY ACTION ────────────────────────────────────────
 *
 * The honest reason: a click is a point on a screen, and nothing outside the
 * page can tell whether that point says "Next" or "Send £4,000". Classifying
 * actions would be guessing, and a guard that guesses is worse than none --
 * it refuses the harmless and waves through the ruinous, and people learn to
 * work around it.
 *
 * Where we ARE is knowable: the page's own URL, read from the browser. So the
 * rule is about place. On a bank, on mail, on a payment page, every acting
 * tool needs a permission the person granted in the last few minutes.
 * Everywhere else, an agent works freely -- which is most of the web, and
 * most of what it is for.
 *
 * ── WHAT THIS DOES NOT CLAIM ──────────────────────────────────────────────
 *
 * It is not a security boundary against a hostile agent: one with
 * `browser_evaluate` can navigate anywhere and do anything a page allows. It
 * is a guard against the ordinary accident -- a confident model one click
 * from sending the wrong thing to the wrong person -- and against a page that
 * talked an agent into acting (the page is untrusted data; §4.3).
 *
 * The list is configuration, not a truth. It ships with the obvious cases and
 * the person's own additions go in `BROWSER_SENSITIVE_DOMAINS`.
 */

/**
 * The default list. Not exhaustive and not meant to be: these are the places
 * where a wrong click costs money or reaches other people, which is what the
 * person is being asked to watch for.
 */
export const DEFAULT_SENSITIVE = [
  // money
  'bank',
  'sberbank',
  'tinkoff',
  'alfabank',
  'paypal.com',
  'stripe.com',
  'checkout',
  'payment',
  'billing',
  'wise.com',
  'revolut.com',
  'binance.com',
  /*
   * Reaching other people. NOTE, found by mutation testing: 'mail.' is a
   * plain substring match, so it already covers 'gmail.com' and
   * 'mail.google.com' below -- removing either of those changes nothing.
   * They stay because a list of sensitive places is read by people, and
   * naming the obvious ones is worth more than being minimal.
   */
  'mail.',
  'gmail.com',
  'mail.google.com',
  'outlook.',
  'yandex.ru/mail',
  'web.telegram.org',
  'web.whatsapp.com',
  // the account itself
  'accounts.google.com',
  'myaccount.google.com',
  'id.',
  'login.',
  'security',
] as const

export function sensitiveList(
  env: Record<string, string | undefined> = process.env
): string[] {
  const extra = (env.BROWSER_SENSITIVE_DOMAINS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
  return [...DEFAULT_SENSITIVE, ...extra]
}

/**
 * THE BROWSER'S OWN ROOMS WHERE THE KEYS ARE KEPT.
 *
 * Since the pod carries a password manager (Bitwarden, see
 * deployment/remote-browser/Dockerfile), the person's unlocked vault is a
 * page of the browser itself -- chrome-extension:// -- and the settings and
 * extension pages can change what the browser trusts. Acting there is as
 * sensitive as acting on a bank. A new tab or a blank page is not.
 */
export const SENSITIVE_BROWSER_PAGES = [
  'chrome://settings',
  'chrome://password-manager',
  'chrome://extensions',
  'chrome-extension://',
  'devtools://',
] as const

/**
 * Where an agent may OPEN a page: the web and a blank tab. Nothing of the
 * browser's own -- its settings, its extensions (the vault among them), its
 * devtools -- and no file:, data: or javascript: address that is not a
 * place at all.
 */
export function agentMayOpen(url: string): boolean {
  if (url.trim().toLowerCase() === 'about:blank') return true
  try {
    return /^https?:$/.test(new URL(url).protocol)
  } catch {
    return false
  }
}

/**
 * Matched against host AND path, because "where" is sometimes a corner of a
 * site: `yandex.ru` is a search engine, `yandex.ru/mail` is somebody's inbox.
 */
export function isSensitive(url: string, list = sensitiveList()): boolean {
  let subject: string
  try {
    const parsed = new URL(url)
    /*
     * Not the web: a new tab or about:blank is nobody's bank, but the
     * browser's own settings and extensions are where its keys are kept.
     */
    if (!/^https?:$/.test(parsed.protocol)) {
      const lower = url.toLowerCase()
      return SENSITIVE_BROWSER_PAGES.some(page => lower.startsWith(page))
    }
    subject = (parsed.host + parsed.pathname).toLowerCase()
  } catch {
    /*
     * An address we cannot parse is not a free pass. We do not know where we
     * are, and "we do not know" must not be the answer that lets an agent act.
     */
    return true
  }
  return list.some(needle => subject.includes(needle))
}

/** How long one "yes" keeps the door open. */
export const PERMISSION_WINDOW_MS = 5 * 60 * 1000

export interface GuardInput {
  url: string
  /** When the person last said yes for this session, or null. */
  allowedAtMs: number | null
  nowMs: number
}

export type GuardVerdict =
  | { allowed: true }
  | { allowed: false; reason: 'needs-permission'; where: string }

/**
 * A fresh yes, or a refusal that tells the agent exactly what to do next.
 *
 * The refusal names the tool to call, because an agent that is merely told
 * "no" will try again, try differently, and eventually try something worse.
 */
export function mayAct(
  input: GuardInput,
  list = sensitiveList(),
  windowMs = PERMISSION_WINDOW_MS
): GuardVerdict {
  if (!isSensitive(input.url, list)) return { allowed: true }
  if (
    input.allowedAtMs !== null &&
    input.nowMs - input.allowedAtMs <= windowMs
  ) {
    return { allowed: true }
  }
  let where = input.url
  try {
    where = new URL(input.url).host
  } catch {
    /* Keep the raw string; it is only for the message. */
  }
  return { allowed: false, reason: 'needs-permission', where }
}
