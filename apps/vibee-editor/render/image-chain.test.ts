/**
 * THE PROVIDER CHAIN BEHIND /api/generate/image, AND WHETHER IT IS WIRED.
 *
 * Why this file exists at all: before it, a grep for `generate/image`,
 * `generateImageVia` or `tried` across all 38 *.test.ts files in this package
 * returned NOTHING. The fallback whose entire job is to keep the factory
 * drawing while FAL answers 403 had no check that could go red, and the
 * previous version of it was broken in a way no green build noticed -- it fell
 * through only on a SUBMIT-time refusal, so a FAL job that was accepted and
 * then failed jumped past every other provider into a 500 and a refund.
 *
 * TWO KINDS OF TEST, BECAUSE ONE KIND CANNOT COVER THIS.
 *
 *   1. BEHAVIOUR, with fake legs. runImageChain is driven directly: order,
 *      stop-at-first-success, one recorded refusal per failed leg, the time
 *      budget. These fail if the ordering logic is wrong.
 *   2. WIRING, read from the source of render-server.ts. Nothing in (1) can
 *      tell you whether the ROUTE calls the chain, or with which providers in
 *      which order -- and "the logic is perfect but nobody calls it" is the
 *      exact shape of this outage: `--with-image` was a flag no launcher ever
 *      passed, so the layer was dead while every check stayed green.
 *
 * THE DOUBLES ARE AS DUMB AS THE REAL THING. A leg is a function returning a
 * promise of a URL string; that is precisely what the real legs are. They
 * decide nothing -- each test says up front what its legs will do. Nothing here
 * reaches a network, a provider or a clock it does not own.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  runImageChain,
  refusalText,
  REFUSAL_MAX_CHARS,
  DEFAULT_CHAIN_BUDGET_MS,
  FAL_IMAGE_MODELS,
  IMAGE_LEG_COST_USD,
  KIE_IMAGE_LEG,
  REPLICATE_IMAGE_LEG,
  everyImageLegName,
  falEndpointFor,
  falLeg,
  imageChainCeilingUsd,
  imageChainLegs,
  imageChainNote,
  imageChainShortNote,
  imageLegCost,
  legFitsPrice,
  type ImageLeg,
} from './src/image-chain'
import {
  COST_PER_TOKEN_USD,
  OPERATION_COST_USD,
  TOKEN_PRICES,
  costCeilingUsd,
  НАЦЕНКА, // cyrillic-ok: the markup constant under test
} from './src/agent/billing-shared'
import { СЕБЕСТОИМОСТЬ_USD } from './src/agent/kie-prices.generated' // cyrillic-ok: generated table name
import { T2I_MODEL } from './src/kie-image'
import { PAID } from './src/agent/pricing'
import { TOOLS } from './src/agent/tools'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { sliceFrom } = require('../../../scripts/lib/anchored-slice.cjs')

/**
 * Source with comments removed, so an assertion about CODE cannot be satisfied
 * -- or defeated -- by prose that merely quotes the code it is discussing.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/**
 * A leg that answers only what a leg is: its name, its cost and its run.
 * Reading anything else throws, so a chain that starts consulting a property
 * nobody declared -- a `price`, a `vendor`, a misspelt `cost` -- fails here
 * rather than quietly reading `undefined` as "free".
 */
function strictLeg(leg: ImageLeg): ImageLeg {
  const known = new Set(['name', 'costUsd', 'run'])
  return new Proxy(leg, {
    get(target, key, receiver) {
      if (typeof key === 'string' && !known.has(key)) {
        throw new Error(`the chain read leg.${key}, which a leg does not have`)
      }
      return Reflect.get(target, key, receiver)
    },
  })
}

/** Well under any ceiling the tests use: the ordinary, covered leg. */
const CHEAP = 0.001
/** What the tests say the price covers, unless a test is about the price. */
const PRICED = { ceilingUsd: 0.005 }

