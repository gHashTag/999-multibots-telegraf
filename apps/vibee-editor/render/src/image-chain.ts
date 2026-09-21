/**
 * THE ORDERED PROVIDER CHAIN BEHIND /api/generate/image.
 *
 * WHY THIS IS A MODULE AND NOT TWENTY LINES IN THE ROUTE. It was twenty lines
 * in the route, inside the createServer callback, and that is precisely why
 * nothing tested it: a grep for `generate/image`, `generateImageVia` and
 * `tried` across all 38 *.test.ts files in this package returned nothing. The
 * fallback that is supposed to keep the factory drawing while FAL is locked had
 * no check that could go red. Code reachable only by an HTTP request to a
 * 5000-line closure is code nobody will ever write a test for -- so the part
 * worth testing moved to src/, which is also the only place `npm run typecheck`
 * looks (tsconfig include is ["src/**\/*", "render-server.ts"]; scripts/ is
 * invisible to tsc, measured).
 *
 * WHAT IT GUARANTEES, and each of these is one test:
 *   1. Legs run IN ORDER and stop at the first one that returns a URL.
 *   2. Every refusal is recorded in `tried` -- one entry per failed leg, with
 *      the provider's own words. That array ships in the HTTP response on
 *      success AND on failure, because "the poster is missing" needed an answer
 *      that did not require shell access to a container.
 *   3. A leg that throws does not end the chain. This is the whole point: the
 *      previous inlined version only fell through on a SUBMIT-time refusal, so
 *      a FAL job that was accepted and then FAILED jumped past Replicate and
 *      Kie straight into the 500.
 *   4. THE CHAIN HAS A DEADLINE, and it is shorter than the caller's patience.
 *
 * ON (4), WHICH IS A MONEY RULE, NOT A TIDINESS RULE. The legs' own timeouts
 * add up to about 720 s (FAL polls 120 x 3 s, Replicate 180 s, Kie 180 s) while
 * the autopilot aborts its tool call at 240 s and undici gives up at 300 s. The
 * caller walking away does not cancel anything: the server keeps going, Kie
 * takes its 4 credits, and the answer is thrown into a closed socket -- charged
 * and not delivered, the failure mode this codebase already has a test suite
 * named after. Today FAL refuses in under a second so the sum never gets near
 * the cap; the day FAL is topped up and merely SLOW, it does. A budget that
 * only matters later is still cheaper to add now than to diagnose later.
 *
 *   5. NO LEG RUNS BELOW THE PRICE. Every leg carries what one image costs us
 *      at its provider, and a leg whose cost is above what the charge covers
 *      is skipped -- recorded in `tried` like any refusal, never called.
 *
 * ON (5): THE CHARGE IS ONE NUMBER, THE LEGS ARE NOT. `image_generate` is sold
 * at 2 tokens -- priced for Replicate flux-schnell at $0.003 -- whichever leg
 * ends up drawing. The FIRST leg was FAL fal-ai/nano-banana-pro at $0.15 an
 * image (fal.ai model page, read 2026-09-22): fifty times the cost the price
 * was set for. It sleeps today only because the FAL balance is empty
 * (providers_status, measured the same day); topping the balance up would have
 * turned every picture into a loss. Kie google/nano-banana, the
 * third leg, costs $0.02 against the same 2 tokens.
 *
 * WHY SKIP, AND NOT PRICE BY THE LEG THAT RUNS. The charge is taken BEFORE the
 * chain starts (both the mini app route and the agent tool charge first, so a
 * provider is never paid for somebody who cannot pay), and which leg delivers
 * is known only after it has delivered. Pricing by the leg would mean a second
 * charge in the middle of the chain or an over-charge refunded afterwards --
 * two ledger rows per picture, each with its own refund-once key, on the path
 * where refunds have already gone wrong twice (billing-shared.ts). Skipping is
 * one comparison in this pure function, and the person pays exactly the price
 * they were quoted. The cost of the choice: a leg too dear for the price is
 * not a fallback any more -- when every leg the price covers refuses, the
 * picture fails and is refunded rather than drawn at a loss.
 */

