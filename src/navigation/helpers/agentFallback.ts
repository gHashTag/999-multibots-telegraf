/**
 * WHEN THE AGENT MISSES A TURN IN THE BOT CHAT.
 *
 * Measured in production 2026-09-22, @neuro_blogger_bot: a person sent a link
 * and then a line in Russian. The agent (render, zai/glm-5.3) called
 * `my_assets` and `my_renders` and came back with an EMPTY answer after about
 * 70 s. The bot logged "empty answer, taking the fallback" and handed the
 * message to `chatWithAI` -- a model with no tools and no history -- whose
 * prompt named no reply language and still said "there are no tariffs or
 * subscriptions". It answered in English, introduced itself, invented
 * "Instagram analytics" and suggested /start.
 *
 * Three rules follow, one per defect:
 *
 *  1. AN EMPTY ANSWER IS NOT HANDED ON. The agent had the tools and the whole
 *     conversation and still produced nothing; a toolless model with less
 *     context can only guess. The person gets one honest line in their own
 *     language, under the standard buttons. The same holds when the render
 *     REPORTS the failure in its stream, and when the failed turn already
 *     spent money: then the line says the work may have started, because
 *     "please repeat" after a paid generation is how a person pays twice.
 *  2. WHEN THE AGENT IS UNREACHABLE, the toolless model may still answer, but
 *     its prompt names the reply language, says it has no tools, forbids
 *     inventing services, carries the last turns of this chat when they are
 *     already in hand, and tells the truth about money: tokens, and ONE
 *     subscription -- the club. No price is written here: the club card reads
 *     it from the render's cashier, behind /club.
 *  3. EVERY LINE FOLLOWS THE PERSON'S LANGUAGE, including the one said when
 *     even the fallback model fails.
 */
import type { ChatMessage } from '@/services/aiChatService'
import {
  SIDE_EFFECT_TOOL,
  historyOf,
  reportedByAgent,
  toolsUsedOf,
  type PastTurn,
} from '@/services/agentTurnSpend'
import { ACTIONS } from './actionButtons'

/** The agent was reached and produced no words: said nothing, or said it failed. */
export type EmptyMiss = { kind: 'empty'; spent: boolean }
/** How the agent missed: an empty turn, or it never came. */
export type AgentMiss = EmptyMiss | { kind: 'unreachable' }

const spentBy = (tools: string[] | undefined): boolean =>
  (tools ?? []).some(name => SIDE_EFFECT_TOOL.test(name))

/** The agent returned, and its answer had no words in it. */
export function missOfEmptyAnswer(tools: string[] | undefined): EmptyMiss {
  return { kind: 'empty', spent: spentBy(tools) }
}

/**
 * The agent call threw. It still counts as EMPTY -- never as unreachable --
 * when the render ran the turn and reported the failure itself, or when the
 * turn already spent money: in both the agent WAS reached, with its tools and
 * the history, and a toolless model would answer over its head.
 */
export function missOfError(e: unknown): AgentMiss {
  const spent = spentBy(toolsUsedOf(e))
  if (reportedByAgent(e) || spent) return { kind: 'empty', spent }
  return { kind: 'unreachable' }
}

const CYRILLIC = /[\u0400-\u04FF]/
const LINK = /\b(?:https?:\/\/|www\.)\S+/gi

/**
 * WHICH LANGUAGE TO ANSWER IN.
 *
 * What the person just wrote wins when it is plainly Russian: a Cyrillic line
 * is an answer to the question no profile setting can settle. Otherwise --
 * a bare link, a brand name, an English sentence -- the language the bot
 * already keeps for them decides. Links are taken out first: a URL is Latin
 * whoever pastes it.
 */
export function replyInRussian(text: string, isRuFromState: boolean): boolean {
  if (CYRILLIC.test(String(text ?? '').replace(LINK, ' '))) return true
  return isRuFromState
}

