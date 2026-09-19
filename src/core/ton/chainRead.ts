/**
 * "I COULD NOT LOOK" AND "NOBODY PAID" MUST NOT SHARE AN ANSWER.
 *
 * Every read of the TON chain goes through a public API that rate-limits, times
 * out and occasionally answers with an HTML error page. Both readers in
 * `core/ton/index.ts` used to turn all of that into `return []`, which every
 * caller then read as a fact about the chain:
 *
 *   the payer pressing "check payment" was told "платёж пока не найден";
 *   the hourly watch told the owner "none unclaimed", examined N.
 *
 * Neither had looked at anything. That is the exact mistake
 * `tonPendingWatch.ts` documents at length for its DATABASE read and then
 * committed for its CHAIN read one screen further down.
 *
 * This module carries the distinction, and it lives apart from `@/core/ton` on
 * purpose: `tonPendingWatch.test.ts` does `vi.mock('@/core/ton', ...)`, and an
 * error class exported from a mocked module is `undefined` at the `instanceof`
 * -- so the branch that must not be skipped would be skipped exactly under test.
 * Hence a duck-typed flag and a predicate rather than a bare `instanceof`.
 */

/**
 * The deadline for one call. There was none at all before: `retries: 0` plus
 * `concurrency: 1` meant a single hung fetch could park the hourly watch until
 * Inngest's own timeout, with the next run queued behind it.
 */
export const CHAIN_READ_TIMEOUT_MS = 15_000

/** The chain could not be read. Says nothing about whether money arrived. */
export class TonChainUnreadable extends Error {
  readonly chainUnreadable = true as const

  constructor(why: string) {
    super(`the chain could not be read: ${why}`)
    this.name = 'TonChainUnreadable'
  }
}

/** True when this failure means "I could not look", not "nothing was there". */
export function chainWasUnreadable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { chainUnreadable?: unknown }).chainUnreadable === true
  )
}

/**
 * One GET against TON Center that either returns the parsed body or throws
 * `TonChainUnreadable`. Every refusal shape is covered, because each one used
 * to become an empty list:
 *
 *   transport failure or DNS       -> throw
 *   no answer within the deadline  -> throw
 *   HTTP 429 / 500 / 503           -> throw (the body is then HTML, and
 *                                     `.json()` on it threw into a catch that
 *                                     returned `[]` -- so a rate limit read as
 *                                     an empty chain)
 *   200 with `{"ok": false}`       -> throw (this is the `lt not in db` shape)
 */
export async function readFromChain(
  url: string,
  headers: Record<string, string>
): Promise<{ ok: true; result?: unknown[] }> {
  const ac = new AbortController()
  const deadline = setTimeout(() => ac.abort(), CHAIN_READ_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url, { headers, signal: ac.signal })
  } catch (error) {
    if (ac.signal.aborted)
      throw new TonChainUnreadable(
        `no answer in ${CHAIN_READ_TIMEOUT_MS / 1000}s`
      )
    throw new TonChainUnreadable(
      error instanceof Error ? error.message : String(error)
    )
  } finally {
    clearTimeout(deadline)
  }

  if (!response.ok)
    throw new TonChainUnreadable(`HTTP ${response.status} from the TON API`)

  let data: { ok?: boolean; error?: unknown; result?: unknown[] }
  try {
    data = await response.json()
  } catch {
    throw new TonChainUnreadable('the TON API answered with something not JSON')
  }

  if (!data.ok) throw new TonChainUnreadable(String(data.error ?? 'ok: false'))

  return data as { ok: true; result?: unknown[] }
}
