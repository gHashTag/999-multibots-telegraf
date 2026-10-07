import { TOKEN_PRICES } from './billing-shared'

/**
 * WHICH TOOLS CHARGE: DERIVED FROM THE PRICE TABLE, NEVER LISTED BY HAND.
 *
 * crm-duet.t27 v5: "any tool with a price > 0 is refused in a dry run". The
 * duet's paid set used to be six names written out in crm-duet-tool.ts; the
 * seller is offered the whole registry, and four tools that charge were on no
 * list -- lipsync_generate (by the second), story_reel and split_reel (they
 * borrow tools that charge), crm_voice_clone (the one-time clone price) -- so a
 * dry run that was meant to be free still offered them on every turn.
 *
 * A tool's price is read from the one table that prices charges,
 * `TOKEN_PRICES` (billing-shared):
 *   - its own entry, when the tool and the charged op share a name
 *     (image_generate, lipsync_generate, reel_render, ...);
 *   - the highest price among the names in its `charges` -- a priced op it
 *     spends under another name (crm_voice_clone -> voice_clone) or a tool it
 *     borrows from the registry (story_reel -> lipsync_generate), whose price
 *     is found the same way.
 * Price > 0 is a paid tool (crm-duet.t27 `tool_is_paid`, `borrowed_price`).
 *
 * Kept free of `tools.ts`: that module imports the duet, so the duet cannot
 * import it back without a cycle at load. The registry hands itself over once
 * built (`registerChargingTools`), and a reader before that fails CLOSED -- a
 * dry run that cannot name what charges must not be run as if nothing did.
 */

export interface ChargeDecl {
  name: string
  /** Priced ops spent under another name, or tools borrowed from the registry. */
  charges?: readonly string[]
}

export function toolPrice(
  name: string,
  byName: ReadonlyMap<string, ChargeDecl>,
  prices: Readonly<Record<string, number>> = TOKEN_PRICES,
  seen: ReadonlySet<string> = new Set()
): number {
  if (seen.has(name)) return 0
  const own = prices[name] ?? 0
  const inner = new Set([...seen, name])
  let borrowed = 0
  for (const c of byName.get(name)?.charges ?? []) {
    const p =
      byName.has(c) || !(c in prices)
        ? toolPrice(c, byName, prices, inner)
        : (prices[c] ?? 0)
    if (p > borrowed) borrowed = p
  }
  return own >= borrowed ? own : borrowed
}

/** Every tool whose price is > 0. */
export function chargingToolNames(
  tools: readonly ChargeDecl[],
  prices: Readonly<Record<string, number>> = TOKEN_PRICES
): ReadonlySet<string> {
  const byName = new Map(tools.map(t => [t.name, t]))
  return new Set(
    tools.filter(t => toolPrice(t.name, byName, prices) > 0).map(t => t.name)
  )
}

/*
 * One process, one registry: the set is kept on a process-wide slot, not in
 * this module's scope, so a copy of this module evaluated again (a test that
 * resets its modules, a hot reload) still reads what the registry handed
 * over instead of failing a run that the loaded registry can answer.
 */
const SLOT = Symbol.for('vibee.render.chargingTools')
type Slot = { [SLOT]?: ReadonlySet<string> }

/** Called once by tools.ts, after the last tool joins the registry. */
export function registerChargingTools(tools: readonly ChargeDecl[]): void {
  ;(globalThis as Slot)[SLOT] = chargingToolNames(tools)
}

/** The registry's charging tools. Throws until the registry has loaded. */
export function chargingTools(): ReadonlySet<string> {
  const registered = (globalThis as Slot)[SLOT]
  if (!registered)
    throw new Error(
      'charging tools are unknown: the tool registry (tools.ts) has not loaded'
    )
  return registered
}