import { TOKEN_PRICES, costCeilingUsd } from './agent/billing-shared'
import { СЕБЕСТОИМОСТЬ_USD } from './agent/kie-prices.generated' // cyrillic-ok: generated table name
import { T2I_MODEL } from './kie-image'

/** One provider's refusal, in its own words. */
export interface ImageRefusal {
  provider: string
  error: string
}

export interface ImageLeg {
  /** Shown to the caller, so it must name the model, not just the vendor. */
  name: string
  /**
   * What ONE image from this leg costs us at the provider, in USD. `null`
   * means nobody has written it down, and a leg whose cost is unknown never
   * runs on a fixed price: we cannot say it is covered.
   */
  costUsd: number | null
  run: () => Promise<string>
}

/**
 * The FAL endpoints a caller may prefer. Moved here from the route so the
 * price table below can be checked against every one of them.
 */
export const FAL_IMAGE_MODELS = [
  'fal-ai/nano-banana-pro',
  'fal-ai/flux/dev',
  'fal-ai/flux-pro/v1.1-ultra',
  'fal-ai/reve/text-to-image',
] as const

export const DEFAULT_FAL_IMAGE_MODEL = 'fal-ai/nano-banana-pro'

/** A known FAL endpoint for the requested model, else the default one. */
export function falEndpointFor(model: unknown): string {
  return (FAL_IMAGE_MODELS as readonly string[]).includes(String(model))
    ? String(model)
    : DEFAULT_FAL_IMAGE_MODEL
}

export const REPLICATE_IMAGE_LEG = 'replicate/flux-schnell'
export const KIE_IMAGE_LEG = `kie/${T2I_MODEL}`
export const falLeg = (endpoint: string): string => `fal/${endpoint}`

/**
 * THE COST OF ONE IMAGE, PER LEG. Keyed by the leg name the route builds.
 *
 * Every number has a source that can be read again:
 *
 *   fal/*            the model's own page on fal.ai, read 2026-09-22:
 *                    nano-banana-pro "$0.15 per image" (4K is double),
 *                    flux-pro/v1.1-ultra "$0.06 per image", reve "$0.04 per
 *                    image", flux/dev "$0.025 per megapixel" billed by the
 *                    megapixel rounded up -- one at the default frame, and a
 *                    larger frame only costs more.
 *   replicate/...    the model page on replicate.com, read the same day:
 *                    "$3 per thousand output images".
 *   kie/...          the generated Kie price list (kie-prices.generated.ts),
 *                    the same table every explicit Kie model is charged by;
 *                    measured end to end at 4 credits (kie-image.ts).
 *
 * A leg name that is not here reads as `null`, so a new leg added without a
 * price is skipped, not run at a loss -- and image-chain.test.ts fails on it.
 */
export const IMAGE_LEG_COST_USD: Readonly<Record<string, number | null>> = {
  [falLeg('fal-ai/nano-banana-pro')]: 0.15,
  [falLeg('fal-ai/flux/dev')]: 0.025,
  [falLeg('fal-ai/flux-pro/v1.1-ultra')]: 0.06,
  [falLeg('fal-ai/reve/text-to-image')]: 0.04,
  [REPLICATE_IMAGE_LEG]: 0.003,
  [KIE_IMAGE_LEG]: СЕБЕСТОИМОСТЬ_USD[T2I_MODEL] ?? null, // cyrillic-ok: generated table name
}

export function imageLegCost(name: string): number | null {
  const cost = IMAGE_LEG_COST_USD[name]
  return typeof cost === 'number' && Number.isFinite(cost) ? cost : null
}

/**
 * The chain behind /api/generate/image, in order, each leg with its cost. The
 * route passes only the functions that call the providers; which legs exist
 * and what they cost is decided here, where a test can see all of it.
 */
export function imageChainLegs(
  falEndpoint: string,
  run: {
    fal: () => Promise<string>
    replicate: () => Promise<string>
    kie: () => Promise<string>
  }
): ImageLeg[] {
  return [
    { name: falLeg(falEndpoint), run: run.fal },
    { name: REPLICATE_IMAGE_LEG, run: run.replicate },
    { name: KIE_IMAGE_LEG, run: run.kie },
  ].map(leg => ({ ...leg, costUsd: imageLegCost(leg.name) }))
}

