/**
 * Which bot a finished render reaches its buyer from (crm-story-reel v19,
 * DELIVER_VIA_HOME_BOT).
 *
 * Until 2026-10-03 every finished render left from TELEGRAM_BOT_TOKEN, the
 * service's main bot. The owner talks to Trinity in @t27ai_bot, so his own
 * reel landed in a chat he does not read -- and a client of a seller's bot
 * got hers from a bot she may never have opened. Now: the house first through
 * HOUSE_DELIVERY_BOT, then the person's own bot (users.bot_name), then the
 * main bot, each tried once until one delivers.
 */
import { isHouse } from './house-ids'
import * as SPEC from './spec/crm-story-reel.gen'

export interface BuyerBotDeps {
  isHouse: (telegramId: string) => boolean
  /** A farm bot's token by its username, or null. */
  tokenForBot: (botName: string) => Promise<string | null>
  /** users.bot_name of this person, or null. */
  botNameOf: (telegramId: string) => Promise<string | null>
  mainToken: string | undefined
}

/** The tokens to try, in order, each once. */
export async function buyerBotTokens(
  telegramId: string,
  deps: BuyerBotDeps
): Promise<string[]> {
  const names: string[] = []
  if (SPEC.DELIVER_VIA_HOME_BOT) {
    if (deps.isHouse(telegramId)) names.push(SPEC.HOUSE_DELIVERY_BOT)
    const own = await deps.botNameOf(telegramId).catch(() => null)
    if (own) names.push(own)
  }
  const tokens: string[] = []
  for (const name of names) {
    const token = await deps.tokenForBot(name).catch(() => null)
    if (token) tokens.push(token)
  }
  if (deps.mainToken) tokens.push(deps.mainToken)
  return [...new Set(tokens)]
}

/** Sends through each bot in turn; true once one of them delivered. */
export async function deliverToBuyer(
  telegramId: string,
  send: (token: string) => Promise<boolean>,
  deps: BuyerBotDeps
): Promise<boolean> {
  for (const token of await buyerBotTokens(telegramId, deps)) {
    if (await send(token).catch(() => false)) return true
  }
  return false
}

export function liveBuyerBotDeps(): BuyerBotDeps {
  return {
    isHouse,
    tokenForBot: async name =>
      (await (await import('./agent/bot-farm')).tokenForBot(name))?.token ??
      null,
    botNameOf: async id => (await import('./agent/bot-farm')).botNameOf(id),
    mainToken: process.env.TELEGRAM_BOT_TOKEN,
  }
}
