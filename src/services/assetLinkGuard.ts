/**
 * A CLIENT MUST NEVER BE HANDED A LINK TO A FILE THAT IS NOT THERE.
 *
 * WHAT HAPPENED, 20.09.2026. A client got
 * `assets/1789924443235674-agent-edit-1789924443235613.png`, which answers
 * `NoSuchKey`. Nothing was lost: that key is a splice of two real uploads made
 * minutes apart that evening -- the timestamp of one, the tail of the other --
 * and all 368 keys written that day carry a 13-digit timestamp where the
 * spliced one carries 16, so no uploader could have produced it. The model
 * wrote the address out from memory instead of passing through what a tool
 * returned.
 *
 * The cure upstream is context: the agent is now shown the person's real files
 * with their real URLs (`filesBlock` in the render). This is the floor under
 * that -- the last thing between a made-up address and a person who will click
 * it and see an XML error page.
 *
 * THE ASYMMETRY THAT MAKES THIS SAFE. A link is dropped only on a definite
 * answer from the store that the object is not there (404/403/410). A timeout,
 * a DNS failure, a 500 -- anything that means "we could not find out" -- leaves
 * the link alone. Not knowing must never cost somebody a working file; that
 * would trade a rare fabricated link for a common destroyed one.
 */

import { logger } from '@/utils/logger'

/**
 * Where our own files live. Public addresses, not secrets -- the same shape
 * the render composes in `uploadedAssetResult`. Overridable so a move of the
 * bucket does not silently turn the guard off.
 */
export const ASSET_ORIGINS: string[] = (
  process.env.ASSET_PUBLIC_BASES ||
  [
    'https://bucket-production-8259.up.railway.app/vibee-assets',
    'https://vibee-render-production.up.railway.app/s3',
  ].join(',')
)
  .split(',')
  .map(s => s.trim().replace(/\/+$/, ''))
  .filter(Boolean)

/** Per-link ceiling. A HEAD to our own bucket answers in tens of ms; beyond
 *  this we have learnt nothing and the link is kept. */
export const LINK_CHECK_TIMEOUT_MS = 2500

/** Checking is cheap but not free, and a reply carrying more addresses than
 *  this is not a reply about a file. */
export const MAX_LINKS_CHECKED = 6

/** What the person reads in place of the address. Russian: a live human in
 *  Telegram reads this. */
const DEAD_LINK_NOTICE =
  '\n\n⚠️ Ссылку на файл убрал: проверил — по ней ничего не открывается. Напомни про файл следующим сообщением, и пришлю рабочую.'

/**
 * Bare URLs, plus the `](...)` form, so a dead address inside a markdown link
 * is found too. Trailing punctuation is not part of an address.
 */
const URL_RE = /https?:\/\/[^\s<>()[\]"']+/g

/** Addresses that point at our own asset store, deduplicated, in order. */
export function assetUrlsIn(text: string): string[] {
  const found: string[] = String(text || '').match(URL_RE) ?? []
  const ours = found
    .map(u => u.replace(/[.,;:!?]+$/, ''))
    .filter(u => ASSET_ORIGINS.some(base => u.startsWith(base + '/')))
  return [...new Set(ours)]
}

/**
 * True only when the store said, definitely, that there is nothing at this
 * address. Every other outcome -- including every network fault -- is false.
 */
export async function linkIsDead(url: string): Promise<boolean> {
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), LINK_CHECK_TIMEOUT_MS)
  try {
    const r = await fetch(url, { method: 'HEAD', signal: control.signal })
    return r.status === 404 || r.status === 403 || r.status === 410
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Remove one address, taking the markdown wrapper with it but keeping the
 *  label the person was meant to read. */
function withoutUrl(text: string, url: string): string {
  const q = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text
    .replace(new RegExp(`\\[([^\\]]*)\\]\\(${q}\\)`, 'g'), '$1')
    .replace(new RegExp(q, 'g'), '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * The text as it may be sent. Unchanged whenever there is nothing to check or
 * nothing is provably missing -- the overwhelmingly common case, and one that
 * costs no network at all.
 */
export async function guardAssetLinks(
  text: string,
  chatId?: string
): Promise<string> {
  const urls = assetUrlsIn(text)
  if (!urls.length) return text

  const checked = urls.slice(0, MAX_LINKS_CHECKED)
  const verdicts = await Promise.all(checked.map(linkIsDead))
  const dead = checked.filter((_, i) => verdicts[i])
  if (!dead.length) return text

  logger.error('[Business] a dead asset link was stopped before the client', {
    chatId,
    dead,
    checked: checked.length,
    // The point of the record: a fabricated address is a model defect, and it
    // is invisible unless the address itself is kept.
    reason: 'the store reports no object at this address',
  })

  const cleaned = dead.reduce(withoutUrl, text)
  return (cleaned || '').trim() + DEAD_LINK_NOTICE
}
