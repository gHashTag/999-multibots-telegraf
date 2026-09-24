/**
 * The daily acceptance run (daily-acceptance.ts) wired to the real agent,
 * the verdict table and the owner's Telegram. Kept apart so the rules stay
 * testable without a model or a bot token.
 *
 * On unless ACCEPTANCE_DAILY=0. The owner chose it (2026-09-24); the cost is
 * five agent turns a day. It runs as the first keeper (hive/roles.ts), on
 * whose accounts the canaries read.
 */
import type { Queryable } from '../browser/sessions'
import {
  CANARIES,
  CANARIES_HASH,
  dueCanaries,
  everyMs,
  runAcceptance,
} from './daily-acceptance'

/** A turn is given this long; a daily check is in no hurry. */
export const CANARY_TIMEOUT_MS = 240_000

let running = false

export async function runDailyAcceptanceIfDue(
  pool: Queryable,
  opts: { force?: boolean } = {}
): Promise<string> {
  if (process.env.ACCEPTANCE_DAILY === '0') return 'off'
  if (running) return 'already running'
  const { keepers } = await import('../hive/roles')
  const owner = keepers()[0]
  if (!owner) return 'no keeper'
  const { latestVerdicts, recordVerdicts } = await import('./agent-acceptance')
  const latest = await latestVerdicts(pool)
  const due = opts.force
    ? [...CANARIES]
    : dueCanaries(latest, Date.now(), everyMs(), CANARIES_HASH)
  if (!due.length) return 'not due'
  running = true
  try {
    const { runAgent } = await import('./chat')
    const { sendToTelegram } = await import('../auth/telegram-sender')
    const verdicts = await runAcceptance(
      {
        turn: c =>
          runAgent(
            [{ role: 'user', content: c.canary }],
            {
              telegramId: owner,
              pool,
              turn: `acceptance:${c.id}:${Date.now()}`,
              surface: 'unknown',
            },
            {
              /* The same surface a keyed `tri agents` turn gets. */
              surface: 'unknown',
              marketplaceAgent: c.id,
              signal: AbortSignal.timeout(CANARY_TIMEOUT_MS),
            }
          ) as AsyncIterable<Record<string, unknown>>,
        previous: async () => latest,
        record: async v => {
          /*
           * ONE LINE PER VERDICT, as it is made: the run's summary is written
           * only at its end, and a run a deploy interrupts never gets there
           * (24.09: "[acceptance] 1/1 passed" said nothing about the four
           * verdicts kept before it). Agent, pass/fail, codes -- never text.
           */
          for (const x of v)
            console.log(
              `[acceptance] ${x.agent} ${x.pass ? 'PASS' : 'FAIL'}` +
                (x.codes.length ? ` ${x.codes.join(',')}` : '') +
                ` tools=${x.tools.join(',')}`
            )
          await recordVerdicts(pool, v, owner, CANARIES_HASH)
        },
        tell: async text => {
          await sendToTelegram(owner, text)
        },
      },
      due
    )
    return `${verdicts.filter(v => v.pass).length}/${verdicts.length} passed`
  } finally {
    running = false
  }
}
