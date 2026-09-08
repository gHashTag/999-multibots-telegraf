/**
 * Inline mode: a user types `@<bot> <query>` in ANY chat and Telegram shows
 * service cards from this bot; tapping one posts the card into that chat with
 * an "open in the bot" deep link (t.me/<bot>?start=svc_<key>). The /start
 * handler routes the svc_ parameter straight into the service's scene for an
 * existing user (see registerNavigationCommands). Every posted card carries
 * the bot's username next to the sender's name, so each share advertises the
 * bot. Enable per bot in BotFather with /setinline.
 */
import type { Telegraf } from 'telegraf'
import type { InlineQueryResultArticle } from 'telegraf/types'
import { ModeEnum } from '@/interfaces/modes'
import { logger } from '@/utils/logger'

export const START_PARAM_PREFIX = 'svc_'
export const INLINE_CACHE_SECONDS = 300

export interface ServiceCard {
  key: string
  /** Scene the deep link lands in for an existing user; undefined = main menu. */
  mode?: ModeEnum
  emoji: string
  title: string
  description: string
  keywords: readonly string[]
}

export const SERVICE_CARDS: readonly ServiceCard[] = [
  {
    key: 'neurophoto',
    mode: ModeEnum.NeuroPhoto,
    emoji: '🖼',
    title: 'Нейрофото',
    description: 'AI-фотосессия по вашим селфи',
    keywords: ['фото', 'photo', 'нейро', 'селфи', 'портрет', 'neuro'],
  },
  {
    key: 'text2video',
    mode: ModeEnum.TextToVideo,
    emoji: '🎬',
    title: 'Видео из текста',
    description: 'Ролик по вашему описанию',
    keywords: ['видео', 'video', 'ролик', 'reels', 'клип'],
  },
  {
    key: 'image2video',
    mode: ModeEnum.ImageToVideo,
    emoji: '🎞',
    title: 'Оживить фото',
    description: 'Видео из вашей картинки',
    keywords: ['видео', 'video', 'оживить', 'анимация', 'animate'],
  },
  {
    key: 'avatar',
    mode: ModeEnum.DigitalAvatarBody,
    emoji: '🧬',
    title: 'Цифровой аватар',
    description: 'Ваша цифровая копия для видео',
    keywords: ['аватар', 'avatar', 'цифровой', 'двойник', 'копия'],
  },
  {
    key: 'voice',
    mode: ModeEnum.TextToSpeech,
    emoji: '🎙',
    title: 'Озвучка',
    description: 'Текст в голос, клон вашего голоса',
    keywords: ['голос', 'voice', 'озвучка', 'speech', 'tts', 'звук'],
  },
  {
    key: 'chat',
    mode: ModeEnum.ChatWithAvatar,
    emoji: '💬',
    title: 'AI-чат',
    description: 'Разговор с ИИ-ассистентом',
    keywords: ['чат', 'chat', 'gpt', 'ассистент', 'claude', 'вопрос'],
  },
]

const words = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(w => w.length >= 3)

/** Inflection-tolerant prefix: "озвучку" and "озвучка" share "озвуч". */
const stem = (w: string): string => w.slice(0, Math.max(4, w.length - 2))

/**
 * Empty query lists every card. Otherwise a query word matches a card when it
 * shares a stem with a word of the title or a keyword; the description is not
 * searched (it mentions other services, e.g. "копия для видео").
 */
export function matchCards(query: string): ServiceCard[] {
  const qs = words(query)
  if (!qs.length) return [...SERVICE_CARDS]
  return SERVICE_CARDS.filter(card => {
    const terms = [
      ...words(card.title),
      ...card.keywords.map(k => k.toLowerCase()),
    ]
    return qs.some(q =>
      terms.some(t => t.startsWith(stem(q)) || q.startsWith(stem(t)))
    )
  })
}

export function deepLink(username: string, card: ServiceCard): string {
  return `https://t.me/${username}?start=${START_PARAM_PREFIX}${card.key}`
}

export function serviceFromStartParam(
  param: string | undefined
): ServiceCard | undefined {
  if (!param || !param.startsWith(START_PARAM_PREFIX)) return undefined
  const key = param.slice(START_PARAM_PREFIX.length)
  return SERVICE_CARDS.find(card => card.key === key)
}

export function buildInlineResults(
  username: string,
  query: string
): InlineQueryResultArticle[] {
  return matchCards(query).map(card => {
    const url = deepLink(username, card)
    return {
      type: 'article',
      id: card.key,
      title: `${card.emoji} ${card.title}`,
      description: card.description,
      input_message_content: {
        message_text:
          `${card.emoji} <b>${card.title}</b>\n${card.description}\n\n` +
          `👉 <a href="${url}">Открыть в @${username}</a>`,
        parse_mode: 'HTML',
      },
      reply_markup: {
        inline_keyboard: [[{ text: '🚀 Открыть в боте', url }]],
      },
    }
  })
}

export function registerInlineQuery(bot: Telegraf<any>): void {
  bot.on('inline_query', async ctx => {
    // botInfo is filled by launch(), after registration: read it per query.
    const username = ctx.botInfo?.username || ''
    const query = ctx.inlineQuery.query || ''
    const results = buildInlineResults(username, query)
    try {
      await ctx.answerInlineQuery(results, {
        cache_time: INLINE_CACHE_SECONDS,
        is_personal: false,
        button: { text: '🤖 Открыть бота', start_parameter: 'inline' },
      })
    } catch (error) {
      logger.warn('[Inline] answerInlineQuery failed', {
        error: error instanceof Error ? error.message : String(error),
        query: query.slice(0, 64),
        results: results.length,
      })
    }
  })
}
