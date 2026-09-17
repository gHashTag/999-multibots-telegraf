/**
 * READING ONE PAGE, AS TEXT, WITHOUT BECOMING A PROXY.
 *
 * ── TWO READERS, AND WHY BOTH ──────────────────────────────────────────────
 *
 * The primary reader is `r.jina.ai` — keyless, documented, and it runs the
 * headless browser so we don't: a React page that is an empty `<div id=root>`
 * to a plain fetch comes back as prose. Measured on 6 sites, including one
 * client-rendered.
 *
 * The fallback is a plain pinned fetch with the tags taken out. It exists
 * because of an honest gap in the measurements: r.jina.ai's limit is ~20
 * requests per minute PER IP, and its 403 `AbuseAlleviationError` bans a
 * DOMAIN for everyone sharing the keyless pool. Every number above was taken
 * from a laptop on a residential line — this service runs in a datacenter,
 * from a shared egress IP, and NONE of it was verified from there. If the
 * reader turns out to be throttled or banned in production, the fallback is
 * the difference between a degraded tool and a dead one.
 *
 * ── THE TRAP: 200 IS NOT SUCCESS ───────────────────────────────────────────
 *
 * r.jina.ai answers HTTP 200 for a page it could not fetch, and writes the
 * failure INTO the markdown:
 *
 *     Title: Not Acceptable!
 *     URL Source: https://example.com/x
 *     Warning: Target URL returned error 406: Not Acceptable
 *
 * So `response.ok` is not a success test. Three conditions are required: 2xx,
 * a `Markdown Content:` section, and no `Warning: Target URL returned error`
 * line. Without the third the agent confidently summarizes an error page.
 *
 * `URL Source:` is an ECHO of what we asked for, not where the reader ended
 * up. It cannot be used to detect a redirect — which is why the chain is
 * walked in web-guard.ts before this file is reached, and why the URL handed
 * to the reader is the FINAL validated one.
 *
 * ── WHAT IS DELIBERATELY NOT SENT ──────────────────────────────────────────
 *
 * `x-return-format: markdown` was tried and produced a 422 on some targets.
 * The default output is already markdown. `x-md-link-style: discarded` IS
 * sent: it drops link URLs from the text, which halves the size and removes
 * the most convenient place to hide an instruction pointing somewhere else.
 *
 * No cookies, no Authorization, no conversation text, no `x-with-images`. The
 * request body is one field: the URL.
 */

import { Agent, fetch as undiciFetch } from 'undici'
import {
  createPinnedAgent,
  resolvePublicAddress,
  type AddressLookup,
} from '../lib/remoteMediaDuration'
import { readBoundedText, resolveFinalUrl } from './web-guard'

/** The reader, as a code constant. Never from the env, never from the model. */
const READER_ORIGIN = 'https://r.jina.ai/'

const READER_TIMEOUT_MS = 30_000
const DIRECT_TIMEOUT_MS = 15_000
const MAX_FETCH_BYTES = 2 * 1024 * 1024
const RETRY_DELAY_MS = 2_000

/** Shorter than this and the reader gave us a stub, not a page. */
const MIN_USEFUL_BYTES = 300

export interface ReadPage {
  ok: true
  /** The final URL after redirects — what was actually read. */
  url: string
  title: string
  text: string
  /** Which reader answered, so the answer can say. */
  via: 'reader' | 'direct'
  truncated: boolean
}

export interface ReadRefusal {
  ok: false
  reason: string
}

export type ReadResult = ReadPage | ReadRefusal

const READER_WARNING = /^Warning: Target URL returned error (\d+)/m

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Split the reader's header block from its body.
 *
 * The format is `Title:`, `URL Source:`, then `Markdown Content:` and the
 * page. `Markdown Content:` missing means the reader produced a stub.
 */
export function parseReaderBody(body: string): {
  title: string
  text: string
} | null {
  const text = String(body ?? '')
  const marker = text.indexOf('Markdown Content:')
  if (marker < 0) return null
  const head = text.slice(0, marker)
  const titleLine = /^Title:\s*(.*)$/m.exec(head)
  return {
    title: (titleLine?.[1] ?? '').trim(),
    text: text.slice(marker + 'Markdown Content:'.length).trim(),
  }
}

/**
 * HTML to something readable, for the fallback path only.
 *
 * Deliberately crude. A real extractor (Readability, cheerio) is a dependency
 * and a parser to keep correct; this exists to answer "the reader is down"
 * with SOMETHING rather than nothing, and the caller is told `via: 'direct'`
 * so the difference is never silent.
 *
 * `<script>`, `<style>`, `<noscript>` and comments go first — with their
 * CONTENTS, because otherwise a page's JavaScript source becomes the "text"
 * and is by far the easiest place to plant a sentence aimed at the model.
 */
export function htmlToText(html: string): { title: string; text: string } {
  const source = String(html ?? '')
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(source)
  const stripped = source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  const text = decodeEntities(stripped)
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim()
  return {
    title: decodeEntities(titleMatch?.[1] ?? '')
      .replace(/\s+/g, ' ')
      .trim(),
    text,
  }
}