/** Records the order legs were actually asked in. */
function recorder() {
  const asked: string[] = []
  const ok = (name: string, url: string, costUsd: number | null = CHEAP) =>
    strictLeg({
      name,
      costUsd,
      run: async () => {
        asked.push(name)
        return url
      },
    })
  const refuses = (name: string, why: string, costUsd: number | null = CHEAP) =>
    strictLeg({
      name,
      costUsd,
      run: async () => {
        asked.push(name)
        throw new Error(why)
      },
    })
  const hangs = (name: string, ms: number, costUsd: number | null = CHEAP) =>
    strictLeg({
      name,
      costUsd,
      run: () =>
        new Promise(resolve => {
          asked.push(name)
          setTimeout(() => resolve(`https://slow.invalid/${name}`), ms)
        }),
    })
  return { asked, ok, refuses, hangs }
}

describe('the ordered image chain', () => {
  it('takes the first leg that delivers and never asks the rest', async () => {
    const r = recorder()
    const out = await runImageChain(
      [
        r.ok('fal/x', 'https://fal.invalid/a.jpg'),
        r.ok('replicate/flux-schnell', 'https://replicate.invalid/b.jpg'),
        r.ok('kie/google/nano-banana', 'https://kie.invalid/c.png'),
      ],
      PRICED
    )

    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error('unreachable')
    expect(out.url).toBe('https://fal.invalid/a.jpg')
    expect(out.provider).toBe('fal/x')
    // The money assertion: the cheap leg served, so the funded purse was never
    // opened. `asked` is a recorded fact, not the absence of a log line.
    expect(r.asked).toEqual(['fal/x'])
    expect(out.tried).toEqual([])
  })

  it('falls past a refusing leg to the next one, and says who served', async () => {
    const r = recorder()
    const out = await runImageChain(
      [
        r.refuses('fal/x', 'FAL submit failed: 403 - User is locked'),
        r.refuses('replicate/flux-schnell', 'REPLICATE token not configured'),
        r.ok('kie/google/nano-banana', 'https://kie.invalid/c.png'),
      ],
      PRICED
    )

    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error('unreachable')
    expect(out.provider).toBe('kie/google/nano-banana')
    expect(r.asked).toEqual([
      'fal/x',
      'replicate/flux-schnell',
      'kie/google/nano-banana',
    ])
    // Both refusals survive INTO A SUCCESS. A caller that got a picture still
    // has to be able to see it came from the leg that costs real credits.
    expect(out.tried).toEqual([
      { provider: 'fal/x', error: 'FAL submit failed: 403 - User is locked' },
      {
        provider: 'replicate/flux-schnell',
        error: 'REPLICATE token not configured',
      },
    ])
  })

  it('a leg that fails AFTER being accepted is just another refusal', async () => {
    // This is the defect the extraction was for. The inlined version treated a
    // post-submit FAILED status as fatal and threw past the other providers.
    const r = recorder()
    const out = await runImageChain(
      [
        r.refuses('fal/x', 'FAL generation failed: NSFW filter'),
        r.ok('replicate/flux-schnell', 'https://replicate.invalid/b.jpg'),
      ],
      PRICED
    )
    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error('unreachable')
    expect(out.provider).toBe('replicate/flux-schnell')
  })

  it('when every leg refuses, every reason is returned', async () => {
    const r = recorder()
    const out = await runImageChain(
      [
        r.refuses('fal/x', 'locked'),
        r.refuses('replicate/flux-schnell', 'no token'),
        r.refuses('kie/google/nano-banana', 'Kie отказал: Internal Error'),
      ],
      PRICED
    )

    expect(out.ok).toBe(false)
    expect(out.tried.map(t => t.provider)).toEqual([
      'fal/x',
      'replicate/flux-schnell',
      'kie/google/nano-banana',
    ])
    // One entry per leg: a chain that reports fewer reasons than it has legs is
    // a chain that skipped one silently.
    expect(out.tried).toHaveLength(3)
  })

  it('never throws, so the caller always gets the reasons', async () => {
    const out = await runImageChain(
      [
        {
          name: 'boom',
          costUsd: CHEAP,
          run: () => Promise.reject('not even an Error'),
        },
      ],
      PRICED
    )
    expect(out.ok).toBe(false)
    expect(out.tried[0].error).toBe('not even an Error')
  })

  it('keeps a refusal readable instead of slicing it to a stump', () => {
    // 44 characters is not a hypothetical width: an error cut to it turned
    // "not supported" into "not supporte", the comparison stopped matching,
    // and eight models that do not exist were reported as present.
    const full = 'The model name you specified is not supported'
    expect(refusalText(new Error(full))).toBe(full)
    expect(REFUSAL_MAX_CHARS).toBeGreaterThan(full.length)
    // Bounded, though: a provider that answers with an HTML error page must not
    // paste the page into a feed row.
    expect(refusalText(new Error('x'.repeat(5000)))).toHaveLength(
      REFUSAL_MAX_CHARS
    )
  })
})

