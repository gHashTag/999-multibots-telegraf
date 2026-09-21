/**
 * A PICTURE OF A CLIENT IS A PICTURE OF THEIR FACE. ALWAYS.
 *
 * Owner, 2026-09-21, after a CRM portrait came out as somebody else: "he does
 * not use the clients' face -- this is mandatory". The product this CRM sells
 * is a picture of YOU; a picture of a stranger with your name on the caption
 * is worse than no picture, because it is the one thing the person can check
 * at a glance.
 *
 * There were three ways to draw a stranger, and each looked reasonable alone:
 *
 *   - crm_deliver_photo fell back to text-to-image when the avatar did not
 *     load, and said so in a field nobody read;
 *   - its paid mode was text-to-image by design;
 *   - image_edit with no image_url takes the CALLER's avatar -- in a duet or
 *     a client thread the caller is the owner, so "her portrait" was his face.
 *
 * So the face is chosen here, once, and every CRM path asks this module:
 *
 *   1. a photo the person SENT in the correspondence, when its description
 *      says it shows a face (media-library.ts keeps what they sent, with what
 *      the vision model saw in it) -- they chose it, and it is recent;
 *   2. their Telegram avatar;
 *   3. nothing -- and then nobody is drawn: the seller asks them for a photo.
 *
 * A URL offered by the model is accepted only when it IS one of the photos
 * this person sent to this owner. Anything else could be anybody.
 */

export interface SentPhoto {
  /** Our own storage URL (media-library never stores a Telegram file link). */
  url: string
  /** What the vision model saw; null when nobody has looked yet. */
  transcript: string | null
}

export interface FaceDeps {
  /** The person's profile photo, re-published on our storage; '' when none. */
  avatar?: (
    ctx: any,
    lead: { id: string; username?: string | null }
  ) => Promise<string>
  /** Images this person sent this owner, newest first. */
  sentPhotos?: (ctx: any, lead: string) => Promise<SentPhoto[]>
}

export type Face =
  | { url: string; from: 'sent' | 'avatar'; ignored?: string }
  | { refused: string }
  | null

/*
 * The description is written in Russian by the vision prompt
 * (media-vision.ts), so the words are Russian stems -- without \b, which is
 * ASCII-only in JavaScript and never fires beside a Cyrillic letter -- plus
 * the English ones for a description that came back in English.
 */
const SHOWS_A_FACE =
  /(лицо|лица|лицом|селфи|портрет|женщин|мужчин|девушк|парень|парня|девочк|мальчик|улыба|\bselfie\b|\bface\b|\bportrait\b|\bwoman\b|\bman\b|\bperson\b|\bgirl\b|\bboy\b)/i // cyrillic-ok: the words the vision model writes
const SHOWS_NO_FACE =
  /((без|нет)\s+(людей|человека|лиц)|скриншот|screenshot|\bno (people|person|face)\b)/i // cyrillic-ok: the words the vision model writes

/**
 * The only text-to-image a client gets has nobody in it. Placed at the very
 * start of the prompt, where the model weighs it most.
 */
export const NO_PERSON_PREFIX =
  'No people, no faces, no human figures or silhouettes anywhere in the image. '

/** Does what the vision model saw in this photo include a face? */
export function showsAFace(transcript: unknown): boolean {
  const t = String(transcript ?? '')
  return SHOWS_A_FACE.test(t) && !SHOWS_NO_FACE.test(t)
}

/** The one short line the seller sends when there is no face to draw from. */
export function askForPhotoLine(firstName: string | null | undefined): string {
  const name = String(firstName ?? '').trim()
  return (
    (name ? `${name}, пришлите` : 'Пришлите') +
    ', пожалуйста, своё фото, где хорошо видно лицо, — сделаю из него портрет в подарок.'
  )
}

/**
 * The face to draw this person from, or why there is none.
 *
 * `photoUrl` is the model's suggestion. It is honoured only when it is one of
 * their own sent photos; otherwise it is ignored, said so in `ignored`, and
 * the choice falls through to the rules above -- the model does not get to
 * pick whose face this is.
 */
export async function clientFace(
  ctx: any,
  lead: { id: string; username?: string | null },
  deps: FaceDeps,
  o: { photoUrl?: string | null } = {}
): Promise<Face> {
  const sent = deps.sentPhotos
    ? await deps.sentPhotos(ctx, lead.id).catch(() => [] as SentPhoto[])
    : []
  const asked = String(o.photoUrl ?? '').trim()
  let ignored: string | undefined
  if (asked) {
    if (sent.some(p => p.url === asked)) return { url: asked, from: 'sent' }
    ignored =
      'предложенный файл — не фото, присланное этим человеком; взято его лицо'
  }
  const withFace = sent.find(p => showsAFace(p.transcript))
  if (withFace)
    return { url: withFace.url, from: 'sent', ...(ignored ? { ignored } : {}) }
  const avatar = deps.avatar ? await deps.avatar(ctx, lead).catch(() => '') : ''
  if (avatar)
    return { url: avatar, from: 'avatar', ...(ignored ? { ignored } : {}) }
  return null
}

/**
 * The default door to what a person sent: media-library, scoped by the owner
 * asking. Loaded lazily -- the library pulls in the vision providers, which a
 * caller that never needs a face should not pay for at import time.
 */
export async function sentPhotosFromLibrary(
  ctx: any,
  lead: string
): Promise<SentPhoto[]> {
  const owner = String(ctx?.telegramId ?? '')
  if (!owner || !ctx?.pool || !/^\d{5,15}$/.test(String(lead))) return []
  const { listMedia } = await import('./media-library')
  const rows = await listMedia(ctx.pool, owner, String(lead), {
    kind: 'image',
    limit: 20,
  })
  return rows
    .filter(r => !r.out && /^https?:\/\//.test(r.url))
    .map(r => ({ url: r.url, transcript: r.transcript }))
}
