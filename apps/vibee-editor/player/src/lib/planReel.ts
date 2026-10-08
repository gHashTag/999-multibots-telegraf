/**
 * A REEL AS A PICTURE (plan-reel.t27): the frame at PREVIEW_SEEK_MS of the
 * reel itself, 9:16, muted, never playing by itself -- on its plan card, in
 * "My reels", and the newest PREVIEWS_MAX on the cabinet's story card.
 *
 * The numbers come from the spec's generated module (a copy of the render's,
 * src/spec/plan-reel.gen.ts); planReel.test.ts runs the spec's vectors here.
 */
import * as SPEC from '@/spec/plan-reel.gen'

/** The reel's address, asking the browser for its frame past the first. */
export function previewSrc(url: string): string {
  return `${url.replace(/#.*$/, '')}#t=${SPEC.PREVIEW_SEEK_MS / 1000}`
}

/** spec preview_height: a picture of this width is 9:16. */
export function previewHeight(width: number): number {
  return Math.floor((width * SPEC.PREVIEW_H) / SPEC.PREVIEW_W)
}

/** spec previews_shown: how many the cabinet's story card shows. */
export function previewsShown(reelsOut: number): number {
  return Math.min(reelsOut, SPEC.PREVIEWS_MAX)
}

/** spec preview_shown: a reel that came out stands on its card. */
export function previewShown(url: string | null | undefined): boolean {
  return typeof url === 'string' && /^https?:\/\//.test(url)
}

/**
 * spec picture_of, on what the server answers (plan-reel v3): it sends a
 * poster only when one is kept, so a web address is POSTER_KEPT and anything
 * else leaves the frame to the browser.
 */
export function pictureOf(poster: string | null | undefined): number {
  return typeof poster === 'string' && /^https?:\/\//.test(poster)
    ? SPEC.PICTURE_POSTER
    : SPEC.PICTURE_FRAME
}

/** The trial is the plan's first reel (spec scenes_for): a smaller press. */
export function isTrial(scenes: number): boolean {
  return scenes === SPEC.TRIAL_SCENES
}

export const PREVIEW_CARD_PX = SPEC.PREVIEW_CARD_PX
