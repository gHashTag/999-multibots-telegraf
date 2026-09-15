/**
 * The /newbot link, built in one place and used on both sides.
 *
 * A copy rather than an import: the bot service and the render are separate
 * deployments with separate builds, and the rule is four lines. The contract
 * test in the bot keeps the two honest about the shape Telegram documents.
 */
/** Telegram's own rules for a bot username, checked before we suggest one. */
/*
 * TELEGRAM'S RULE, MEASURED AGAINST OUR OWN SENTENCE.
 *
 * This was `{3,30}` between the first letter and the "bot" suffix, which is
 * 7..34 characters in total -- while the refusal beside it says "5 to 32",
 * which is Telegram's actual rule. Wrong in BOTH directions, and both cost
 * something in the one path that creates a new owner's bot:
 *
 *   "aabot"  (5, valid)   was refused by us
 *   34 chars (invalid)    passed us and would be refused by Telegram, after
 *                         the person had already opened the link
 *
 * 1 + {1,28} + 3 = 5..32, which is what the message promises.
 */
const BOT_USERNAME = /^[A-Za-z][A-Za-z0-9_]{1,28}[Bb][Oo][Tt]$/

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
      // promise-checked: BOT_USERNAME is 5..32 now, pinned by managedBots.test.ts
      `«${bot}» не подходит: имя бота — латиница, цифры и _, от 5 до 32 знаков, и обязано кончаться на bot`
    )
  }
  const base = `https://t.me/newbot/${us}/${bot}`
  const title = String(name ?? '').trim()
  return title ? `${base}?name=${encodeURIComponent(title)}` : base
}
