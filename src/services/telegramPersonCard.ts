/**
 * WHAT TELEGRAM OPENLY SAYS ABOUT THE PERSON THE AGENT IS TALKING TO.
 *
 * Owner, 2026-09-20: the tone of voice is wrong, because the agent does not
 * know who it is writing to. It knew a telegram id and a first name; Telegram
 * hands out a good deal more than that, for free, on every update and on one
 * cheap call:
 *
 *   from the update  id, first_name, last_name, username, language_code,
 *                    is_premium, is_bot
 *   getChat          bio, and whether the person even has a public profile
 *   getUserProfilePhotos  whether there is a face to work from at all
 *
 * None of it is private: it is what any person in a chat with them can see.
 * Nothing here reads a message, a contact or a phone number.
 *
 * ── WHY A CARD AND NOT A PROMPT FRAGMENT ───────────────────────────────────
 *
 * This returns DATA. Whoever builds the prompt decides how to phrase it, and
 * the phrasing stays in one place instead of being spread across the callers.
 * A field nobody filled in is simply absent from the card rather than carrying
 * a placeholder: a prompt that lists twelve "unknown"s teaches the model that
 * it knows twelve things about the person, all of them nothing.
 *
 * ── WHY IT NEVER THROWS ────────────────────────────────────────────────────
 *
 * A person with a locked-down profile makes `getChat` fail, and a failure here
 * must not cost them an answer. Every extra is optional; the fields from the
 * update itself always survive, because they arrived with the message.
 */
import { Telegram } from 'telegraf'
import { logger } from '@/utils/logger'

export interface TelegramPersonCard {
  telegramId: string
  firstName?: string
  lastName?: string
  username?: string
  /** Telegram's own code, e.g. 'ru', 'en-GB'. Not our stored choice. */
  languageCode?: string
  isPremium?: boolean
  /** The profile bio, when the person has one and shows it. */
  bio?: string
  /** True only when a profile photo was actually found. */
  hasPhoto?: boolean
}

/** The half that needs no network: it arrived with the message. */
export function cardFromUpdate(from: {
  id: number | string
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
}): TelegramPersonCard {
  const card: TelegramPersonCard = { telegramId: String(from.id) }
  if (from.first_name) card.firstName = from.first_name
  if (from.last_name) card.lastName = from.last_name
  if (from.username) card.username = from.username
  if (from.language_code) card.languageCode = from.language_code
  if (from.is_premium) card.isPremium = true
  return card
}

/**
 * Everything, including the two cheap calls.
 *
 * `telegram` is passed in rather than taken from a context so this can be
 * exercised without a bot: the calls are the only thing worth doubling.
 */
export async function personCard(
  telegram: Pick<Telegram, 'getChat' | 'getUserProfilePhotos'>,
  from: Parameters<typeof cardFromUpdate>[0]
): Promise<TelegramPersonCard> {
  const card = cardFromUpdate(from)

  try {
    const chat = (await telegram.getChat(Number(from.id))) as { bio?: string }
    if (chat?.bio) card.bio = chat.bio
  } catch (error) {
    logger.debug('[person-card] getChat refused', {
      telegram_id: card.telegramId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  try {
    const photos = await telegram.getUserProfilePhotos(Number(from.id), 0, 1)
    if ((photos?.total_count ?? 0) > 0) card.hasPhoto = true
  } catch (error) {
    logger.debug('[person-card] getUserProfilePhotos refused', {
      telegram_id: card.telegramId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return card
}

/**
 * The card as one line for a prompt, or '' when there is nothing to say.
 *
 * ONLY WHAT IS KNOWN. An empty string is the honest answer for a person who
 * has hidden everything, and it keeps the prompt free of a row of blanks that
 * a model reads as facts.
 */
export function describeForPrompt(card: TelegramPersonCard): string {
  const bits: string[] = []
  const name = [card.firstName, card.lastName].filter(Boolean).join(' ')
  if (name) bits.push(name)
  if (card.username) bits.push('@' + card.username)
  // cyrillic-ok-next-line: prompt text
  if (card.languageCode) bits.push(`язык Telegram: ${card.languageCode}`)
  if (card.isPremium) bits.push('Telegram Premium') // cyrillic-ok: prompt text
  if (card.bio) bits.push(`о себе: «${card.bio}»`) // cyrillic-ok: prompt text
  if (card.hasPhoto) bits.push('есть фото профиля') // cyrillic-ok: prompt text
  if (!bits.length) return ''
  // cyrillic-ok-next-line: prompt text
  return `Собеседник (данные Telegram, открытые): ${bits.join(', ')}.`
}