describe('the chain gives up in time to be heard', () => {
  /**
   * THIS IS A MONEY RULE. The legs' own timeouts sum to about 720 s (FAL polls
   * 120 x 3 s, Replicate 180 s, Kie 180 s) while the autopilot aborts its tool
   * call at 240 s. The caller walking away cancels nothing: the server keeps
   * going, Kie takes its credits, and the answer is written into a socket
   * nobody is reading -- charged and not delivered.
   */
  it('is budgeted below the 240s the autopilot allows a tool call', () => {
    expect(DEFAULT_CHAIN_BUDGET_MS).toBeLessThan(240_000)
    const autopilot = fs.readFileSync(
      path.join(__dirname, 'scripts/agent-autopilot.ts'),
      'utf8'
    )
    // Read from the caller rather than remembered, so raising the caller's cap
    // without revisiting this budget cannot pass unnoticed.
    const m = autopilot.match(/AbortSignal\.timeout\((\d[\d_]*)\)/)
    expect(m, 'the autopilot must still cap its tool calls').toBeTruthy()
    const cap = Number(String(m![1]).replace(/_/g, ''))
    expect(DEFAULT_CHAIN_BUDGET_MS).toBeLessThan(cap)
  })

  it('abandons a leg that overruns the budget and still tries the next', async () => {
    const r = recorder()
    const out = await runImageChain(
      [
        r.hangs('fal/slow', 10_000),
        r.ok('kie/google/nano-banana', 'https://kie.invalid/c.png'),
      ],
      { ...PRICED, budgetMs: 40 }
    )
    // The whole point: one slow provider must not eat the picture.
    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error('unreachable')
    expect(out.provider).toBe('kie/google/nano-banana')
    expect(out.tried[0].provider).toBe('fal/slow')
    expect(out.tried[0].error).toContain('бюджет')
  })

  it('a slow first leg cannot starve the ones behind it', async () => {
    /**
     * The regression this pins. The first version of the budget handed the
     * WHOLE remaining time to each leg in turn, so one hanging provider
     * consumed it all and the fallbacks were never asked -- the identical
     * outage in new clothes: no picture, and the funded provider that could
     * have drawn it never called. Three legs, two of them hanging far past the
     * budget, and the last one must still get its turn.
     */
    const r = recorder()
    const out = await runImageChain(
      [
        r.hangs('fal/slow', 10_000),
        r.hangs('replicate/slow', 10_000),
        r.ok('kie/google/nano-banana', 'https://kie.invalid/c.png'),
      ],
      { ...PRICED, budgetMs: 90 }
    )
    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error('unreachable')
    expect(out.provider).toBe('kie/google/nano-banana')
    expect(r.asked).toHaveLength(3)
  })

  it('bounds the whole chain, not merely each leg', async () => {
    const r = recorder()
    const started = Date.now()
    const out = await runImageChain(
      [
        r.hangs('a', 10_000),
        r.hangs('b', 10_000),
        r.hangs('c', 10_000),
        r.hangs('d', 10_000),
      ],
      { ...PRICED, budgetMs: 120 }
    )
    const spent = Date.now() - started
    expect(out.ok).toBe(false)
    // Four legs that would each hang for 10 s finish inside the budget, with
    // generous slack for a loaded CI box. Without a TOTAL bound this is 40 s.
    expect(spent).toBeLessThan(2_000)
    // Still one recorded reason per leg: a chain that reports fewer reasons
    // than it has legs skipped one silently.
    expect(out.tried).toHaveLength(4)
  })
})

