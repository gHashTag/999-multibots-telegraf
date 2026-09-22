/**
 * WHO MAY READ A SHELF KEY -- ONE DECISION.
 *
 * `/s3/<key>` answers anyone holding the link, and until 2026-09-22 that was
 * safe by accident for documents: every pdf, docx, txt or zip fell into the
 * ffmpeg branch and came back as a 500. The route now serves them as stored
 * (shelf-route.ts), and the ingest had named a client's attachment
 * `assets/<ms>-file-<message id>.<ext>` -- a millisecond and a message id, a
 * key someone can walk. `assetKeyFor` put a random part into NEW keys; the
 * documents already on the shelf kept the walkable shape.
 *
 * Measured on production the same day (render Postgres, `user_media`,
 * aggregates only): 140 document rows under the old shape across 6 owners
 * and 57 people -- 77 pdf, 31 tgs, 13 bin, 9 md, 3 docx, 2 txt, 2 zip and
 * single others -- next to 32 document rows under the random shape.
 *
 * The rule, in the order it is checked:
 *
 *   1. A picture, a sound, a video or a `.json` is PUBLIC, whatever its key.
 *      These are the kinds the route served before 2026-09-22 (the video
 *      through its H.264 copy), so nothing that reads them today can break:
 *      the feed, the player's <img>/<audio>/<video>, Remotion's Chrome, the
 *      providers handed a link, the content factory's manifests.
 *      Two exceptions to "whatever the route types as media". `.tif`,
 *      `.tiff` and `.ico` are NOT public: the old route never streamed them
 *      (they went to ffmpeg), no <img> reader here asks for them, and a
 *      `.tif` is what a scanned document sent as a file looks like. `.oga`
 *      IS public although the old route did not stream it either: it is
 *      Telegram's voice-note extension, and the transcriber fetches the
 *      shelf URL over HTTP with no credential (`transcribeWithWhisper`).
 *   2. Any other file whose name carries the random part `assetKeyFor` gives
 *      (`<ms>-<16 hex>-<name>`) is PUBLIC: the link is the only way in, as
 *      #2842 decided for new keys.
 *   3. Everything else -- a document under a walkable key -- is served only
 *      to the server key (`X-Api-Key`) or with a signature this server put on
 *      a link it handed out (`?exp=<unix s>&sig=<hmac>`, `shelfLinkFor`).
 *
 * Why not "any signed-in person" for rule 3: a session, an initData or an
 * agent key says WHO is asking, not that the object is theirs -- a bucket key
 * has no owner to compare with. The signature is minted only where ownership
 * was already checked (`crm_lead_media` and `tg_fetch_media` answer the seller
 * about their own people, `GET /api/crm/media` answers the owner about their
 * own library), so a valid signature carries that check with it.
 *
 * Nobody could depend on rule 3 being otherwise: until this morning the same
 * request answered 500.
 *
 * What rule 1 still leaves public under a walkable key: photos and voice
 * notes from private chats, AND any document a person sent as a file whose
 * name ends in an image, audio, video or `.json` extension -- a `.jpg` scan,
 * an `.mp4` recording, a `.json` export. The key shape cannot tell those
 * apart from media; only signed links in every media reader, or moving the
 * old objects to random keys, would close them.
 *
 * The decision reads the DECODED key the route will ask the bucket for, and
 * only its last segment: a percent-encoded path, `?original=1`, HEAD or a
 * Range change nothing, and a key that is not clean (an empty or dot segment,
 * a backslash) is never public by rule 2 -- storage that normalises paths
 * could otherwise turn a public-looking key into a private object's name.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { derivedSigningKey } from '../../session'
import { shelfExtension, shelfContentType } from './shelf-route'
import { shelfObject } from '../agent/media-parts'

/** How long a link handed out stays good. Every reader lists again. */
export const SHELF_LINK_TTL_S = 24 * 60 * 60

const LINK_LABEL = 'shelf-link-v1'

/**
 * Typed as images, never streamed by the old route, read by nothing that
 * needs them public (rule 1's exception).
 */
const NOT_PUBLIC_MEDIA: ReadonlySet<string> = new Set(['tif', 'tiff', 'ico'])

