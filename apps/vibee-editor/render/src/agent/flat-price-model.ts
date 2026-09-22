/**
 * A TOOL SOLD AT ONE PRICE TAKES ONLY THE MODELS THAT PRICE COVERS.
 *
 * `image_generate` and `video_generate` are charged one flat price by the
 * agent tool layer -- `spendTokens(ctx, tool)` knows no model -- and then call
 * our own /api/generate/* with the agent key. The route charges nothing for
 * that key (it was paid at the tool layer, see `chargeMiniAppUser`) and sends
 * any `kie/<id>` model straight to its explicit Kie branch. That branch is
 * priced per model only for the mini app, whose charge passes the model to
 * `spendByTid`; the image chain's price floor never sees it either.
 *
 * So the agent path sold any enabled Kie model at the flat price. Measured
 * against the generated Kie price list (kie-prices.generated.ts) on
 * 2026-09-22:
 *
 *   image_generate  2 tokens cover $0.005   kie/google/imagen4-ultra  $0.06
 *   video_generate 40 tokens cover $0.10    kie/kling/v3-turbo-text-to-video
 *                                           $0.09 a second, $0.90 at 10 s
 *
 * over the agent chat and over /mcp alike, since both reach the same handler
 * with the caller's arguments untouched.
 *
 * (The 40 above is the price of that day's measurement. Later the same day
 * the video floor priced the Replicate clip by its length -- 72 tokens for 5
 * seconds, 144 for 10 at 720p (billing-shared.ts, `replicateClipTokens`) --
 * and the refusal below still holds: no single tool price covers every Kie
 * model.)
 *
 * REFUSED BEFORE THE CHARGE, NOT PRICED PER MODEL. Pricing per model here
 * would mean a second charge path in the tool file with daily traffic, and a
 * refund that has to mirror it model for model (refund-equals-the-charge
 * .test.ts is the record of how often that went wrong). The Kie models stay
 * on sale where they already carry their own price -- the mini app. A refusal
 * costs the caller one turn and no tokens.
 *
 * IMAGE IS AN ALLOW-LIST, VIDEO A DENY-LIST, AND THE DIFFERENCE IS WHAT EACH
 * ROUTE DOES WITH A NAME IT DOES NOT KNOW. The image route has a closed list
 * of FAL endpoints (FAL_IMAGE_MODELS) and every one of them goes through the
 * priced chain; allowing exactly that list means a new prefix branch in the
 * route cannot reopen this. The video route has no such list: a name that is
 * not `kie/` goes to the MCP branch, whose tools exist in no service of this
 * project, and falls through to the Replicate leg the flat price was set for
 * (render-server.ts, generateVideoViaReplicate). The `kie/` branch is the one
 * place a name picks a dearer provider, so that is what is refused.
 */

import { FAL_IMAGE_MODELS } from '../image-chain'

const KIE_PREFIX = /^\s*kie\//i

const shown = (model: unknown) => String(model).slice(0, 80)

/** Why `image_generate` will not take this model, or null when it will. */
export function imageModelRefusal(model: unknown): string | null {
  if (model === undefined || model === null || model === '') return null
  if (
    typeof model === 'string' &&
    (FAL_IMAGE_MODELS as readonly string[]).includes(model)
  )
    return null
  return (
    `модель ${shown(model)} не продаётся по цене image_generate: ` +
    `допустимы ${FAL_IMAGE_MODELS.join(', ')} или без модели. ` +
    (KIE_PREFIX.test(String(model))
      ? 'Модели Kie стоят каждая свою цену и заказываются в приложении. '
      : '') +
    'Ничего не списано.'
  )
}

/** Why `video_generate` will not take this model, or null when it will. */
export function videoModelRefusal(model: unknown): string | null {
  if (typeof model !== 'string' || !KIE_PREFIX.test(model)) return null
  return (
    `модель ${shown(model)} не продаётся по цене video_generate: ` +
    'модели Kie стоят каждая свою цену и заказываются в приложении. ' +
    'Без модели ролик сделает Replicate seedance-1-lite. Ничего не списано.'
  )
}
