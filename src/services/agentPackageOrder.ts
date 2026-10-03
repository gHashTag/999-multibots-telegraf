import { ADMIN_IDS_ARRAY } from '@/config'
import { logger } from '@/utils/logger'

/**
 * AN ORDER FOR ONE OF THE AGENTS, FROM ONE PRESS IN THE MINI APP.
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

/**
 * The ids the catalogue sells. A mirror, not a second home: the bot cannot
 * import the mini app's package, so agentPackageOrderDeepLink.test.ts reads
 * the catalogue's AgentPackageId and fails on the first difference. Without
 * it, `agentpkg_anything` reached every admin as an order for nothing.
 */
export const AGENT_PACKAGE_IDS = [
  'manager',
  'blogger',
  'twin',
  'tridev',
] as const

/** The package id a /start payload orders, or null when it orders none. */
export function agentPackageIntent(payload: string | undefined): string | null {
  const m = payload ? AGENT_PACKAGE_PAYLOAD.exec(payload) : null
  const id = m ? m[1].toLowerCase() : null
  return id && (AGENT_PACKAGE_IDS as readonly string[]).includes(id) ? id : null
}

/**
 * What the person is told. `delivered` is the number of admins who got the
 * order: zero means nobody on the team knows of it, and "your request is in"
 * would be a lie -- so the person is asked to press again instead of waiting
 * for a message that will never come.
 */
export function agentPackageOrderReply(
  isRu: boolean,
  outcome: PackageOrderOutcome = 'sent'
): string {
  if (outcome === 'undelivered') {
    return isRu
      ? 'Не получилось передать заявку команде ⚠️\n\nПохоже, сбой на нашей стороне. Нажмите «Заказать» ещё раз через пару минут.'
      : 'Your request did not reach the team ⚠️\n\nLooks like a hiccup on our side. Please press "Order" again in a couple of minutes.'
  }
  if (outcome === 'repeat') {
    return isRu
      ? 'Эта заявка уже у команды ✅\n\nПовторно отправлять не нужно — вам напишут здесь, в этом чате.'
      : 'The team already has this request ✅\n\nNo need to send it again — they will write to you here, in this chat.'
  }
  return isRu
    ? 'Заявка на агента принята ✅\n\nКоманда напишет вам здесь, в этом чате: уточнит задачи, настроит отдельного бота для вашего агента и пришлёт счёт. Агент работает по подписке звёздами Telegram, она продлевается раз в месяц.'
    : 'Your agent request is in ✅\n\nThe team will write to you here, in this chat: to agree the tasks, set up a separate bot for your agent and send the invoice. The agent runs on a monthly Telegram Stars subscription.'
}

/**
 * A double tap, or a person who presses "Order" again while waiting, is one
 * order -- the team is told once per person and package in this window.
 * In memory on purpose: a restart forgets it, and the worst that costs is
 * one repeated note to the team.
 */
export const REPEAT_ORDER_WINDOW_MS = 10 * 60 * 1000

export type PackageOrderOutcome = 'sent' | 'repeat' | 'undelivered'

interface OrderRecord {
  at: number
  /** Settles to true once the team got it; a failed order is dropped. */
  delivered: Promise<boolean>
}
const orders = new Map<string, OrderRecord>()

/**
 * Tell the team once per person and package inside the window.
 *
 * Telegraf handles a batch of updates at once, so a double tap reaches here
 * twice before the first note is out. The second press waits for the first
 * one's answer instead of guessing: "already with the team" only after the
 * team really has it, "could not pass it on" when it failed. A failed order
 * is forgotten, so pressing again retries at once.
 */
export async function placePackageOrder(
  telegramId: number,
  packageId: string,
  deliver: () => Promise<number>,
  now: number = Date.now()
): Promise<PackageOrderOutcome> {
  for (const [key, record] of orders) {
    if (now - record.at >= REPEAT_ORDER_WINDOW_MS) orders.delete(key)
  }
  const key = `${telegramId}:${packageId}`
  const earlier = orders.get(key)
  if (earlier) return (await earlier.delivered) ? 'repeat' : 'undelivered'

  const delivered = deliver().then(
    count => count > 0,
    () => false
  )
  const record: OrderRecord = { at: now, delivered }
  orders.set(key, record)
  const ok = await delivered
  if (!ok && orders.get(key) === record) orders.delete(key)
  return ok ? 'sent' : 'undelivered'
}

/** How many orders are remembered -- expired ones are dropped on the next order. */
export function rememberedOrderCount(): number {
  return orders.size
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
  const log = delivered > 0 ? logger.info : logger.error
  log.call(logger, 'Agent package order', {
    packageId,
    telegramId: who.id,
    delivered,
    // When nobody got it, the log is the only place the order survives.
    note: delivered > 0 ? undefined : text,
  })
  return delivered
}