/** Every leg the route can build, for the census and the price note. */
export function everyImageLegName(): string[] {
  return [...FAL_IMAGE_MODELS.map(falLeg), REPLICATE_IMAGE_LEG, KIE_IMAGE_LEG]
}

/** What the `image_generate` price covers at the provider. */
export function imageChainCeilingUsd(): number {
  return costCeilingUsd('image_generate')
}

/** Does the price cover this leg? Unknown cost is never covered. */
export function legFitsPrice(
  costUsd: number | null,
  ceilingUsd: number
): boolean {
  return (
    typeof costUsd === 'number' &&
    Number.isFinite(ceilingUsd) &&
    costUsd <= ceilingUsd
  )
}

const usd = (n: number) => `$${Number(n.toFixed(4))}`

/** Which legs today's price covers, and which it does not. */
function priceSplit() {
  const ceiling = imageChainCeilingUsd()
  const names = everyImageLegName()
  const runs = names.filter(n => legFitsPrice(imageLegCost(n), ceiling))
  const dear = names.filter(n => !runs.includes(n))
  return { ceiling, runs, dear, price: TOKEN_PRICES.image_generate }
}

/**
 * Who draws at today's price and who is too dear, every leg with its cost --
 * for the price list. Computed, so it moves with the price.
 */
export function imageChainNote(): string {
  const { ceiling, runs, dear, price } = priceSplit()
  const said = (n: string) => {
    const c = imageLegCost(n)
    return `${n} (${c == null ? 'цена не записана' : usd(c)})` // cyrillic-ok: tool copy
  }
  return (
    `Цена картинки в токенах — ${price}; она покрывает себестоимость до ${usd(ceiling)}: ` + // cyrillic-ok: tool copy
    `рисует ${runs.length ? runs.map(said).join(', ') : 'никто'}. ` + // cyrillic-ok: tool copy
    (dear.length
      ? `Дороже цены и не запускаются: ${dear.map(said).join(', ')}.` // cyrillic-ok: tool copy
      : '')
  ).trim()
}

/**
 * The same split in one short line, for the tool description. That text goes
 * into the compact kit a 16k model is shown (provider.test.ts pins its size),
 * so it names who draws and the vendors that are skipped, not every price.
 */
export function imageChainShortNote(): string {
  const { ceiling, runs, dear, price } = priceSplit()
  const vendors = [...new Set(dear.map(n => n.split('/')[0]))]
  return (
    `Цена ${price} ток. покрывает себестоимость до ${usd(ceiling)}: рисует ` + // cyrillic-ok: tool copy
    `${runs.length ? runs.join(', ') : 'никто'}` + // cyrillic-ok: tool copy
    (vendors.length ? `; ${vendors.join(', ')} дороже и пропускаются.` : '.') // cyrillic-ok: tool copy
  )
}

/** The refusal a skipped leg leaves in `tried`. */
export function belowCostRefusal(
  costUsd: number | null,
  ceilingUsd: number
): string {
  if (costUsd == null)
    return 'себестоимость звена не записана — без неё оно не запускается' // cyrillic-ok: refusal copy
  if (typeof ceilingUsd !== 'number' || !Number.isFinite(ceilingUsd))
    return 'цепочке не сказали, что покрывает цена, — звено не запускается' // cyrillic-ok: refusal copy
  return `звено стоит ${usd(costUsd)}, цена операции покрывает ${usd(ceilingUsd)} — пропущено, чтобы не продавать ниже себестоимости` // cyrillic-ok: refusal copy
}

export type ImageChainOutcome =
  | { ok: true; url: string; provider: string; tried: ImageRefusal[] }
  | { ok: false; tried: ImageRefusal[] }

/**
 * Under the 240 s the autopilot allows a tool call, with room for the S3
 * download-and-mirror that follows a success. Not a round number by accident:
 * a budget equal to the caller's cap is a budget that loses the race.
 */
