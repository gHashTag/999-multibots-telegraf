import { MyContext } from '@/interfaces'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'

/**
 * THE GOLDEN FOUNDRY IS NO LONGER SOLD.
 *
 * It lived under /club in @t27ai_bot: three draft tiers (1 499 / 3 999 /
 * 12 499 Stars), written into payments_v2, zero sales ever (measured
 * 2026-09-22). The owner's decision the same day: the one subscription is the
 * club (render club-membership.ts), and /club, /foundry and `?start=foundry`
 * now open its card (navigation/helpers/clubCard.ts).
 *
 * What stays is only what a LATE payment of an invoice already sent needs:
 * the tiers, to parse its payload, and the welcome. Nothing here offers or
 * mints anything any more; an old tier button still in somebody's chat lands
 * on the club card (RETIRED_OFFER_CALLBACK).
 */
export const FOUNDRY_PAYLOAD_PREFIX = 'foundry-'

export interface ClubTier {
  key: 'apprentice' | 'master' | 'founder'
  stars: number
  subscriptionType: SubscriptionType
  ru: { name: string; blurb: string }
  en: { name: string; blurb: string }
}

export const CLUB_TIERS: ClubTier[] = [
  {
    key: 'apprentice',
    stars: 1499,
    subscriptionType: SubscriptionType.CLUB_APPRENTICE,
    ru: {
      name: 'Подмастерье',
      blurb:
        'Закрытый канал, еженедельные разборы замеров, KAT-векторы и репозитории до публикации.',
    },
    en: {
      name: 'Apprentice',
      blurb:
        'Private channel, weekly measurement teardowns, KAT vectors and repos before they go public.',
    },
  },
  {
    key: 'master',
    stars: 3999,
    subscriptionType: SubscriptionType.CLUB_MASTER,
    ru: {
      name: 'Мастер',
      blurb:
        'Всё выше, плюс удалённые прогоны на живых платах Artix-7 и разбор вашего RTL раз в месяц.',
    },
    en: {
      name: 'Journeyman',
      blurb:
        'Everything above, plus remote runs on live Artix-7 boards and a monthly teardown of your RTL.',
    },
  },
  {
    key: 'founder',
    stars: 12499,
    subscriptionType: SubscriptionType.CLUB_FOUNDER,
    ru: {
      name: 'Литейщик',
      blurb:
        'Всё выше, плюс сопровождение вашего дизайна до тейпаута и совместная публикация замеров.',
    },
    en: {
      name: 'Founder',
      blurb:
        'Everything above, plus your design walked to tape-out and co-published measurements.',
    },
  },
]

export function getClubTierByKey(key: string): ClubTier | undefined {
  return CLUB_TIERS.find(t => t.key === key)
}

/**
 * Разбирает payload инвойса клуба вида `foundry-master_3999_1755859200000`.
 * Возвращает null, если это не клубный payload или он повреждён.
 */
export function parseFoundryPayload(
  payload: string
): { tier: ClubTier; stars: number } | null {
  if (!payload.startsWith(FOUNDRY_PAYLOAD_PREFIX)) return null
  const parts = payload.split('_')
  const tierKey = parts[0].slice(FOUNDRY_PAYLOAD_PREFIX.length)
  const tier = getClubTierByKey(tierKey)
  if (!tier) return null
  const stars = parseInt(parts[1], 10)
  if (isNaN(stars) || stars <= 0) return null
  return { tier, stars }
}

/** Сообщение после успешной оплаты клуба (сам платёж пишет paymentHandlers). */
export async function replyClubWelcome(
  ctx: MyContext,
  tier: ClubTier,
  channelId: string | null
): Promise<void> {
  const isRu = isRussianFromState(ctx)
  const loc = isRu ? tier.ru : tier.en

  const text = isRu
    ? `🏛 Добро пожаловать в Золотую Литейную, уровень «${loc.name}»!

Что дальше:
1. Вступай в закрытый канал клуба — кнопка ниже.
2. Присылай свой RTL прямо сюда, в этот чат.
3. Ближайший разбор замеров — анонс в канале.

Вопросы: admin@t27.ai`
    : `🏛 Welcome to the Golden Foundry, tier "${loc.name}"!

Next steps:
1. Join the private club channel — button below.
2. Send your RTL right here in this chat.
3. The next teardown is announced in the channel.

Questions: admin@t27.ai`

  if (!channelId) {
    // Канал клуба не настроен (нет строки avatars для клубного бота).
    // Обещать кнопку, которой нет, нельзя: человек уже заплатил.
    logger.error('[foundryClub] Paid membership but club channel is not set', {
      telegram_id: ctx.from?.id,
      tier: tier.key,
      hint: 'INSERT INTO avatars (telegram_id, bot_name, "group") — канал клуба',
    })
    await ctx.reply(
      isRu
        ? `🏛 Добро пожаловать в Золотую Литейную, уровень «${loc.name}»!

Оплата получена. Инвайт в закрытый канал придёт сюда в течение суток — канал сейчас подключается.

Присылай свой RTL прямо в этот чат. Вопросы: admin@t27.ai`
        : `🏛 Welcome to the Golden Foundry, tier "${loc.name}"!

Payment received. The invite to the private channel will arrive here within a day — the channel is being set up.

Send your RTL right here in this chat. Questions: admin@t27.ai`
    )
    return
  }

  const url = channelId.startsWith('@')
    ? `https://t.me/${channelId.slice(1)}`
    : channelId.startsWith('http')
      ? channelId
      : `https://t.me/${channelId}`

  await ctx.reply(text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: isRu ? '🏛 Войти в Литейную' : '🏛 Enter the Foundry', url }],
      ],
    },
  })
}
