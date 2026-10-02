/**
 * Launch a bot, retrying on Telegram 409 Conflict.
 *
 * On Railway a redeploy overlaps the old and the new instance for a short
 * while; both poll getUpdates for the same token and Telegram answers the
 * newcomer with 409 "terminated by other getUpdates request". Until now that
 * rejection was logged once and the bot stayed DEAD until the next deploy
 * (2026-09-07: neuro_blogger_bot and MetaMuse_Manifest_bot, two deployments
 * in a row, during a night of seven deploys). The old instance is gone within
 * a minute, so a bounded retry turns a dead bot into a late one. Anything
 * other than 409 is not retried -- it is a real error, and it is logged as
 * before.
 *
 * One home for the farm bots (src/index.ts) and the managed agent bots
 * (core/bot/managedBots/runner.ts): both poll, both overlap on a redeploy.
 *
 * Telegraf 4.16 resolves launch() only when polling stops, so the returned
 * promise settles then: true when polling ran and ended, false when the bot
 * never got to poll (a real error, retries spent, or `keepGoing` said stop).
 */
export async function launchWithConflictRetry(
  bot: {
    launch: (o: any) => Promise<unknown>
    stop: (reason?: string) => void
  },
  username: string,
  allowedUpdates: string[],
  attempts = 8,
  /**
   * Asked before every retry. A managed bot whose token changed is replaced
   * by a new instance; the old one's pending retry must not start it again.
   */
  keepGoing: () => boolean = () => true
): Promise<boolean> {
  for (let attempt = 1; ; attempt++) {
    try {
      await bot.launch({ allowedUpdates: allowedUpdates as any })
      const suffix = attempt > 1 ? ' (attempt ' + attempt + ')' : ''
      console.log(`🚀 Бот ${username} запущен в polling режиме${suffix}`)
      return true
    } catch (error: any) {
      const conflict =
        error?.response?.error_code === 409 ||
        error?.error_code === 409 ||
        /terminated by other getUpdates/.test(String(error?.message ?? error))
      if (!conflict || attempt >= attempts) {
        console.error(`❌ Ошибка запуска бота ${username}:`, error)
        return false
      }
      const waitMs = Math.min(15_000 * attempt, 60_000)
      console.warn(
        `⏳ 409 Conflict для ${username}: другой инстанс ещё поллит, повтор через ${waitMs / 1000}s (попытка ${attempt}/${attempts})`
      )
      try {
        bot.stop('409-retry')
      } catch {
        // not running -- nothing to stop
      }
      await new Promise(resolve => setTimeout(resolve, waitMs))
      if (!keepGoing()) return false
    }
  }
}
