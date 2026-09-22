import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fallbackFailedText } from '@/navigation/helpers/agentFallback'

/**
 * БОТ НЕ ИМЕЕТ ПРАВА МОЛЧАТЬ.
 *
 * Проверено от лица владельца 06.09.2026. Он написал боту «Сколько у меня
 * контактов в телеграм?» — и не получил НИЧЕГО.
 *
 * Сообщение при этом доехало: оно лежит в общем разговоре с пометкой
 * `surface: bot`. Молчал не приём, а ответ — ни один провайдер модели не
 * отозвался:
 *
 *     zai: превышен лимит запросов
 *     zai-lite: превышен лимит запросов
 *     openai: ключ недействителен
 *
 * Обработчик в этом случаелишь писал в журнал и выходил. Человек не знает,
 * дошло ли его сообщение, сломан ли бот или его игнорируют — и это худший
 * из возможных ответов, потому что он неотличим от неисправности приёма.
 */
const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'navigation', 'registerCommands.ts'),
  'utf8'
)
/** Код без комментариев: закрепляем поведение, а не рассказ о нём. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(
  /^\s*\/\/.*$/gm,
  ''
)

describe('отказ модели доходит до человека', () => {
  it('в ветке отказа есть ответ, а не только запись в журнал', () => {
    const tail = CODE.slice(
      CODE.indexOf("logger.error('🤖 [AI Fallback] Error'")
    )
    expect(tail.slice(0, 1500)).toContain('ctx\n          .reply(')
  })

  it('причина различает перегрузку и недействительный ключ', () => {
    /*
     * Они чинятся по-разному: одно проходит само, второе требует
     * перевыпуска ключа. Общее «что-то пошло не так» стоило бы владельцу
     * вечера на поиски несуществующей поломки.
     */
    /*
     * THE WORDS MOVED, THE BRANCH STILL SAYS THEM. Since 2026-09-22 the
     * apology is built by fallbackFailedText (agentFallback.ts), in the
     * person's language, so the branch must call it -- and what it returns is
     * checked by behaviour, not by where the regex is spelled.
     */
    expect(REFUSAL_BRANCH).toContain('fallbackFailedText(')
    for (const isRu of [true, false]) {
      const limit = fallbackFailedText(isRu, 'zai: rate limit exceeded (429)')
      const badKey = fallbackFailedText(isRu, 'openai: 401 Unauthorized')
      const other = fallbackFailedText(isRu, 'socket hang up')
      expect(new Set([limit, badKey, other]).size, String(isRu)).toBe(3)
    }
    expect(fallbackFailedText(true, 'HTTP 429')).toContain('перегружены')
    expect(fallbackFailedText(true, 'HTTP 401')).toContain(
      'недействителен ключ'
    )
  })

  /**
   * THE REFUSAL BRANCH, AND ONLY IT.
   *
   * Bounded at both ends rather than sliced to the end of the file. The first
   * attempt cut from the anchor onwards: mutations that removed the buttons
   * and the send protection FROM THE BRANCH both survived, because the same
   * constructs appear further down and fell inside the window. A slice with no
   * upper bound checks the file, not the place.
   *
   * BEHAVIOUR IS PINNED, NOT WORDING. This used to assert the exact string
   * 'откройте приложение кнопкой APP'. It held until the day the hint was
   * rewritten and moved into a BUTTON, meaning preserved -- and the test went
   * red against correct code and stayed red in main, because it pinned
   * spelling.
   */
  const REFUSAL_BRANCH = (() => {
    const from = CODE.indexOf("logger.error('🤖 [AI Fallback] Error'")
    expect(
      from,
      'refusal branch not found -- the anchor is stale'
    ).toBeGreaterThan(-1)
    const to = CODE.indexOf('logger.info(', from)
    expect(to, 'end of the refusal branch not found').toBeGreaterThan(from)
    return CODE.slice(from, to)
  })()

  it('человеку предлагают, что делать сейчас', () => {
    // The next step in words -- "open the app" -- however it gets phrased,
    // in whichever language the person gets it (the branch says it through
    // fallbackFailedText, see above).
    expect(REFUSAL_BRANCH).toContain('fallbackFailedText(')
    expect(fallbackFailedText(true, '').toLowerCase()).toContain(
      'откройте приложение'
    )
    expect(fallbackFailedText(false, '').toLowerCase()).toContain(
      'open the app'
    )
    // And something to press: a hint without a button on a phone is text
    // somebody has to retype somewhere.
    expect(REFUSAL_BRANCH).toContain('standardButtons(')
  })

  it('падение самой отправки не роняет обработчик', () => {
    expect(REFUSAL_BRANCH).toContain('ctx')
    expect(REFUSAL_BRANCH).toContain('.catch(')
  })
})
