import { Telegraf, Markup } from 'telegraf'
import { MyContext } from '@/interfaces'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { logger } from '@/utils/logger'

/**
 * Клуб «Золотая Литейная» (Golden Foundry) — закрытый клуб разработчиков
 * на кремнии. Живёт в боте @t27ai_bot, лендинг — t27.ai/#/foundry.
 *
 * ⚠️ ЦЕНЫ — ЧЕРНОВИК. Суммы не подтверждены владельцем (см. DRAFT_TERMS на
 * лендинге). Менять здесь и на сайте синхронно.
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

export const CLUB_BOT_USERNAME = 't27ai_bot'
const CLUB_BOT_LINK = `https://t.me/${CLUB_BOT_USERNAME}?start=foundry`

/**
 * Клуб продаётся только в @t27ai_bot: registerCommands вешает команды на все
 * боты платформы, а оплата в чужом боте записала бы доход чужому владельцу
 * (bot_name берётся из ctx.botInfo) и дала бы кнопку не на тот канал.
 */
function isClubBot(ctx: MyContext): boolean {
  return ctx.botInfo?.username === CLUB_BOT_USERNAME
}

async function redirectToClubBot(ctx: MyContext): Promise<void> {
  const isRu = isRussianFromState(ctx)
  await ctx.reply(
    isRu
      ? `🏛 Клуб «Золотая Литейная» живёт в отдельном боте: ${CLUB_BOT_LINK}`
      : `🏛 The Golden Foundry club lives in its own bot: ${CLUB_BOT_LINK}`
  )
}

/** Питч клуба + кнопки уровней. /club, /foundry, deep-link — только в клубном боте. */
export async function handleClubCommand(ctx: MyContext): Promise<void> {
  if (!isClubBot(ctx)) {
    return redirectToClubBot(ctx)
  }
  const isRu = isRussianFromState(ctx)

  const text = isRu
    ? `🏛 <b>Золотая Литейная</b> — закрытый клуб разработчиков на кремнии.

Внутри:
• свой FPGA-стенд — присылаешь RTL, получаешь измерение, а не мнение
• еженедельный разбор чужих замеров
• право первым проверить метод до публикации

Мест мало: беру столько, скольким успеваю читать код лично.

Подробнее: t27.ai/foundry
Оплата — звёздами Telegram. Выбери уровень:`
    : `🏛 <b>Golden Foundry</b> — a private club for people who build on silicon.

Inside:
• a live FPGA bench — send RTL, get a measurement, not an opinion
• weekly teardowns of published numbers
• first right to check methods before they are published

Seats are few: I take as many people as I can personally read code for.

Details: t27.ai/foundry
Payment — Telegram Stars. Pick a tier:`

  await ctx.reply(text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(
      CLUB_TIERS.map(t => [
        Markup.button.callback(
          `${isRu ? t.ru.name : t.en.name} — ${t.stars}⭐`,
          `club_buy_${t.key}`
        ),
      ])
    ),
  })
}

/** Кнопки уровней → инвойс в звёздах. */
export function registerClubActions(bot: Telegraf<MyContext>): void {
  bot.action(/^club_buy_(apprentice|master|founder)$/, async ctx => {
    await ctx.answerCbQuery() // ВСЕГДА первой строкой

    if (!isClubBot(ctx)) {
      return redirectToClubBot(ctx)
    }

    const isRu = isRussianFromState(ctx)
    const tier = getClubTierByKey(ctx.match[1])
    if (!tier) {
      logger.error('[foundryClub] Unknown tier in callback', {
        data: ctx.match[0],
        telegram_id: ctx.from?.id,
      })
      return
    }

    const loc = isRu ? tier.ru : tier.en
    // Формат payload закреплён: parseFoundryPayload() читает первые два
    // сегмента `foundry-<tier>_<stars>`; telegram_id в хвосте делает inv_id
    // уникальным даже при двух оплатах в одну миллисекунду.
    const payload = `${FOUNDRY_PAYLOAD_PREFIX}${tier.key}_${tier.stars}_${ctx.from?.id ?? 0}_${Date.now()}`

    try {
      await ctx.replyWithInvoice({
        title: isRu
          ? `Золотая Литейная — ${loc.name}`
          : `Golden Foundry — ${loc.name}`,
        description: loc.blurb,
        payload,
        currency: 'XTR',
        prices: [
          {
            label: isRu ? 'Месяц в клубе' : 'A month in the club',
            amount: tier.stars,
          },
        ],
        provider_token: '',
      })
      logger.info('[foundryClub] Invoice sent', {
        telegram_id: ctx.from?.id,
        tier: tier.key,
        stars: tier.stars,
      })
    } catch (error) {
      logger.error('[foundryClub] Failed to send invoice', {
        error: error instanceof Error ? error.message : String(error),
        telegram_id: ctx.from?.id,
        tier: tier.key,
      })
      await ctx.reply(
        isRu
          ? '❌ Не удалось создать счёт. Попробуйте позже или напишите admin@t27.ai'
          : '❌ Could not create the invoice. Try later or write to admin@t27.ai'
      )
    }
  })
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
