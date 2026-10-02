/**
 * WHAT THE AGENT CHAT SAYS ABOUT ITSELF, IN THE READER'S LANGUAGE.
 *
 * `agentStream.ts` is where a turn fails, and every sentence it wrote about a
 * failure was Russian whatever the interface language was: an English reader
 * whose turn ran out of steps, or whose request the server refused, was told
 * so in a language they could not read -- or shown the raw JSON body.
 *
 * SERVER CODES. `/api/agent/chat` words its refusals for a developer (some in
 * Russian, the thread gate in English) and, since 2026-10-02, also names them
 * with a `code`: on the HTTP refusal, on an `ошибка` event and on a `готово`  // cyrillic-ok: the event names
 * that hit the step limit. The rule is the one `topUpText.ts` uses:
 *
 *   - a Russian reader keeps the server's own words when they are Russian --
 *     they are the most precise, and the provider list in "no answer" is
 *     what the owner debugs with;
 *   - otherwise the sentence for the code, in the reader's language;
 *   - an unknown code (an older or newer server) gives the server's words
 *     when they are readable, and a plain "could not answer" when not.
 *
 * The codes are checked against the server by `agent-chat-codes.test.ts` in
 * render, so a new one fails there until this file can say it.
 */
import type { Language } from '@/atoms/language'

export type AgentChatEvent =
  | { kind: 'refused'; status: number; code?: unknown; error?: unknown }
  | { kind: 'failed'; code?: unknown; text?: unknown }
  | { kind: 'stepLimit'; code?: unknown; steps?: unknown; text?: unknown }
  | { kind: 'silent' }
  | { kind: 'retrying' }
  | { kind: 'stopped' }
  | { kind: 'unreachable'; detail: string }

type Pair = { en: string; ru: string }

/** One sentence per server `code`, in both languages. */
export const AGENT_CHAT_CODES: Record<string, Pair> = {
  sign_in: {
    en: 'Sign in with Telegram for the agent to answer — chatting is free.',
    ru: 'Чтобы агент ответил, войдите через Telegram — переписка бесплатна.', // cyrillic-ok: the russian branch
  },
  forbidden: {
    en: 'This key cannot talk to the agent.',
    ru: 'С этим ключом нельзя говорить с агентом.', // cyrillic-ok: the russian branch
  },
  bad_request: {
    en: 'The server did not understand the request — reload the page and try again.',
    ru: 'Сервер не понял запрос — обновите страницу и повторите.', // cyrillic-ok: the russian branch
  },
  agent_unavailable: {
    en: 'This agent is not available right now.',
    ru: 'Этот агент сейчас недоступен.', // cyrillic-ok: the russian branch
  },
  not_seller: {
    en: 'Only a seller can talk to the agent about a client.',
    ru: 'Говорить с агентом о клиенте может только продавец.', // cyrillic-ok: the russian branch
  },
  no_answer: {
    en: 'None of the models answered. Try again in a minute.',
    ru: 'Ни одна модель не ответила. Повторите через минуту.', // cyrillic-ok: the russian branch
  },
  model_failed: {
    en: 'The model failed to answer. Try again in a minute.',
    ru: 'Модель не смогла ответить. Повторите через минуту.', // cyrillic-ok: the russian branch
  },
  internal: {
    en: 'Something broke on the server. Try again in a minute.',
    ru: 'На сервере что-то сломалось. Повторите через минуту.', // cyrillic-ok: the russian branch
  },
  step_limit: {
    en: 'Ran out of steps — try a smaller task.',
    ru: 'Не уложился в шаги — попробуй задачу поменьше.', // cyrillic-ok: the russian branch
  },
}

const CYRILLIC = /\p{Script=Cyrillic}/u

function byCode(
  code: unknown,
  words: unknown,
  lang: Language,
  fallback: Pair
): string {
  const text = words == null ? '' : String(words).trim()
  if (lang === 'ru' && CYRILLIC.test(text)) return text
  const known = typeof code === 'string' ? AGENT_CHAT_CODES[code] : undefined
  if (known) return lang === 'ru' ? known.ru : known.en
  if (text && (lang === 'ru' || !CYRILLIC.test(text))) return text
  return lang === 'ru' ? fallback.ru : fallback.en
}

export function agentChatText(e: AgentChatEvent, lang: Language): string {
  const ru = lang === 'ru'
  switch (e.kind) {
    case 'refused':
      return byCode(e.code, e.error, lang, {
        en: `The agent could not answer (the server said ${e.status}).`,
        ru: `Агент не ответил (сервер ответил ${e.status}).`, // cyrillic-ok: the russian branch
      })
    case 'failed':
      return byCode(e.code, e.text, lang, {
        en: 'The agent could not answer. Try again in a minute.',
        ru: 'Агент не смог ответить. Повторите через минуту.', // cyrillic-ok: the russian branch
      })
    case 'stepLimit': {
      // The server's own words name the limit; the code alone does not.
      const text = e.text == null ? '' : String(e.text).trim()
      if (ru && text)
        return `Не уложился в шаги: ${text}. Попробуй задачу поменьше.` // cyrillic-ok: the russian branch
      const steps = Number(e.steps)
      if (!ru && Number.isFinite(steps) && steps > 0)
        return `Stopped after ${steps} tool steps — try a smaller task.`
      return byCode(
        e.code ?? 'step_limit',
        ru ? '' : text,
        lang,
        AGENT_CHAT_CODES.step_limit
      )
    }
    case 'silent':
      return ru
        ? 'Агент не сформулировал ответ. Повтори вопрос или уточни его.' // cyrillic-ok: the russian branch
        : 'The agent did not put an answer together. Ask again, or say it differently.'
    case 'retrying':
      return ru
        ? 'Соединение прервалось (сеть или обновление сервера), повторяю…' // cyrillic-ok: the russian branch
        : 'The connection dropped (the network or a server update) — retrying…'
    case 'stopped':
      return ru ? '⏹ Остановлено.' : '⏹ Stopped.' // cyrillic-ok: the russian branch
    case 'unreachable':
      // The button is `chat.retry` ("Повторить" / "Retry"); the old text  // cyrillic-ok: quotes the label
      // sent people to a "Повтори" that is not on the screen.  // cyrillic-ok: quotes the old text
      return ru
        ? `Не удалось связаться с сервером: ${e.detail}. Нажмите «Повторить» через минуту.` // cyrillic-ok: the russian branch
        : `Could not reach the server: ${e.detail}. Press "Retry" in a minute.`
  }
}
