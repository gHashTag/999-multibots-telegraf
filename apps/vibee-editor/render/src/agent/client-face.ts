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
 *   1. their Telegram AVATAR -- the owner's word, repeated: "img2img gpt 2.5
 *      FROM THE USER'S AVATAR". It is the one picture a person chose to stand
 *      for themselves;
 *   2. only when there is no avatar: a photo they SENT in the correspondence
 *      whose description shows exactly ONE ADULT face (media-library.ts keeps
 *      what they sent, with what the vision model saw in it);
 *   3. nothing -- and then nobody is drawn: the seller asks them for a photo.
 *
 * WHY A SENT PHOTO IS NOT FIRST ANY MORE. It was, for one day, and a probe
 * showed what that costs: the vision model writes a generic two-line caption,
 * and "a boy of five in a sandbox", "a model in a cosmetics ad", "a man and a
 * woman at a wedding" all contain a person word. A photo of their child, their
 * partner or an advert became "their face", and was drawn instead of their
 * avatar with the caption "this is you".
 *
 * A URL offered by the model is accepted only when it IS one of the photos
 * this person sent to this owner AND its description shows one adult face.
 * A sent file nobody has looked at yet (no description) is not a face.
 */
// The story frame's safe zone is the spec's: gHashTag/t27 specs/automation/crm-lead-magnet.t27.
import * as LM from '../spec/crm-lead-magnet.gen'

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
/*
 * Somebody who is not the grown-up we are writing to: a child, a relative, a
 * partner. A negative lookahead for a Cyrillic letter stands in for \b after
 * a Cyrillic stem.
 */
const NOT_THEM_PERSON =
  /(мальчик|мальчишк|девочк|ребён|ребен|малыш|младен|детск|дети|детей|школьни|подрост|сын(?![а-яё])|сына|сыном|дочь|дочк|дочер|внук|внучк|бабушк|дедушк|мама|мамой|маму|папа|папой|отец|отца|муж(?![а-яё])|мужем|жена(?![а-яё])|женой|супруг|родител|жених|невест|\bkids?\b|\bchild|\bbaby\b|\btoddler|\bboy\b|\bteen|\bdaughter|\bson\b|\bmother|\bfather|\bgrand|\bhusband|\bwife\b)/i // cyrillic-ok: the words the vision model writes
/* More than one person in the frame, said in words. */
const A_GROUP =
  /(двое|трое|две(?![а-яё])|два(?![а-яё])|двух|три(?![а-яё])|трёх|трех|пара(?![а-яё])|парой|пары(?![а-яё])|вдвоём|вдвоем|семь[яиеюё]|семейн|свадьб|друзья|друзьями|подруг|компани|групп|толп|люди|людей|несколько|коллектив|\bcouple\b|\bfamily\b|\bwedding\b|\bfriends\b|\bgroup\b|\bpeople\b|\bcrowd\b|\btwo\b|\bthree\b)/i // cyrillic-ok: the words the vision model writes
/* Not a photo of a real person they are: an advert, a poster, a drawing. */
const NOT_A_PHOTO_OF_THEM =
  /(реклам|модель|манекен|постер|плакат|афиш|обложк|журнал|баннер|билборд|кадр из фильма|актёр|актер|актрис|знаменит|звезд|картин|рисун|иллюстрац|мульт|аниме|статуя|скульптур|\bads?\b|advert|poster|\bmodel\b|magazine|\bcover\b|actor|actress|celebrity|illustration|cartoon|drawing|painting|statue)/i // cyrillic-ok: the words the vision model writes
/* The person nouns, by stem: two different ones mean two people. */
const PERSON_NOUN =
  /(женщин|мужчин|девушк|парен|парн|человек|\bwoman|\bwomen|\bman\b|\bmen\b|\bperson|\bguy)/gi // cyrillic-ok: the words the vision model writes

/**
 * The only text-to-image a client gets has nobody in it. Placed at the very
 * start of the prompt, where the model weighs it most.
 */
export const NO_PERSON_PREFIX =
  'No people, no faces, no human figures or silhouettes anywhere in the image. '

/**
 * A CLIENT'S PORTRAIT: identity FIRST, scene second. Face-consistency guides
 * for img2img models agree on the order: the model weighs the opening of the
 * prompt most, so the "same person" constraint goes before the scene text,
 * phrased as positive instructions (what to keep) rather than a list of
 * don'ts. Here, and not in crm-deliver-tool.ts, because image_edit needs the
 * same words for a client turn (a duet, a client thread) and must not import
 * the delivery tool to get them.
 */
export const PORTRAIT_IDENTITY_PREFIX =
  'Keep the exact same person as in the reference photo: same face, eye shape, ' +
  'nose, jawline, lips, skin tone and hairstyle; change only the scene, outfit, ' +
  'light and mood. '
/**
 * The story frame is covered by app UI at the top and the bottom, so the face
 * lives in the central band and nothing is written into the picture: the
 * caption carries the words. The bands are the spec's (crm-lead-magnet.t27
 * SAFE_ZONE_*): until v2 they lived only in this comment, and the model was
 * told "the top or bottom band" with no size at all.
 */
export const PORTRAIT_FRAMING_SUFFIX =
  ` Vertical ${LM.ASPECT_RATIO} story portrait, the face in the central third of the frame; ` +
  `keep the face and anything important out of the top ${LM.SAFE_ZONE_TOP_PCT}%, ` +
  `the bottom ${LM.SAFE_ZONE_BOTTOM_PCT}% and ${LM.SAFE_ZONE_SIDE_PCT}% at each side; ` +
  'no text, no watermark, no logo.'

/** Does what the vision model saw in this photo include a face? */
export function showsAFace(transcript: unknown): boolean {
  const t = String(transcript ?? '')
  return SHOWS_A_FACE.test(t) && !SHOWS_NO_FACE.test(t)
}

/**
 * Is this, by its description, a photo of ONE grown-up -- the person we are
 * writing to, and nobody else? Only such a photo may stand in for them. A
 * missing description is a no: nobody has looked at the file yet.
 */
export function showsOneAdultFace(transcript: unknown): boolean {
  const t = String(transcript ?? '')
  if (!t.trim() || !showsAFace(t)) return false
  if (NOT_THEM_PERSON.test(t) || A_GROUP.test(t) || NOT_A_PHOTO_OF_THEM.test(t))
    return false
  const stems = new Set(
    [...t.matchAll(PERSON_NOUN)].map(m => m[1].toLowerCase().slice(0, 5))
  )
  return stems.size <= 1
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
    const theirs = sent.find(p => p.url === asked)
    if (theirs && showsOneAdultFace(theirs.transcript))
      return { url: asked, from: 'sent' }
    ignored = theirs
      ? 'в описании этого фото не одно взрослое лицо (или его ещё не прочитали) — взято его лицо'
      : 'предложенный файл — не фото, присланное этим человеком; взято его лицо'
  }
  const avatar = deps.avatar ? await deps.avatar(ctx, lead).catch(() => '') : ''
  if (avatar)
    return { url: avatar, from: 'avatar', ...(ignored ? { ignored } : {}) }
  const withFace = sent.find(p => showsOneAdultFace(p.transcript))
  if (withFace)
    return { url: withFace.url, from: 'sent', ...(ignored ? { ignored } : {}) }
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
