/**
 * THE AGENT'S REELS AND PICTURES ARE MADE ON KIE (spec agent-media-kie.t27,
 * issue #3920).
 *
 * Owner, 2026-10-09: "why can the reels agent not make reels? what nonsense?
 * solve it, and the cow must be real!". Measured that day: `video_generate`
 * called Replicate only and Replicate is off, so every clip failed and was
 * refunded; Kie video was refused to the agent although the route sells it
 * by the same `priceForModel` as the app; the picture chain reached Kie last
 * and priced it out, so a free watermarked draft drew the cow.
 *
 * Every rule here is the spec's compiled body (agent-media-kie.logic.ts) and
 * every number its generated constant; this file only puts them together.
 */
import * as SPEC from '../spec/agent-media-kie.gen'
import {
  addsRealism,
  clipSeconds,
  mayOrderVideo,
} from '../spec/agent-media-kie.logic'
import {
  kieVideoSaleOf,
  videoChargeLength,
  videoChargeUnits,
  секундыКОплате, // cyrillic-ok: existing export
} from './billing-shared'

/**
 * The words a prompt with no named style is given (spec adds_realism). The
 * copy is the host's; WHETHER it is added is the spec's.
 */
export const REALISM_WORDS =
  'Photorealistic live-action footage of real subjects, shot on a real camera, natural light, true-to-life anatomy and texture; not a cartoon, not an illustration, not CGI.'

/** The prompt as the provider gets it: the person's words, then realism. */
export function realPrompt(prompt: string, style: unknown): string {
  const styleNamed = typeof style === 'string' && style.trim().length > 0
  const words = String(prompt ?? '').trim()
  if (!addsRealism(styleNamed))
    return `${words} Style: ${String(style).trim()}.`
  return `${words}\n${REALISM_WORDS}`
}

export interface VideoOrder {
  /** `kie/<id>`: the model the route is asked for and the charge is priced by. */
  model: string
  /** The length the route is asked for (6 or 10). */
  seconds: number
  /** How many units the price is charged for: seconds, or one clip. */
  units: number
}

/**
 * What the agent orders: the named Kie model when its bill is named before
 * the press, else the spec's default. A name that is not a Kie model (the old
 * Replicate names) is not a refusal: it is the default clip, because the
 * person asked for a video, not for a vendor.
 */
export function videoOrder(
  model: unknown,
  duration: unknown
): VideoOrder | { refused: string } {
  const named =
    typeof model === 'string' && /^\s*kie\//i.test(model) ? model.trim() : null
  const chosen = named ?? SPEC.AGENT_VIDEO_MODEL
  const sale = kieVideoSaleOf(chosen)
  if (!mayOrderVideo(true, sale.sold))
    return {
      refused:
        `модель ${chosen.slice(0, 80)} не продаётся: ${sale.sold ? '' : sale.why}. ` + // cyrillic-ok: the tool's answer the model relays
        `Без модели ролик сделает ${SPEC.AGENT_VIDEO_MODEL}. Ничего не списано.`, // cyrillic-ok: the tool's answer the model relays
    }
  // A model priced by the length of a FILE it is sent (an upscaler) has no
  // file here: video_generate is made from words. Refused, never thrown.
  const rule = videoChargeLength(chosen)
  if (rule === 'file')
    return {
      refused:
        `модель ${chosen.slice(0, 80)} обрабатывает присланный ролик, а не описание. ` + // cyrillic-ok: the tool's answer the model relays
        `Без модели ролик сделает ${SPEC.AGENT_VIDEO_MODEL}. Ничего не списано.`, // cyrillic-ok: the tool's answer the model relays
    }
  const seconds = clipSeconds(секундыКОплате(duration)) // cyrillic-ok: existing export
  return {
    model: chosen,
    seconds,
    units: videoChargeUnits(rule, seconds),
  }
}
