/**
 * FINDING LINKS, WITH AN HONEST FLOOR UNDER IT.
 *
 * ── WHAT WAS ACTUALLY TESTED, AND WHAT IT COST ─────────────────────────────
 *
 * Every keyless "search engine" was probed live before any of this was
 * written, and most of them are traps rather than merely weak:
 *
 *   * Bing's HTML answered HTTP 200 with the right page title and ten
 *     well-formed result blocks — containing German and French shopping pages
 *     for an English technical query, with `bing.com/ck/a` redirectors in
 *     place of destinations. A scraper cannot tell that from success. Both
 *     public SearxNG instances that serve JSON are Bing-backed (their own
 *     `unresponsive_engines` reports duckduckgo "access denied" and google
 *     "CAPTCHA"), so they inherit it: one answered 0 of 5 technical queries,
 *     the other returned pornographic URLs for a benign one.
 *   * DuckDuckGo html/lite, Mojeek, Ecosia, Yep, Startpage and Marginalia all
 *     refuse a datacenter — CAPTCHA, 403, WAF or a JS interstitial — several
 *     of them behind an HTTP 200.
 *   * Brave's HTML is the one keyless general-web source that genuinely
 *     works, and it is still rejected below. See `pickBackend`.
 *   * z.ai's `web_search` on the coding endpoint this project uses returns
 *     HTTP 200 and SILENTLY DISCARDS the tool: 29 prompt tokens, no search
 *     fields, and a confident answer from a 2025 cutoff. There is no error to
 *     branch on. That single measurement is why this tool reports which
 *     backend answered in every single result.
 *
 * ── SO: ONE PAID-IF-CONFIGURED PATH, AND A FLOOR THAT ALWAYS WORKS ─────────
 *
 * With a reserve credential present we ask OpenRouter's server-side `web`
 * plugin — the only backend anyone got live post-cutoff results from, and the
 * only one PROVEN reachable from this service's own egress (provider.ts's
 * `diagnose()` records an answer measured from production on 2026-09-15).
 *
 * With no credential, or when that answers 402/429, we fan out over three
 * official, documented, anti-bot-free JSON APIs: Wikipedia, Stack Overflow,
 * Hacker News. That floor is REAL CODE and not decoration, because the
 * credential's balance was reported at zero and the plugin may start billing.
 *
 * The floor's scope is honestly small: it cannot answer a price, a news
 * event, a product release, or "how do I fix X" unless somebody asked it on
 * Stack Overflow. When it finds nothing it says so. Saying so is the feature —
 * this whole branch of work started from a turn that claimed it had perceived
 * nothing and then answered anyway.
 */

import { reserveEnv } from './provider'
import { checkUrlShape, readBoundedText } from './web-guard'

export interface SearchHit {
  title: string
  url: string
  snippet?: string
}

export interface SearchOutcome {
  backend: string
  hits: SearchHit[]
  /** Sources that did not answer. Reported, never fatal. */
  failed: string[]
  /** Why we are not on the backend the caller might have expected. */
  fellBack?: string
}

export type SearchMode = 'auto' | 'keyless' | 'openrouter'

const KEYLESS_TIMEOUT_MS = 6_000
const OPENROUTER_TIMEOUT_MS = 20_000
const MAX_BACKEND_BYTES = 512 * 1024
const PER_SOURCE = 3

const USER_AGENT =
  'vibee-render/1.0 (Trinity S3AI agent; +https://t27.ai) node-fetch'

