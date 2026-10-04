/**
 * Wallets that belong to the HOUSE, not to a customer: the owner, the
 * autopilot and any other in-house automation running under an agent key.
 *
 * Set HOUSE_TELEGRAM_IDS="<owner id>,..." on the render service. Empty by
 * default: nobody is the house unless deployment says so. Read once at load,
 * as the agent's registry always did; the render server reads the same list
 * to pick the bot a finished reel is sent from.
 */
export const HOUSE_TELEGRAM_IDS: readonly string[] = (
  process.env.HOUSE_TELEGRAM_IDS || ''
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

export function isHouse(telegramId: string | number | null | undefined) {
  const id = String(telegramId ?? '').trim()
  return !!id && HOUSE_TELEGRAM_IDS.includes(id)
}
