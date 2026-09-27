/**
 * A PICTURE THAT WAS PAID FOR IS NOT GIVEN UP ON BECAUSE THE TURN ENDED.
 *
 * MEASURED IN PRODUCTION 2026-09-21. The CRM gift -- GPT Image 2.5 edit on
 * Kie, the person's own avatar, 9:16 -- was refused at 06:33Z with "Kie did
 * not answer within the allotted time... credits already charged, task id
 * 2ef3f5ef...". Asked afterwards, Kie's recordInfo said `success`, costTime
 * 380 s, one result URL on its temporary host. The turn had waited 180 s. So
 * every portrait slower than three minutes was paid for, drawn, and thrown
 * away, and the seller then offered the person something else instead.
 *
 * The waiting was never the problem; stopping for good was. This module is
 * what happens after a turn stops waiting:
 *
 *   - `watchLate` keeps asking in the background, in this process, bounded
 *     (twenty minutes). It survives the turn, not a redeploy -- which is why
 *     the caller also stores the task id next to the debt (crm-owed.ts).
 *   - `lookOnce` is the single question, for the next attempt and for the
 *     owner's rescue: what became of task X? It never creates a task.
 *   - One watcher per task id. A second caller gets the SAME promise, so the
 *     result is fetched and stored once, however many paths want it.
 *
 * Nothing here moves money. What a late verdict means for a wallet is the
 * caller's decision (tools.ts image_edit), made once, where the charge was.
 */
import type { KieTaskState } from '../kie-image'
// The ledger reference is the spec's: gHashTag/t27 specs/automation/crm-story-reel.t27.
import * as SPEC from '../spec/crm-story-reel.gen'

/**
 * The ledger reference of a late picture's refund: one per provider task, so
 * the two paths that can notice a picture never came (image_edit's watch, a
 * story job resuming after a redeploy) give its charge back once between them.
 */
export function lateRefundRef(taskId: string): string {
  return `${SPEC.LATE_REFUND_REF_PREFIX}${String(taskId ?? '').trim()}`
}

/** How long a background watch keeps asking before it lets the stored id carry on. */
export const LATE_WATCH_MS = 20 * 60_000
/** How often it asks. recordInfo is free, but a tight loop is still a loop. */
export const LATE_POLL_MS = 15_000

export type LateOutcome =
  /** The picture is ours now: `url` is on our own storage, not the provider's. */
  | { state: 'ready'; taskId: string; url: string }
  /** The provider said no. Nothing will come of this task. */
  | { state: 'failed'; taskId: string; reason: string }
  /** Not finished yet, or finished but not yet copied to our storage. */
  | { state: 'running'; taskId: string; reason?: string }
  /**
   * The question got no answer about the task: a network error, a missing
   * key, a record the provider no longer has (or never had). Kept apart from
   * `running` on purpose -- "still drawing" is a fact about the task, this is
   * not, and a task that only ever answers this must be given up on at some
   * point (crm-deliver-tool.ts PORTRAIT_GIVE_UP_MS) instead of being waited
   * for forever.
   */
  | { state: 'unknown'; taskId: string; reason: string }

export interface LateDeps {
  /** One recordInfo. Default: kie-image.ts kieTaskState. */
  check: (taskId: string) => Promise<KieTaskState>
  /**
   * Copy the provider's temporary file to our own storage and register it.
   * Returns our URL, or '' when the copy did not happen (tried again later).
   */
  keep: (providerUrl: string, taskId: string) => Promise<string>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

// owner-scope: per process -- keyed by the provider's task id, which is
// unguessable and belongs to whoever created it; no person is looked up here.
const watching = new Map<string, Promise<LateOutcome>>()
// owner-scope: per process -- the same task id key, holding our own URL only.
const kept = new Map<string, string>()

/** For tests, which share one module between cases. */
export function forgetLatePicturesForTests(): void {
  watching.clear()
  kept.clear()
}

/** Is a background watch already asking about this task? */
export function isWatching(taskId: string): boolean {
  return watching.has(String(taskId))
}

/**
 * Ask once. Never creates anything at the provider, never charges anybody.
 *
 * A picture already copied in this process is answered from memory, so two
 * paths that both learn "success" do not upload it twice.
 */
export async function lookOnce(
  taskId: string,
  deps: LateDeps
): Promise<LateOutcome> {
  const id = String(taskId ?? '').trim()
  const have = kept.get(id)
  if (have) return { state: 'ready', taskId: id, url: have }
  let st: KieTaskState
  try {
    st = await deps.check(id)
  } catch (e) {
    return { state: 'unknown', taskId: id, reason: String(e).slice(0, 160) }
  }
  if (st.state === 'fail')
    return { state: 'failed', taskId: id, reason: st.reason }
  if (st.state === 'unknown')
    return { state: 'unknown', taskId: id, reason: st.reason }
  if (st.state !== 'success') return { state: 'running', taskId: id }
  let url = ''
  try {
    url = await deps.keep(st.url, id)
  } catch (e) {
    return {
      state: 'running',
      taskId: id,
      reason: `готово у провайдера, но не скопировано: ${String(e).slice(0, 120)}`,
    }
  }
  if (!url)
    return {
      state: 'running',
      taskId: id,
      reason: 'готово у провайдера, но не скопировано к нам',
    }
  kept.set(id, url)
  return { state: 'ready', taskId: id, url }
}

/**
 * Keep asking until there is a verdict or the bound runs out.
 *
 * Returns the SAME promise to every caller for one task id while it runs.
 * Resolves `running` (or `unknown`) at the bound: the task id is stored with
 * the debt, and the next attempt asks again with `lookOnce`.
 */
export function watchLate(
  taskId: string,
  deps: LateDeps,
  o: { boundMs?: number; everyMs?: number } = {}
): Promise<LateOutcome> {
  const id = String(taskId ?? '').trim()
  const already = watching.get(id)
  if (already) return already
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)))
  const now = deps.now ?? Date.now
  const deadline = now() + (o.boundMs ?? LATE_WATCH_MS)
  const every = o.everyMs ?? LATE_POLL_MS
  const run = (async (): Promise<LateOutcome> => {
    for (;;) {
      await sleep(every)
      const out = await lookOnce(id, deps)
      // No verdict yet -- still drawing, or the question itself failed: ask
      // again until the bound.
      if (out.state === 'ready' || out.state === 'failed') return out
      if (now() >= deadline) return out
    }
  })()
  const tracked = run.finally(() => watching.delete(id))
  // A rejection nobody awaits would take the process down with it.
  tracked.catch(() => undefined)
  watching.set(id, tracked)
  return tracked
}