/** Minimal entity decode: these APIs escape titles, and only these five. */
function unescapeEntities(text: string): string {
  return String(text ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&')
}

/** Wikimedia excerpts arrive with `<span class="searchmatch">` around hits. */
function stripTags(text: string): string {
  return unescapeEntities(String(text ?? '').replace(/<[^>]*>/g, '')).trim()
}

function clip(text: unknown, max: number): string {
  const s = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return s.length > max ? s.slice(0, max) : s
}

async function getJson(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<any> {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json', 'user-agent': USER_AGENT },
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const text = await readBoundedText(response, MAX_BACKEND_BYTES)
  return JSON.parse(text)
}

/**
 * Wikipedia. The URL is CONSTRUCTED from `key`, because the API returns no
 * link field — a detail worth writing down, since assuming `.url` here yields
 * `undefined` in every result.
 */
async function wikipedia(
  query: string,
  fetchImpl: typeof fetch
): Promise<SearchHit[]> {
  const url =
    'https://api.wikimedia.org/core/v1/wikipedia/en/search/page?q=' +
    encodeURIComponent(query) +
    `&limit=${PER_SOURCE}`
  const data = await getJson(url, fetchImpl, KEYLESS_TIMEOUT_MS)
  return (Array.isArray(data?.pages) ? data.pages : []).map((p: any) => ({
    title: clip(p?.title, 200),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(p?.key ?? ''))}`,
    snippet: clip(stripTags(p?.excerpt ?? ''), 400),
  }))
}

/** Stack Overflow. Reports `quota_remaining` in every answer, so it self-governs. */
async function stackoverflow(
  query: string,
  fetchImpl: typeof fetch
): Promise<SearchHit[]> {
  const url =
    'https://api.stackexchange.com/2.3/search/advanced?site=stackoverflow' +
    `&order=desc&sort=relevance&pagesize=${PER_SOURCE}&q=` +
    encodeURIComponent(query)
  const data = await getJson(url, fetchImpl, KEYLESS_TIMEOUT_MS)
  return (Array.isArray(data?.items) ? data.items : []).map((i: any) => ({
    title: clip(unescapeEntities(i?.title ?? ''), 200),
    url: String(i?.link ?? ''),
    snippet: i?.is_answered
      ? `отвечен, ${Number(i?.score ?? 0)} голосов`
      : 'без принятого ответа',
  }))
}

/** Hacker News. The outbound link is the real destination, not an HN page. */
async function hackernews(
  query: string,
  fetchImpl: typeof fetch
): Promise<SearchHit[]> {
  const url =
    'https://hn.algolia.com/api/v1/search?hitsPerPage=' +
    PER_SOURCE +
    '&query=' +
    encodeURIComponent(query)
  const data = await getJson(url, fetchImpl, KEYLESS_TIMEOUT_MS)
  return (Array.isArray(data?.hits) ? data.hits : []).map((h: any) => ({
    title: clip(h?.title ?? h?.story_title ?? '', 200),
    url: String(
      h?.url ??
        h?.story_url ??
        `https://news.ycombinator.com/item?id=${String(h?.objectID ?? '')}`
    ),
    snippet: clip(h?.story_text ?? h?.comment_text ?? '', 400),
  }))
}

const KEYLESS_SOURCES: Array<{
  name: string
  run: (q: string, f: typeof fetch) => Promise<SearchHit[]>
}> = [
  { name: 'wikipedia', run: wikipedia },
  { name: 'stackoverflow', run: stackoverflow },
  { name: 'hackernews', run: hackernews },
]

/**
 * All three at once, and one failing is REPORTED rather than fatal.
 *
 * `Promise.allSettled` and not `all`: Stack Exchange's quota, a cold Algolia
 * shard and a Wikimedia hiccup are independent, and two sources are a better
 * answer than an exception.
 */
export async function keylessSearch(
  query: string,
  fetchImpl: typeof fetch = fetch
): Promise<SearchOutcome> {
  const settled = await Promise.allSettled(
    KEYLESS_SOURCES.map(s => s.run(query, fetchImpl))
  )
  const hits: SearchHit[] = []
  const failed: string[] = []
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') hits.push(...result.value)
    else failed.push(KEYLESS_SOURCES[index].name)
  })
  return { backend: 'keyless', hits, failed }
}

/**
 * OpenRouter's `web` plugin, as a SIDE-REQUEST whose prose we throw away.
 *
 * Keeping only `url_citation` annotations is a security decision, not a
 * tidiness one. `message.content` is attacker-authored page text laundered
 * through a second model into a confident summary — the exact shape that
 * strips a quotation fence of its meaning, because by then nothing marks the
 * words as somebody else's. Links and titles we can fence; a summary we
 * cannot.
 */