export const DEFAULT_CHAIN_BUDGET_MS = 200_000

/**
 * A refusal message is kept at 300 characters, not 44.
 *
 * 44 is not a hypothetical: an error sliced to that width cut "not supported"
 * down to "not supporte", a comparison against the full phrase stopped
 * matching, and eight models that do not exist were reported as present.
 * Truncation is where diagnoses go to die -- but an unbounded provider error
 * would happily paste an HTML error page into a feed row, so it is bounded,
 * just not below the length of a sentence.
 */
export const REFUSAL_MAX_CHARS = 300

export function refusalText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  return raw.slice(0, REFUSAL_MAX_CHARS)
}

/**
 * Run the legs in order, return the first URL, record every refusal.
 *
 * Never throws: the caller needs `tried` more than it needs a stack trace, and
 * an exception here would land in the route's catch with the array empty.
 */
export async function runImageChain(
  legs: ImageLeg[],
  opts: {
    /**
     * The most one image may cost us for the charge to keep its markup
     * (`costCeilingUsd` of the op that was charged). REQUIRED on purpose: a
     * chain that is not told what the price covers cannot tell a covered leg
     * from a loss, and a missing or broken number runs nothing.
     */
    ceilingUsd: number
    budgetMs?: number
    /** Injected so the tests do not have to own a clock. */
    now?: () => number
    log?: (line: string) => void
  }
): Promise<ImageChainOutcome> {
  const now = opts.now ?? Date.now
  const budgetMs = opts.budgetMs ?? DEFAULT_CHAIN_BUDGET_MS
  const log = opts.log ?? (() => {})
  const deadline = now() + budgetMs
  const tried: ImageRefusal[] = []
  const fits = legs.map(leg => legFitsPrice(leg.costUsd, opts.ceilingUsd))

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]
    if (!fits[i]) {
      // Never called, so it costs nothing and takes no share of the budget.
      const error = belowCostRefusal(leg.costUsd, opts.ceilingUsd)
      tried.push({ provider: leg.name, error })
      log(`${leg.name} пропущен: ${error}`)
      continue
    }
    /**
     * EACH LEG GETS A SHARE OF WHAT IS LEFT, NOT ALL OF IT.
     *
     * The first version handed the whole remaining budget to each leg in turn,
     * and its own test caught what that means: a first leg that hangs eats the
     * entire budget, and the fallback legs are never asked at all. A chain
     * whose slow first provider starves the fallback is the same outage in a
     * new costume -- the picture is missing and the funded provider that could
     * have drawn it was never called.
     *
     * Dividing by the legs still to come keeps the total bounded by the budget
     * AND guarantees every provider a real turn. It also self-corrects: a leg
     * that answers quickly hands its unused time to the ones after it.
     *
     * Only legs that will actually be called are counted: a skipped leg takes
     * no time, and counting it would starve the ones that do run.
     */
    const legsToCome = fits.slice(i).filter(Boolean).length
    const share = Math.max(0, deadline - now()) / legsToCome
    try {
      const url = await withDeadline(leg.run(), share, leg.name)
      if (tried.length) {
        log(`${leg.name} выручил после ${tried.length} отказов`)
      }
      return { ok: true, url, provider: leg.name, tried }
    } catch (e) {
      const error = refusalText(e)
      tried.push({ provider: leg.name, error })
      log(`${leg.name} отказал: ${error}`)
    }
  }
  return { ok: false, tried }
}

/**
 * Stop waiting on a leg once its share of the budget is gone.
 *
 * The underlying request is NOT cancelled -- these legs are plain promises over
 * fetch and there is no handle to abort. That is deliberate and it is the least
 * bad option: abandoning a Kie job whose credits are already committed is what
 * the timeout message in kie-image.ts warns about, and the alternative (letting
 * one slow leg eat the whole budget) leaves the caller with nothing at all.
 * What this buys is that the OTHER legs still get their turn, and the answer
 * arrives while somebody is still listening for it.
 */
function withDeadline<T>(
  work: Promise<T>,
  ms: number,
  name: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${name}: не уложился в бюджет цепочки`)),
        ms
      )
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>
}
