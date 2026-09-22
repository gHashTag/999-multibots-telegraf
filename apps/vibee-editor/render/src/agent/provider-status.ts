import { allProviders } from './provider'
import { chosenProvider } from './provider-choice'
import { breakerSnapshot, orderByBreaker } from './provider-breaker'

/**
 * WHAT GET /api/agent/provider ANSWERS: WHICH MODEL, AND WHICH ONE IS ANSWERING.
 *
 * `current` is the head of the configured chain -- the owner's /model choice,
 * or AGENT_PROVIDER under it. Since the breaker (provider-breaker.ts) that is
 * no longer always the model a new turn asks first: after a timeout zai is
 * parked for two minutes and zai-lite answers, while `current` still said zai
 * and the breaker's state was visible only in the log line that opened it.
 *
 * So the answer carries both: `answering` is the provider a new turn asks
 * first right now, and `breakers` is every open breaker with its reason and
 * when it may be probed. The existing fields are unchanged, for callers that
 * read only them.
 */
export function providerStatus(now: number = Date.now()) {
  const chain = allProviders()
  const first = chain[0]
  const head = orderByBreaker(chain, now).ordered[0]
  return {
    current: first
      ? {
          id: first.id,
          model: first.model,
          context: first.context,
          compact: first.compact,
        }
      : null,
    answering: head ? { id: head.id, model: head.model } : null,
    breakers: breakerSnapshot().map(b => ({
      id: b.id,
      until: new Date(b.openUntil).toISOString(),
      probing: b.probing,
      reason: b.reason,
    })),
    chosen: chosenProvider(),
    env: process.env.AGENT_PROVIDER || null,
    chain: chain.map(p => ({
      id: p.id,
      model: p.model,
      context: p.context,
    })),
  }
}
