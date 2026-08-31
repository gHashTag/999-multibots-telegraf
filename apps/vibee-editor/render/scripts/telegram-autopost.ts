/**
 * AUTOPOSTING REELS INTO THE TELEGRAM CHANNEL -- a thin wrapper over the
 * delivery module, kept for running the drain by hand.
 *
 * WHAT CHANGED HERE AND WHY. All of the delivery logic used to live in this
 * file, and NOTHING called the file: a repo-wide grep found only its own "how
 * to run me" comment. It also read TG_POST_*, while the deploy defines
 * TELEGRAM_CHANNEL_* -- so even with a caller it would have been a permanent
 * dry run, which is indistinguishable from an owner who has not switched the
 * channel on. The logic moved to src/channel-delivery.ts (the only place
 * `npm run typecheck` looks: the tsconfig include has not one file from
 * scripts/), and the autopilot calls it on every tick.
 *
 * SETTINGS (deploy names first, the old TG_POST_* names as fallbacks):
 *   TELEGRAM_CHANNEL_BOT_TOKEN | TG_POST_BOT_TOKEN   token of the channel admin bot
 *   TELEGRAM_CHANNEL_ID        | TG_POST_CHANNEL_ID  @name or -100...
 *   TG_POST_MAX_PER_RUN  ceiling for ONE run, default 1
 *   TG_POST_MAX_PER_DAY  ceiling for a DAY, default 0 (delivery is off)
 * Without credentials it is a dry run: it prints what it would send, exit 0.
 *
 * Run it with the same environment as the autopilot (DATABASE_URL needed):
 *   npx tsx scripts/telegram-autopost.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { deliverToChannel } from '../src/channel-delivery'
import { withDb } from '../src/autopilot-state'

const LOOP_DIR =
  process.env.LOOP_DIR || path.resolve(process.cwd(), '../../../loop')
const LOG = path.join(LOOP_DIR, 'LOOP_STATE.md')

function log(line: string) {
  console.log(`[tg-post] ${line}`)
  try {
    fs.appendFileSync(LOG, `- ${new Date().toISOString()} tg-post: ${line}\n`)
  } catch {
    /* the journal is not critical */
  }
}

export async function run(): Promise<number> {
  const r = await withDb(db => deliverToChannel({ db, log }))
  log(
    `итог: отправлено ${r.sent}, не удалось ${r.failed}, осталось ${r.skipped}` +
      (r.dryRun ? ' (сухой прогон)' : '')
  )
  /**
   * EXIT 0 EVEN WHEN A SEND FAILED, and that is not softness.
   *
   * The run completed and reported; a refusal from Telegram is a recorded
   * outcome (the attempt counter grew), not an inability to work. The previous
   * version called process.exit(1) from inside the sending logic -- and once a
   * daemon imports such logic, one channel refusal kills the process and drops
   * it into the render server's 60-second respawn. A missing DATABASE_URL is
   * configuration too, not a fault: with no database there is simply nothing to
   * select, and the module says so.
   */
  return 0
}

// Self-run ONLY as a program. Importing the module (tests, the daemon) must not
// send anything: the old file called main() at import time.
if (require.main === module) {
  void (async () => {
    process.exitCode = await run().catch(e => {
      log(`падение: ${String(e).slice(0, 300)}`)
      return 1
    })
  })()
}
