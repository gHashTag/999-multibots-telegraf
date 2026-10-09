/**
 * EVERY KIE NEURO-FUNCTION THE AGENT MAY ORDER (spec agent-neuro-kie.t27,
 * issue #3924).
 *
 * Owner, 2026-10-09: "where are all the neuro-functions? connect them all!"
 * and "Kie is our main one!". The agent had five raw media tools; upscale,
 * background removal, image-to-video and a choice of Kie picture models
 * lived only in bot scenes on dead providers, though Kie sells each with its
 * price named before the press (priceForModel over the Kie list).
 *
 * Every rule here is the spec's compiled body and every model its constant;
 * this file only puts them together for the tools in tools.ts.
 */
import * as SPEC from '../spec/agent-neuro-kie.gen'
import {
  mayOrderImage,
  sourceOk,
  videoRoute,
} from '../spec/agent-neuro-kie.logic'
import { priceForModel } from './billing-shared'

/**
 * The tools that work on a source picture: ROWS OF THE SPEC'S TABLE (name,
 * Kie model, what the agent is told). A new Kie function is a new row in
 * agent-neuro-kie.t27, never new code here (owner, 2026-10-09: "all new
 * code is written in .t27").
 */
export const SOURCE_TOOLS = SPEC.SOURCE_TOOL_NAMES.map((name, i) => ({
  name,
  model: SPEC.SOURCE_TOOL_MODELS[i],
  help: SPEC.SOURCE_TOOL_HELP[i],
}))

/** Why a source tool refuses, or null when it may run. */
export function sourceRefusal(sourceUrl: unknown): string | null {
  const given = typeof sourceUrl === 'string' && /^https?:\/\//i.test(sourceUrl)
  return sourceOk(true, given)
    ? null
    : 'нужна исходная картинка: image_url (ссылка на файл, например из my_assets или результата image_edit). Ничего не списано.' // cyrillic-ok: the tool's answer the model relays
}

/**
 * A Kie picture model named for image_generate: the model, a refusal, or
 * null when the name is no Kie model (the chain decides then).
 */
export function kieImageOrder(
  model: unknown
): { model: string } | { refused: string } | null {
  if (typeof model !== 'string' || !/^\s*kie\//i.test(model)) return null
  const chosen = model.trim()
  const price = priceForModel('image_generate', chosen)
  if (!mayOrderImage(true, typeof price === 'number' && price > 0))
    return {
      refused: `модель ${chosen.slice(0, 80)} не продаётся: цену нельзя назвать до нажатия. Без модели картинку нарисует Kie nano-banana. Ничего не списано.`, // cyrillic-ok: the tool's answer the model relays
    }
  return { model: chosen }
}

/** The video model when a picture is given, or null to keep the words' model. */
export function imageVideoModel(imageUrl: unknown): string | null {
  const given = typeof imageUrl === 'string' && /^https?:\/\//i.test(imageUrl)
  return videoRoute(given) === SPEC.VIDEO_FROM_IMAGE
    ? SPEC.IMAGE_TO_VIDEO_MODEL
    : null
}