function decodeEntities(text: string): string {
  return String(text ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
}

/** One reader attempt. Distinguishes "try again" from "give up". */
async function readerAttempt(
  target: URL,
  fetchImpl: typeof fetch
): Promise<
  | { kind: 'ok'; title: string; text: string }
  | { kind: 'retry'; why: string }
  | { kind: 'fail'; why: string }
> {
  let response: Response
  try {
    response = await fetchImpl(READER_ORIGIN, {
      method: 'POST',
      signal: AbortSignal.timeout(READER_TIMEOUT_MS),
      headers: {
        'content-type': 'application/json',
        accept: 'text/plain',
        // Link targets dropped: smaller, and one less hiding place.
        'x-md-link-style': 'discarded',
      },
      body: JSON.stringify({ url: target.href }),
    })
  } catch (error) {
    return { kind: 'retry', why: String((error as Error)?.message || error) }
  }

  const body = await readBoundedText(response, MAX_FETCH_BYTES)

  if (response.status === 429) return { kind: 'retry', why: 'reader 429' }
  if (response.status === 403 && body.includes('AbuseAlleviationError')) {
    // A domain ban in the shared keyless pool. Retrying is pointless, and it
    // is not this page's fault — somebody else's traffic earned it.
    return { kind: 'fail', why: 'shared reader refuses this domain' }
  }
  if (!response.ok) {
    return { kind: 'retry', why: `reader HTTP ${response.status}` }
  }

  const warning = READER_WARNING.exec(body)
  if (warning) {
    // The page itself answered an error. The reader worked fine.
    return { kind: 'fail', why: `target returned ${warning[1]}` }
  }

  const parsed = parseReaderBody(body)
  if (!parsed || body.length < MIN_USEFUL_BYTES) {
    return { kind: 'retry', why: 'reader returned a stub' }
  }
  return { kind: 'ok', title: parsed.title, text: parsed.text }
}

/**
 * Fetch the page ourselves, pinned to the address we validated.
 *
 * `redirect: 'error'` and not `'follow'`: the chain was already walked and
 * approved in web-guard, so `target` is a final URL. If it redirects NOW,
 * something changed between the two requests and the safe answer is to stop —
 * following here would be a hop nobody checked.
 */
async function directAttempt(
  target: URL,
  opts: { lookupImpl?: AddressLookup; fetchImpl?: typeof fetch }
): Promise<{ title: string; text: string } | null> {
  let agent: Agent | undefined
  try {
    let response: Response
    if (opts.fetchImpl) {
      response = await opts.fetchImpl(target, {
        redirect: 'error',
        signal: AbortSignal.timeout(DIRECT_TIMEOUT_MS),
      })
    } else {
      const resolved = await resolvePublicAddress(
        target.hostname,
        opts.lookupImpl
      )
      agent = createPinnedAgent(resolved)
      response = (await undiciFetch(target, {
        dispatcher: agent,
        redirect: 'error',
        signal: AbortSignal.timeout(DIRECT_TIMEOUT_MS),
        headers: { accept: 'text/html,text/plain;q=0.9' },
      })) as unknown as Response
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      return null
    }

    const type = (response.headers.get('content-type') || '').toLowerCase()
    if (
      type &&
      !type.includes('text/html') &&
      !type.includes('text/plain') &&
      !type.includes('xml') &&
      !type.includes('json')
    ) {
      // A PDF, an image or a video. Reading the bytes as text produces noise
      // that looks like content, which is worse than saying no.
      await response.body?.cancel().catch(() => undefined)
      return null
    }

    const body = await readBoundedText(response, MAX_FETCH_BYTES)
    if (!body.trim()) return null
    return type.includes('text/html') || /^\s*</.test(body)
      ? htmlToText(body)
      : { title: '', text: body.trim() }
  } catch (error) {
    console.warn(
      '[web] direct read failed:',
      target.hostname,
      String((error as Error)?.message || error)
    )
    return null
  } finally {
    await agent?.close().catch(() => undefined)
  }
}

/**
 * Read a page: validate the whole redirect chain, then the reader, then us.
 *
 * `maxChars` clips the returned text and REPORTS the clip. A silent clip reads
 * as "that is the whole page" and invites the agent to answer about a document
 * whose second half it never saw.
 */
export async function readWebPage(
  raw: unknown,
  opts: {
    maxChars?: number
    lookupImpl?: AddressLookup
    /** The reader hop. Separate from `directFetchImpl` so tests can fail one. */
    fetchImpl?: typeof fetch
    directFetchImpl?: typeof fetch
    allowDirect?: boolean
    sleepImpl?: (ms: number) => Promise<void>
  } = {}
): Promise<ReadResult> {
  const maxChars = opts.maxChars ?? 6_000
  const fetchImpl = opts.fetchImpl ?? fetch
  const pause = opts.sleepImpl ?? sleep

  const guarded = await resolveFinalUrl(raw, {
    lookupImpl: opts.lookupImpl,
    fetchImpl: opts.directFetchImpl,
  })
  if (!guarded.ok) return guarded
  const target = guarded.url

  let readerWhy = 'reader did not answer'
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await readerAttempt(target, fetchImpl)
    if (result.kind === 'ok') {
      return finish(target, result.title, result.text, 'reader', maxChars)
    }
    readerWhy = result.why
    if (result.kind === 'fail') break
    if (attempt === 0) await pause(RETRY_DELAY_MS)
  }

  console.warn('[web] reader unavailable:', target.hostname, readerWhy)

  if (opts.allowDirect === false) {
    return { ok: false, reason: 'не смог прочитать страницу' }
  }

  const direct = await directAttempt(target, {
    lookupImpl: opts.lookupImpl,
    fetchImpl: opts.directFetchImpl,
  })
  if (direct) {
    return finish(target, direct.title, direct.text, 'direct', maxChars)
  }

  return { ok: false, reason: 'не смог прочитать страницу' }
}

function finish(
  target: URL,
  title: string,
  text: string,
  via: 'reader' | 'direct',
  maxChars: number
): ReadPage {
  const body = text.trim()
  return {
    ok: true,
    url: target.href,
    title: title.slice(0, 200),
    text: body.length > maxChars ? body.slice(0, maxChars) : body,
    via,
    truncated: body.length > maxChars,
  }
}
