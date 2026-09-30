import { ADMIN_IDS_ARRAY } from '@/config'
import { logger } from '@/utils/logger'

/**
 * AN ORDER FOR ONE OF THE THREE AGENTS, FROM ONE PRESS IN THE MINI APP.
 *
 * The mini app's package cards (player/src/components/Agents/PackageCards.tsx)
 * open this bot with `?start=agentpkg_<id>`. There is no checkout yet: the
 * team sets the agent's bot up by hand, so a press is a request -- the person
 * is told it arrived, and every admin gets the person and the package.
 *
 * The package catalogue lives in ONE place
 * (apps/vibee-editor/packages/vibee-atoms/src/agent-packages.ts) and the bot
 * does not import it. So this side carries only the id and never a name or a
 * price: a copy here would be the second home for a price that will change.
 */
export const AGENT_PACKAGE_PAYLOAD = /^agentpkg_([a-z]{2,20})$/i

/** The package id a /start payload orders, or null when it orders none. */
export function agentPackageIntent(payload: string | undefined): string | null {
  const m = payload ? AGENT_PACKAGE_PAYLOAD.exec(payload) : null
  return m ? m[1].toLowerCase() : null
}

export function agentPackageOrderReply(isRu: boolean): string {
  return isRu
    ? 'Заявка на агента принята ✅\n\nКоманда напишет вам здесь, в этом чате: уточнит задачи, настроит отдельного бота для вашего агента и пришлёт счёт. Первый месяц входит в цену запуска.'
    : 'Your agent request is in ✅\n\nThe team will write to you here, in this chat: to agree the tasks, set up a separate bot for your agent and send the invoice. The first month is included in the launch price.'
}

export interface PackageOrderer {
  id: number
  username?: string
  first_name?: string
}

export function agentPackageTeamNote(
  packageId: string,
  who: PackageOrderer,
  botUsername?: string
): string {
  const name = who.username ? `@${who.username}` : (who.first_name ?? '—')
  return [
    `🛒 Agent order: ${packageId}`,
    `From: ${name} (tg://user?id=${who.id})`,
    `Telegram ID: ${who.id}`,
    botUsername ? `Via bot: @${botUsername}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Tell every admin. One failed delivery (an admin who never opened this bot)
 * must not cost the others the order, and must not cost the person their
 * confirmation -- so each send is caught on its own.
 */
export async function notifyTeamOfPackageOrder(
  telegram: { sendMessage: (chatId: number, text: string) => Promise<unknown> },
  packageId: string,
  who: PackageOrderer,
  botUsername?: string
): Promise<number> {
  const text = agentPackageTeamNote(packageId, who, botUsername)
  let delivered = 0
  for (const admin of ADMIN_IDS_ARRAY) {
    try {
      await telegram.sendMessage(admin, text)
      delivered++
    } catch (error) {
      logger.warn('Agent package order: admin not reached', {
        admin,
        packageId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  logger.info('Agent package order', {
    packageId,
    telegramId: who.id,
    delivered,
  })
  return delivered
}