/** The one line an empty answer gets, in the person's language. */
export function honestMissLine(isRu: boolean, spent: boolean): string {
  if (spent) {
    return isRu
      ? 'Ответ не дошёл, но работа уже могла начаться. Проверьте баланс или приложение, прежде чем повторять.'
      : "The answer didn't come through, but the work may already have started. Check your balance or the app before you repeat."
  }
  return isRu
    ? 'Не получилось ответить в этот раз. Повторите сообщение или нажмите кнопку ниже.'
    : "I couldn't answer this time. Please send your message again or tap a button below."
}

/**
 * The action ids the fallback model may put into `[[Label|act:id]]` markers.
 * Every one is registered in actionButtons.ts (a test holds that); an id
 * outside ACTIONS would be dropped by the parser and the offer would vanish.
 */
export const FALLBACK_BUTTON_IDS = ['topup', 'balance', 'can', 'human'] as const

/** A button's label as the person sees it, without its emoji. */
function buttonLabel(id: string, isRu: boolean): string {
  const a = ACTIONS.find(x => x.id === id)
  if (!a) throw new Error(`unknown action button: ${id}`)
  return (isRu ? a.ru : a.en).replace(/^\S+\s+/, '')
}

/**
 * THE SYSTEM PROMPT OF THE TOOLLESS FALLBACK, IN THE PERSON'S LANGUAGE.
 *
 * Written twice, as parallel lines, rather than once in English with "reply in
 * Russian" at the end: the fallback model is small (Llama 3 8B on Replicate
 * when that token is set), and a small model drifts to the language of its
 * prompt. The language is named first and again last.
 *
 * NO NUMBERS. The previous prompt listed four tariffs that never existed, and
 * its replacement said there were no subscriptions at all -- false since the
 * club became the one subscription. Both were hand-written facts that drifted
 * from the cashier. The club's price lives in the render's cashier and reaches
 * the person through the club card (/club); this prompt only points there.
 *
 * NO LIST OF SERVICES THAT ARE DOWN. It used to be prepended here from the
 * capability preflight, and on 2026-09-22 its one entry was the Instagram
 * breakdown (RAPIDAPI_INSTAGRAM_KEY is not set on the bot service -- checked
 * by name). The fallback model, Llama 3 8B, had no context and no history,
 * grabbed the one concrete service its prompt named and told a person who had
 * asked about something else: "I don't have Instagram analytics services
 * available". The list guarded against promising what cannot run; the
 * no-tools line below guards against promising ANYTHING, which is the truth
 * of this path.
 */
export function fallbackSystemPrompt(isRu: boolean): string {
  const ids = FALLBACK_BUTTON_IDS.join(', ')
  const topup = buttonLabel('topup', isRu)
  const balance = buttonLabel('balance', isRu)
  const lines = isRu
    ? [
        'Язык ответа: русский.',
        'Ты — ассистент Trinity S³AI в Telegram: помогаешь делать фото, видео, озвучку и рилсы.',
        'Сейчас ты отвечаешь без инструментов: не можешь ничего сгенерировать, узнать баланс, открыть ссылку или файл. Если просят действие — коротко скажи, что сейчас это не получится, и предложи повторить через минуту.',
        'Отвечай на последнее сообщение человека по существу и кратко (2-3 предложения). Не представляйся и не здоровайся, если с тобой не поздоровались.',
        'Не выдумывай услуги, функции, цены и тарифы, которых нет в этой подсказке. Не угадывай, что внутри ссылки или файла: если непонятно, чего хочет человек, спроси.',
        `Оплата: генерации тратят токены, токены покупают за звёзды Telegram (кнопка «${topup}»).`,
        'Подписка одна — клуб: цифровой двойник человека, который отвечает в личке и в группах его голосом и делает рилсы в его стиле. Цену и вступление показывает команда /club, сам цифр не называй.',
        `Точную цену операции и баланс не выдумывай: баланс — кнопка «${balance}», цена показывается перед запуском.`,
        `Если уместно, предложи кнопку в конце ответа маркером [[Подпись|act:id]], где id — одно из: ${ids}. Другие id не работают, не выдумывай их.`,
        'Отвечай только по-русски, даже если в сообщении есть английские слова или ссылки.',
      ]
    : [
        'Reply language: English.',
        'You are the Trinity S³AI assistant in Telegram: you help people make photos, videos, voice-overs and reels.',
        'Right now you answer without tools: you cannot generate anything, look up a balance, or open a link or a file. If the person asks for an action, say briefly that it cannot be done right now and suggest trying again in a minute.',
        "Answer the person's last message to the point and briefly (2-3 sentences). Do not introduce yourself or greet unless you were greeted.",
        'Never invent services, features, prices or plans that are not in this prompt. Do not guess what is behind a link or a file: if it is unclear what the person wants, ask.',
        `Payment: generations spend tokens, and tokens are bought with Telegram Stars (the "${topup}" button).`,
        'There is one subscription, the club: a digital twin of the person that answers in DMs and groups in their voice and makes reels in their style. The /club command shows its price and how to join; never name a number yourself.',
        `Do not invent the price of an operation or a balance: the balance is under the "${balance}" button, and a price is shown before anything starts.`,
        `If it fits, offer a button at the end of the answer with a marker [[Label|act:id]], where id is one of: ${ids}. Other ids do not work; do not invent them.`,
        'Reply only in English, even if the message contains words or links in another language.',
      ]
  return lines.join('\n')
}

