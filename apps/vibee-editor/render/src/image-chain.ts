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
 */

/** One provider's refusal, in its own words. */
export interface ImageRefusal {
  provider: string
  error: string
}

export interface ImageLeg {
  /** Shown to the caller, so it must name the model, not just the vendor. */
  name: string
  run: () => Promise<string>
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
    budgetMs?: number
    /** Injected so the tests do not have to own a clock. */
    now?: () => number
    log?: (line: string) => void
  } = {}
): Promise<ImageChainOutcome> {
  const now = opts.now ?? Date.now
  const budgetMs = opts.budgetMs ?? DEFAULT_CHAIN_BUDGET_MS
  const log = opts.log ?? (() => {})
  const deadline = now() + budgetMs
  const tried: ImageRefusal[] = []

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]
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
     */
    const share = Math.max(0, deadline - now()) / (legs.length - i)
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
