/**
 * The /newbot link, built in one place and used on both sides.
 *
 * A copy rather than an import: the bot service and the render are separate
 * deployments with separate builds, and the rule is four lines. The contract
 * test in the bot keeps the two honest about the shape Telegram documents.
 */
/** Telegram's own rules for a bot username, checked before we suggest one. */
const BOT_USERNAME = /^[A-Za-z][A-Za-z0-9_]{3,30}[Bb][Oo][Tt]$/

/**
 * The link that makes Telegram create a bot managed by us.
 *
 * The suggested username is a SUGGESTION -- the person can change it in
 * Telegram's own flow -- but an invalid one makes the link useless, so it is
 * refused here rather than sent and wondered about.
 */
export function newBotLink(
  manager: string,
  suggested: string,
  name?: string | null
): string {
  const us = String(manager ?? '')
    .trim()
    .replace(/^@/, '')
  const bot = String(suggested ?? '')
    .trim()
    .replace(/^@/, '')
  if (!us) throw new Error('не задано имя бота-менеджера')
  if (!BOT_USERNAME.test(bot)) {
    throw new Error(
      `«${bot}» не подходит: имя бота — латиница, цифры и _, от 5 до 32 знаков, и обязано кончаться на bot`
    )
  }
  const base = `https://t.me/newbot/${us}/${bot}`
  const title = String(name ?? '').trim()
  return title ? `${base}?name=${encodeURIComponent(title)}` : base
}
