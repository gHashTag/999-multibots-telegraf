/**
 * A PHOTO PER SCENE (crm-story-reel.t27 v31).
 *
 * Owner, 2026-10-09: the storyboard showed the same avatar three times --
 * every scene was drawn from one face. Telegram keeps a person's profile
 * photos as a history; all of them (up to AVATARS_MAX) are the default, one
 * per scene, round and round. A photo the seller picks for one scene (a tap
 * on its tile) wins for that scene; the seller's one photo for the whole reel
 * still wins over the avatars; a client with no avatar keeps the reel's face.
 *
 * `sceneFace` and `sceneSource` mirror the spec's fns of the same names; the
 * spec's vectors run against them in src/spec/crm-story-reel.test.ts.
 */
import * as SPEC from '../spec/crm-story-reel.gen'

/** Which avatar scene i takes when nothing was picked: i mod n. */
export function sceneFace(i: number, nAvatars: number): number {
  if (nAvatars === 0) return 0
  return i % nAvatars
}

/** Where scene i's photo comes from (SOURCE_*). */
export function sceneSource(
  picked: boolean,
  reelFaceCustom: boolean,
  nAvatars: number
): number {
  if (picked) return SPEC.SOURCE_PICKED
  if (reelFaceCustom) return SPEC.SOURCE_REEL_FACE
  if (nAvatars > 0) return SPEC.SOURCE_AVATAR
  return SPEC.SOURCE_NONE
}

const isUrl = (u: unknown): u is string =>
  typeof u === 'string' && /^https:\/\/\S+$/.test(u.trim())

/** Up to `max` distinct https urls, in order. */
export function urlList(v: unknown, max: number): string[] {
  const out: string[] = []
  for (const u of Array.isArray(v) ? v : []) {
    const t = String(u ?? '').trim()
    if (isUrl(t) && !out.includes(t)) out.push(t)
    if (out.length >= max) break
  }
  return out
}

/**
 * The photo of every scene, `count` of them. `picks[i]` is the seller's pick
 * for scene i ('' -- none); `avatars` her profile photos, newest first;
 * `face` the reel's one face, `faceCustom` whether the seller set it.
 */
export function sceneFacesFor(o: {
  count: number
  picks: readonly string[]
  avatars: readonly string[]
  face: string
  faceCustom: boolean
}): string[] {
  return Array.from({ length: Math.max(0, o.count) }, (_, i) => {
    const pick = String(o.picks[i] ?? '').trim()
    const from = sceneSource(isUrl(pick), o.faceCustom, o.avatars.length)
    if (from === SPEC.SOURCE_PICKED) return pick
    if (from === SPEC.SOURCE_AVATAR)
      return o.avatars[sceneFace(i, o.avatars.length)]
    return o.face
  })
}