/** How many past turns travel, and how long each may be. */
export const FALLBACK_HISTORY_TURNS = 6
export const FALLBACK_TURN_CHARS = 500

/**
 * The last few turns of this chat, when the failed agent call already read
 * them (agentTurnSpend.ts, HISTORY). Bounded twice -- by count and by length
 * -- because the fallback model is small and its window is not ours to fill.
 */
export function recentTurns(
  history: PastTurn[],
  limit = FALLBACK_HISTORY_TURNS,
  maxChars = FALLBACK_TURN_CHARS
): ChatMessage[] {
  return history
    .filter(
      t =>
        (t.role === 'user' || t.role === 'assistant') &&
        typeof t.content === 'string' &&
        t.content.trim() !== ''
    )
    .slice(-limit)
    .map(t => {
      const content = t.content.trim()
      return {
        role: t.role as 'user' | 'assistant',
        content:
          content.length > maxChars
            ? content.slice(0, maxChars) + '…'
            : content,
      }
    })
}

/** Everything the toolless model is given: the prompt, the context, the ask. */
export function fallbackMessages(opts: {
  isRu: boolean
  text: string
  /** The failed agent call's error, which may carry the history it read. */
  agentError?: unknown
}): ChatMessage[] {
  return [
    { role: 'system', content: fallbackSystemPrompt(opts.isRu) },
    ...recentTurns(historyOf(opts.agentError)),
    { role: 'user', content: opts.text },
  ]
}

// Built from strings: the Cyrillic gate allows Cyrillic in string literals
// only, and a regex literal is code.
const LIMIT = new RegExp('лимит|rate.?limit|429', 'i')
const BAD_KEY = new RegExp('ключ|api.?key|unauthorized|401', 'i')

/**
 * WHAT TO SAY WHEN EVEN THE FALLBACK MODEL FAILED.
 *
 * The cause in human words, but not a false one: "overloaded" and "a key is
 * invalid" are fixed differently, and the owner needs to know which. The
 * provider's own text never goes out -- it tells nothing to somebody who only
 * wants a reel.
 */
export function fallbackFailedText(isRu: boolean, error: string): string {
  const message = String(error ?? '')
  const why = LIMIT.test(message)
    ? isRu
      ? 'Модели сейчас перегружены — это временно.'
      : 'The models are overloaded right now — this is temporary.'
    : BAD_KEY.test(message)
      ? isRu
        ? 'У одного из провайдеров недействителен ключ, владелец уже знает.'
        : 'One of the providers has an invalid key; the owner already knows.'
      : isRu
        ? 'Что-то сломалось на нашей стороне.'
        : 'Something broke on our side.'
  return isRu
    ? `${why}\n\nПопробуйте через пару минут или откройте приложение — лента, файлы и профиль работают без модели.`
    : `${why}\n\nTry again in a couple of minutes or open the app — the feed, files and profile work without the model.`
}