export async function openrouterSearch(
  query: string,
  count: number,
  fetchImpl: typeof fetch = fetch
): Promise<SearchOutcome> {
  const reserve = reserveEnv()
  if (!reserve) return { backend: 'openrouter', hits: [], failed: ['no-key'] }

  const model = (process.env.WEB_SEARCH_MODEL || '').trim() || reserve.model
  const response = await fetchImpl(`${reserve.base}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${reserve.key}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: query }],
      // The answer is discarded; only the citations matter. Anything larger
      // is money spent on text we delete.
      max_tokens: 64,
      plugins: [{ id: 'web', max_results: count }],
    }),
  })

  if (!response.ok) {
    throw new Error(`openrouter HTTP ${response.status}`)
  }
  const data = JSON.parse(await readBoundedText(response, MAX_BACKEND_BYTES))
  const annotations = data?.choices?.[0]?.message?.annotations
  const hits: SearchHit[] = (Array.isArray(annotations) ? annotations : [])
    .filter((a: any) => a?.type === 'url_citation' && a?.url_citation?.url)
    .map((a: any) => ({
      title: clip(a.url_citation.title ?? '', 200),
      url: String(a.url_citation.url),
      snippet: clip(a.url_citation.content ?? '', 400),
    }))

  // Zero citations is NOT an empty internet -- it is a search that did not
  // happen, which is exactly what z.ai did behind an HTTP 200.
  return {
    backend: 'openrouter',
    hits,
    failed: hits.length ? [] : ['no-citations'],
  }
}

/**
 * Which backend, and why.
 *
 * `auto` prefers OpenRouter when a reserve credential exists, because it is
 * strictly better when it works, and falls to the keyless floor otherwise —
 * so a deployment with no keys at all still has a working tool.
 *
 * BRAVE'S HTML IS DELIBERATELY ABSENT, though it was the only keyless
 * general-web source that answered correctly on 6 of 6 queries. Four reasons,
 * any one sufficient: its result markup keys on Svelte build hashes
 * (`svelte-jmfu5f`) that a deploy silently renames; an 8-query burst earned
 * six 429s in one second from CloudFront with NO Retry-After, and the block
 * was still live ten minutes later, so there is nothing to back off against;
 * scraping the UI is against Brave's terms, and they sell the API for exactly
 * this; and decisively, every one of those measurements came from a
 * residential IP, while this service runs in a datacenter — which is what
 * those edge blocks exist to stop. "Works from a laptop" is not evidence
 * about production.
 */
export function pickBackend(mode?: string): {
  mode: SearchMode
  reason: string
} {
  const asked = String(mode ?? process.env.WEB_SEARCH_BACKEND ?? 'auto').trim()
  if (asked === 'keyless') return { mode: 'keyless', reason: 'выбрано вручную' }
  if (asked === 'openrouter') {
    return { mode: 'openrouter', reason: 'выбрано вручную' }
  }
  return reserveEnv()
    ? { mode: 'openrouter', reason: 'есть резервный ключ' }
    : { mode: 'keyless', reason: 'ключа нет, работаю по открытым источникам' }
}

/**
 * Search, with the fallback already inside.
 *
 * Every URL goes through `checkUrlShape` — the no-DNS half of the guard. This
 * is not ceremony: without the IP-literal branch the tool hands the model
 * `http://169.254.169.254/latest/meta-data/` as a validated-looking result,
 * and 46 sibling tools take a URL argument and apply no guard of their own.
 */
export async function webSearch(
  query: string,
  count: number,
  opts: { mode?: string; fetchImpl?: typeof fetch } = {}
): Promise<SearchOutcome> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const chosen = pickBackend(opts.mode)

  let outcome: SearchOutcome
  let fellBack: string | undefined

  if (chosen.mode === 'openrouter') {
    try {
      outcome = await openrouterSearch(query, count, fetchImpl)
      if (!outcome.hits.length && String(opts.mode ?? '') !== 'openrouter') {
        fellBack = 'поиск через ключ ничего не вернул'
        outcome = await keylessSearch(query, fetchImpl)
      }
    } catch (error) {
      const why = String((error as Error)?.message || error)
      console.warn('[web] openrouter search failed:', why)
      if (String(opts.mode ?? '') === 'openrouter') {
        return { backend: 'openrouter', hits: [], failed: [why] }
      }
      fellBack = `поиск через ключ не ответил (${why})`
      outcome = await keylessSearch(query, fetchImpl)
    }
  } else {
    outcome = await keylessSearch(query, fetchImpl)
  }

  const seen = new Set<string>()
  const hits: SearchHit[] = []
  for (const hit of outcome.hits) {
    const shape = checkUrlShape(hit.url)
    if (!shape.ok) continue
    // The fragment is not identity: `#a` and `#b` are one page.
    const identity = shape.url.href.split('#')[0]
    if (seen.has(identity)) continue
    seen.add(identity)
    hits.push({
      title: clip(hit.title, 200) || identity,
      url: clip(shape.url.href, 400),
      snippet: hit.snippet ? clip(hit.snippet, 400) : undefined,
    })
    if (hits.length >= count) break
  }

  return { ...outcome, hits, fellBack }
}