describe('the route actually uses the chain', () => {
  /**
   * Behaviour tests above prove the chain is right. They cannot prove anybody
   * calls it -- and an uncalled feature is this outage's whole story.
   */
  const SERVER = fs.readFileSync(
    path.join(__dirname, 'render-server.ts'),
    'utf8'
  )

  it('imports and calls the shared chain rather than re-inlining a loop', () => {
    expect(SERVER).toContain("from './src/image-chain'")
    expect(SERVER).toMatch(/await runImageChain\(/)
  })

  it('offers all three providers, cheapest-that-works first, funded one last', () => {
    const at = (needle: string) => {
      const i = SERVER.indexOf(needle)
      expect(i, `${needle} must be a leg of the chain`).toBeGreaterThan(-1)
      return i
    }
    const fal = at('generateImageViaFal(prompt, aspectRatio, modelEndpoint)')
    const replicate = at('generateImageViaReplicate(prompt, aspectRatio)')
    const kie = at('generateImageViaKie(prompt, aspectRatio)')
    // Kie last is deliberate: 4 credits an image out of the SAME purse that
    // pays veed/fabric-1 at 18 credits a second. Reordering it first would
    // silently multiply the reel budget, so the order is pinned.
    expect(fal).toBeLessThan(replicate)
    expect(replicate).toBeLessThan(kie)
  })

  it('answers with the provider that served and every one that refused', () => {
    expect(SERVER).toMatch(/provider: outcome\.provider/)
    // On failure too: a 500 with no `tried` is the silence this whole change
    // exists to end.
    const failure = sliceFrom(SERVER, 'no image provider delivered')
    expect(failure.slice(0, 900)).toMatch(/tried,/)
  })

  it('does not gate the whole route on one provider key any more', () => {
    /**
     * `if (!FAL_KEY) throw` used to sit at the top of the try, AHEAD of the
     * fallback guards, making the entire fallback unreachable: deleting the FAL
     * key to force Replicate produced a 500 and a refund instead.
     *
     * COMMENTS ARE STRIPPED FIRST, and that is not tidiness. The first version
     * of this assertion failed against correct code, because the comment left
     * where the guard used to be says the words `if (!FAL_KEY) throw` in order
     * to explain their removal. A check that reads prose as if it were code
     * reports on its own explanation.
     */
    const start = SERVER.indexOf("req.url === '/api/generate/image'")
    const end = SERVER.indexOf("req.url === '/api/generate/video'", start)
    const route = code(SERVER.slice(start, end))
    expect(route).not.toMatch(/if \(!FAL_KEY\) throw/)
    // The denominator: the window must really hold the route, or the assertion
    // above passes on an empty string.
    expect(route).toContain('runImageChain')
  })
})

describe('no leg runs below the price', () => {
  /**
   * THE DEFECT THIS PINS. `image_generate` is sold at one price whichever leg
   * draws, and that price was set for Replicate flux-schnell at $0.003. The
   * first leg was FAL nano-banana-pro at $0.15 an image, the third Kie
   * nano-banana at $0.02. Nothing compared a leg's cost with the price: a
   * topped-up FAL would have made every picture a loss, silently.
   */
  it('a leg dearer than the price covers is never called, and says why', async () => {
    const r = recorder()
    const out = await runImageChain(
      [
        r.ok('fal/dear', 'https://fal.invalid/a.jpg', 0.15),
        r.ok('replicate/flux-schnell', 'https://replicate.invalid/b.jpg'),
      ],
      PRICED
    )
    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error('unreachable')
    expect(out.provider).toBe('replicate/flux-schnell')
    // The money assertion: the dear provider was not asked at all.
    expect(r.asked).toEqual(['replicate/flux-schnell'])
    expect(out.tried).toHaveLength(1)
    expect(out.tried[0].provider).toBe('fal/dear')
    expect(out.tried[0].error).toContain('$0.15')
    expect(out.tried[0].error).toContain('$0.005')
  })

  it('a leg whose cost nobody wrote down is never called', async () => {
    const r = recorder()
    const out = await runImageChain(
      [
        r.ok('mystery/model', 'https://x.invalid/a.jpg', null),
        r.ok('replicate/flux-schnell', 'https://replicate.invalid/b.jpg'),
      ],
      PRICED
    )
    expect(r.asked).toEqual(['replicate/flux-schnell'])
    expect(out.tried[0].provider).toBe('mystery/model')
    expect(out.tried[0].error).toMatch(/не записана/) // cyrillic-ok: refusal copy
  })

  it('when every covered leg refuses, the dear ones are still not a fallback', async () => {
    const r = recorder()
    const out = await runImageChain(
      [
        r.ok('fal/dear', 'https://fal.invalid/a.jpg', 0.15),
        r.refuses('replicate/flux-schnell', 'no token'),
        r.ok('kie/dear', 'https://kie.invalid/c.png', 0.02),
      ],
      PRICED
    )
    // No picture beats a picture sold at a loss: the route refunds on this.
    expect(out.ok).toBe(false)
    expect(r.asked).toEqual(['replicate/flux-schnell'])
    // Still one reason per leg, the skipped ones included.
    expect(out.tried.map(t => t.provider)).toEqual([
      'fal/dear',
      'replicate/flux-schnell',
      'kie/dear',
    ])
  })

  it('a leg that costs exactly what the price covers runs', async () => {
    const r = recorder()
    const out = await runImageChain(
      [r.ok('edge', 'https://edge.invalid/a.jpg', 0.005)],
      PRICED
    )
    expect(out.ok).toBe(true)
    expect(r.asked).toEqual(['edge'])
  })

  it('a chain not told what the price covers runs nothing', async () => {
    for (const ceilingUsd of [Number.NaN, undefined as unknown as number]) {
      const r = recorder()
      const out = await runImageChain(
        [r.ok('replicate/flux-schnell', 'https://replicate.invalid/b.jpg')],
        { ceilingUsd }
      )
      expect(out.ok).toBe(false)
      expect(r.asked).toEqual([])
    }
  })

  it('a skipped leg takes no share of the time budget', async () => {
    /**
     * Five legs, three of them too dear. If the skipped legs were counted, the
     * first covered leg would get a fifth of the budget (120 ms) and time out
     * at 200 ms; counted right, it gets half (300 ms) and delivers.
     */
    const r = recorder()
    const out = await runImageChain(
      [
        r.hangs('slow-but-covered', 200),
        r.ok('dear-1', 'https://x.invalid/1', 0.1),
        r.ok('dear-2', 'https://x.invalid/2', 0.1),
        r.ok('dear-3', 'https://x.invalid/3', 0.1),
        r.ok('replicate/flux-schnell', 'https://replicate.invalid/b.jpg'),
      ],
      { ...PRICED, budgetMs: 600 }
    )
    expect(out.ok).toBe(true)
    if (!out.ok) throw new Error('unreachable')
    expect(out.provider).toBe('slow-but-covered')
  })

  it('the strict leg double really refuses a property a leg does not have', () => {
    const r = recorder()
    const leg = r.ok('x', 'https://x.invalid') as unknown as Record<
      string,
      unknown
    >
    expect(() => leg.price).toThrow(/does not have/)
  })
})

describe('every leg the route can build carries its price', () => {
  /** Provider calls that must not happen just because a chain was built. */
  const neverCalled = {
    fal: () => Promise.reject(new Error('fal called while building')),
    replicate: () =>
      Promise.reject(new Error('replicate called while building')),
    kie: () => Promise.reject(new Error('kie called while building')),
  }

  /**
   * THE TEST THAT FAILS WHEN AN EXPENSIVE LEG ARRIVES WITHOUT A PRICE. Every
   * model a caller may ask for, and one nobody knows, is built into the real
   * chain; each leg must come out with a cost. A fourth leg added to
   * `imageChainLegs` without a row in IMAGE_LEG_COST_USD has cost `null` here
   * -- and at run time it would be skipped, never run at a loss.
   */
  it('each leg of each chain has a real cost', () => {
    for (const model of [...FAL_IMAGE_MODELS, 'nobody/knows-this', undefined]) {
      const legs = imageChainLegs(falEndpointFor(model), neverCalled)
      expect(legs.length, String(model)).toBeGreaterThanOrEqual(3)
      for (const leg of legs) {
        expect(leg.costUsd, `${leg.name} has no price`).not.toBeNull()
        expect(Number.isFinite(leg.costUsd), leg.name).toBe(true)
        expect(leg.costUsd as number, leg.name).toBeGreaterThan(0)
      }
    }
  })

  it('the price table and the route name the same legs', () => {
    const built = new Set(
      [...FAL_IMAGE_MODELS, 'nobody/knows-this'].flatMap(m =>
        imageChainLegs(falEndpointFor(m), neverCalled).map(l => l.name)
      )
    )
    expect([...built].sort()).toEqual([...everyImageLegName()].sort())
    // No stale row either: a price for a leg that no longer exists is a
    // price nobody will ever check again.
    expect(Object.keys(IMAGE_LEG_COST_USD).sort()).toEqual(
      [...everyImageLegName()].sort()
    )
  })

  it('an unknown leg name reads as no price, not as free', () => {
    expect(imageLegCost('fal/fal-ai/something-new')).toBeNull()
    expect(legFitsPrice(imageLegCost('fal/fal-ai/something-new'), 1)).toBe(
      false
    )
  })

  it('the Kie leg is priced from the Kie price list, not a second copy', () => {
    expect(KIE_IMAGE_LEG).toBe(`kie/${T2I_MODEL}`)
    expect(imageLegCost(KIE_IMAGE_LEG)).toBe(СЕБЕСТОИМОСТЬ_USD[T2I_MODEL]) // cyrillic-ok: generated table name
  })

  it('what the price covers is price x base / markup', () => {
    const expected =
      (TOKEN_PRICES.image_generate * COST_PER_TOKEN_USD) / НАЦЕНКА // cyrillic-ok: markup constant
    expect(imageChainCeilingUsd()).toBeCloseTo(expected, 9)
    expect(imageChainCeilingUsd()).toBeCloseTo(0.005, 9)
    expect(costCeilingUsd('no_such_op')).toBe(0)
    // Every op's own price covers the nominal cost it was derived from.
    for (const [op, cost] of Object.entries(OPERATION_COST_USD)) {
      expect(costCeilingUsd(op), op).toBeGreaterThanOrEqual(cost)
    }
  })

  it('at the current price the chain can still draw, and the $0.15 leg cannot', () => {
    const ceiling = imageChainCeilingUsd()
    const runnable = everyImageLegName().filter(n =>
      legFitsPrice(imageLegCost(n), ceiling)
    )
    // A floor that skips every leg is an outage, not a price rule.
    expect(runnable).toEqual([REPLICATE_IMAGE_LEG])
    expect(
      legFitsPrice(imageLegCost(falLeg('fal-ai/nano-banana-pro')), ceiling)
    ).toBe(false)
    expect(legFitsPrice(imageLegCost(KIE_IMAGE_LEG), ceiling)).toBe(false)
  })

  it('the tool and the price list say who draws, from the same computation', () => {
    const note = imageChainNote()
    expect(note).toContain(`${REPLICATE_IMAGE_LEG} ($0.003)`)
    expect(note).toContain(`${falLeg('fal-ai/nano-banana-pro')} ($0.15)`)
    // The tool description carries the short form: it sits in the compact
    // kit a 16k model is shown, and provider.test.ts pins that size.
    const short = imageChainShortNote()
    expect(short).toContain(REPLICATE_IMAGE_LEG)
    expect(short).toMatch(/fal, kie дороже/) // cyrillic-ok: tool copy
    const tool = TOOLS.find(t => t.name === 'image_generate')
    expect(tool?.description).toContain(short)
    const row = PAID.find(p => p.функция === 'image_generate') // cyrillic-ok: field name
    expect(row?.провайдер).toBe(note) // cyrillic-ok: field name
  })
})

describe('the route charges one price and runs only the legs it covers', () => {
  const SERVER = fs.readFileSync(
    path.join(__dirname, 'render-server.ts'),
    'utf8'
  )
  const start = SERVER.indexOf("req.url === '/api/generate/image'")
  const end = SERVER.indexOf("req.url === '/api/generate/video'", start)
  const route = code(SERVER.slice(start, end))

  it('builds its legs from the priced chain, not by hand', () => {
    expect(route).toContain('runImageChain')
    expect(route).toMatch(/runImageChain\(\s*imageChainLegs\(/)
    // A hand-built leg would carry no price from the table.
    expect(route).not.toMatch(/name:\s*['`](fal|replicate|kie)\//)
  })

  it('tells the chain what the charged price covers', () => {
    expect(route).toMatch(/ceilingUsd:\s*imageChainCeilingUsd\(\)/)
    // ...and charges that very op, so the ceiling and the charge agree.
    expect(route).toMatch(/chargeMiniAppUser\(req, 'image_generate'/)
  })
})