/** `<ms>-<16 hex>-` at the start of the last segment: `assetKeyFor`'s shape. */
const RANDOM_NAME = /^\d{1,16}-[0-9a-f]{16}-/

/** A key with no empty, `.` or `..` segment and no backslash. */
function isCleanKey(key: string): boolean {
  if (key.includes('\\')) return false
  return key.split('/').every(s => s !== '' && s !== '.' && s !== '..')
}

/** Rules 1 and 2: may anyone with the link read this key? */
export function isPublicShelfKey(key: string): boolean {
  const k = String(key ?? '')
  const type = shelfContentType(k).split(';')[0].trim()
  if (
    /^(image|audio|video)\//.test(type) &&
    !NOT_PUBLIC_MEDIA.has(shelfExtension(k))
  )
    return true
  if (shelfExtension(k) === 'json') return true
  if (!isCleanKey(k)) return false
  const last = k.split('/').pop() ?? ''
  return RANDOM_NAME.test(last)
}

function linkKey(): Buffer | null {
  try {
    return derivedSigningKey(LINK_LABEL)
  } catch {
    // No signing key configured: nothing can be signed, and nothing signed
    // is believed. Fails closed -- rule 3 keys then open to X-Api-Key only.
    return null
  }
}

function mac(secret: Buffer, key: string, exp: number): string {
  return createHmac('sha256', secret)
    .update(`${key}\n${exp}`, 'utf8')
    .digest('base64url')
}

/** `{exp, sig}` for one key, or null when there is no signing key. */
export function signShelfKey(
  key: string,
  nowMs: number = Date.now()
): { exp: number; sig: string } | null {
  const secret = linkKey()
  if (!secret) return null
  const exp = Math.floor(nowMs / 1000) + SHELF_LINK_TTL_S
  return { exp, sig: mac(secret, key, exp) }
}

/** Is `?exp=&sig=` a live signature for exactly this key? */
export function hasValidShelfSignature(
  key: string,
  query: URLSearchParams,
  nowMs: number = Date.now()
): boolean {
  const expRaw = query.get('exp') ?? ''
  const sig = query.get('sig') ?? ''
  if (!/^\d{1,12}$/.test(expRaw) || !sig) return false
  const exp = Number(expRaw)
  if (exp * 1000 <= nowMs) return false
  const secret = linkKey()
  if (!secret) return false
  const want = Buffer.from(mac(secret, key, exp))
  const got = Buffer.from(sig)
  return got.length === want.length && timingSafeEqual(got, want)
}

export type ShelfAccess = 'public' | 'granted' | 'refused'

/** The one decision the route asks: rules 1-3 in order. */
export function shelfReadAccess(
  key: string,
  query: URLSearchParams,
  serverKey: boolean,
  nowMs: number = Date.now()
): ShelfAccess {
  if (isPublicShelfKey(key)) return 'public'
  if (serverKey) return 'granted'
  if (hasValidShelfSignature(key, query, nowMs)) return 'granted'
  return 'refused'
}

/**
 * The link to hand out for a URL on our own shelf: signed when its key is
 * not public, unchanged otherwise (and unchanged for anything that is not an
 * object on our shelf). Applied where a URL LEAVES the server, never to what
 * is stored: `user_media` keys its rows by the bare URL, and every reader
 * that reads by key (`shelfObject`) drops the query anyway.
 *
 * "On our shelf" is `shelfObject`'s answer, the same one every by-key reader
 * and both library write doors use: a relative `/s3/<key>` row is ours and
 * comes back absolute and signed, and the set of URLs signed here is exactly
 * the set those doors refuse to store from a caller. The link is its
 * canonical spelling -- query and fragment dropped, as the route ignores
 * them for a document -- so the signature covers the key the route decodes.
 */
export function shelfLinkFor(raw: string, nowMs: number = Date.now()): string {
  const text = String(raw ?? '')
  const found = shelfObject(text)
  if (!found || isPublicShelfKey(found.key)) return text
  const signed = signShelfKey(found.key, nowMs)
  if (!signed) return text
  const url = new URL(found.url)
  url.searchParams.set('exp', String(signed.exp))
  url.searchParams.set('sig', signed.sig)
  return url.toString()
}
