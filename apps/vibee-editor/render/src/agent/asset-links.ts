/**
 * AN ADDRESS THE SERVICE NEVER PRODUCED DOES NOT LEAVE THE SERVICE.
 *
 * WHAT HAPPENED, 20.09.2026. A client was handed
 * `assets/1789924443235674-agent-edit-1789924443235613.png`, which answers
 * `NoSuchKey`. Nothing had been lost: that key is a SPLICE of two real uploads
 * made minutes apart that evening -- the timestamp of one, the tail of the
 * other -- and all 368 keys written that day carry a 13-digit timestamp where
 * the spliced one carries 16, so no uploader could have minted it. The model
 * wrote the address out from memory instead of copying what a tool returned.
 *
 * `filesBlock` is the cure upstream: the model is shown the person's real files
 * with their real URLs. This is the floor under it, and it covers EVERY
 * surface, because every surface -- bot, mini app, iOS -- reads its answer out
 * of this stream.
 *
 * ── WHY THIS IS NOT THE BOT'S GUARD MOVED HERE ────────────────────────────
 *
 * `src/services/assetLinkGuard.ts` in the bot asks the STORE: it HEADs the
 * address and drops it only on a definite 404/403/410. That is the right rule
 * for the bot, which sits downstream of everything and knows nothing about how
 * a piece of text was built.
 *
 * Here the service knows something stronger and cheaper: which asset addresses
 * it actually put in front of the model this turn -- the files block, the
 * history, every tool result. An address that is not one of those was composed,
 * and no network call is needed to say so. That also removes the store check's
 * one weakness -- a flaky bucket must never cost somebody a working link --
 * because nothing here depends on the bucket answering at all.
 *
 * ── WHY IT IS A STREAMING FILTER AND NOT A PASS OVER THE FINISHED TEXT ────
 *
 * The answer is written to the caller token by token as it arrives; by the
 * time a turn has "a finished text" the client has already rendered it. So the
 * text flows through here, and the only thing ever held back is the tail that
 * might still be growing into an address.
 */

/**
 * Where our own files live. Both forms the service hands out: the bucket's own
 * public origin and the render's `/s3/<key>` proxy.
 *
 * Read at call time, not at import: the tests and the deployment set these
 * through the environment, and a module-level constant would freeze whichever
 * happened to be set first.
 */
export function assetOrigins(): string[] {
  const bucket =
    process.env.S3_PUBLIC_URL ||
    `${process.env.AWS_ENDPOINT_URL_S3 || 'https://fly.storage.tigris.dev'}/${
      process.env.BUCKET_NAME || process.env.S3_BUCKET || 'vibee-assets'
    }`
  const proxy = `${
    process.env.PUBLIC_URL || 'https://vibee-render-production.up.railway.app'
  }/s3`
  return [bucket, proxy]
    .map(s => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .map(s => s + '/')
}

/** Bare URLs. Trailing punctuation and a closing bracket are not part of one. */
const URL_RE = /https?:\/\/[^\s<>()[\]"'`]+/g

/** True when this address points at our own asset store. */
export function isAssetUrl(url: string): boolean {
  return assetOrigins().some(base => url.startsWith(base))
}

/**
 * Every address of ours in this text, deduplicated, in order.
 *
 * Takes anything, because the callers are the model's messages and the tools'
 * return values, and a tool returns whatever it likes -- most return an object
 * with the new file's url in a field. `String()` on one of those is
 * `[object Object]`, which would silently teach the gate nothing and then
 * strike out the very address the tool had just made.
 */
export function assetUrlsIn(text: unknown): string[] {
  const found: string[] = flatten(text).match(URL_RE) ?? []
  return [...new Set(found.map(trimEnd).filter(isAssetUrl))]
}

function flatten(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v) ?? ''
  } catch {
    // Circular, or a value JSON refuses. Nothing readable to scan.
    return ''
  }
}

function trimEnd(u: string): string {
  return u.replace(/[.,;:!?]+$/, '')
}

/**
 * The longest a tail may be held waiting for an address to finish.
 *
 * A URL that has not ended within this many characters is not a URL the model
 * is still writing -- it is prose with no whitespace in it -- and holding it
 * would stall the stream the caller is watching.
 */
export const MAX_HELD = 2000

/** What the person reads in place of a composed address. Russian: a live human
 *  reads this in Telegram or in the mini app. */
export const FABRICATED_LINK_NOTICE =
  ' (ссылку на файл убрал: такого файла у меня нет — напомни про него следующим сообщением, и пришлю рабочую)'

/** Remove one address, taking a markdown wrapper with it but keeping the label
 *  the person was meant to read. */
function withoutUrl(text: string, url: string): string {
  const q = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text
    .replace(new RegExp(`\\[([^\\]]*)\\]\\(${q}[^)]*\\)`, 'g'), '$1')
    .replace(new RegExp(q, 'g'), '')
}

/**
 * Where a link construct that is still being written begins, or -1.
 *
 * The scan starts at the last `http` in the buffer and only counts it as
 * unfinished when nothing after it has ended it -- no whitespace, no closing
 * bracket. A `[label](http...` that has not reached its `)` is held from the
 * `[`, so that dropping the address takes the empty brackets with it instead
 * of leaving `[label]()` on the screen.
 */
function unfinishedLinkAt(buf: string): number {
  const i = buf.lastIndexOf('http')
  if (i < 0) return -1
  if (/[\s<>()[\]"'`]/.test(buf.slice(i))) return -1
  const open = buf.lastIndexOf('](', i)
  if (open >= 0 && open + 2 === i) {
    const label = buf.lastIndexOf('[', open)
    if (label >= 0) return label
  }
  return i
}

export type LinkGate = {
  /** Text that may be sent now. May be shorter than what was pushed. */
  push(chunk: string): string
  /** Whatever was being held. Call once, when the model stops writing. */
  flush(): string
  /** Addresses this turn produced that it was never given. */
  fabricated(): string[]
  /** Teach the gate an address the service itself produced. */
  allow(text: unknown): void
}

/**
 * A gate that lets through every address the service has seen and no other.
 *
 * `given` is everything the model was shown -- the prompt, the files block,
 * the history. `allow` adds to it as tool results come back during the turn,
 * because a picture generated on this turn is an address the model is SUPPOSED
 * to repeat and has not been given yet.
 */
export function createLinkGate(given: unknown): LinkGate {
  const allowed = new Set<string>(assetUrlsIn(given))
  const bad = new Set<string>()
  let held = ''

  const filter = (s: string): string => {
    if (!s) return s
    const composed = assetUrlsIn(s).filter(u => !allowed.has(u))
    if (!composed.length) return s
    for (const u of composed) bad.add(u)
    const cleaned = composed.reduce(withoutUrl, s)
    return cleaned + FABRICATED_LINK_NOTICE
  }

  return {
    push(chunk: string): string {
      const buf = held + String(chunk ?? '')
      const start = buf.length > MAX_HELD ? -1 : unfinishedLinkAt(buf)
      if (start < 0) {
        held = ''
        return filter(buf)
      }
      held = buf.slice(start)
      return filter(buf.slice(0, start))
    },
    flush(): string {
      const rest = held
      held = ''
      return filter(rest)
    },
    fabricated: () => [...bad],
    allow(text: unknown) {
      for (const u of assetUrlsIn(text)) allowed.add(u)
    },
  }
}
