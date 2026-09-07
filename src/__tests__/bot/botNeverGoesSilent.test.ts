import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

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
const ИСХОДНИК = fs.readFileSync(
  path.join(__dirname, '..', '..', 'navigation', 'registerCommands.ts'),
  'utf8'
)
/** Код без комментариев: закрепляем поведение, а не рассказ о нём. */
const КОД = ИСХОДНИК // cyrillic-ok: pre-existing identifier, line reflowed by the formatter
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

describe('отказ модели доходит до человека', () => {
  it('в ветке отказа есть ответ, а не только запись в журнал', () => {
    const хвост = КОД.slice(
      // cyrillic-ok: pre-existing identifier, line reflowed by the formatter
      КОД.indexOf("logger.error('🤖 [AI Fallback] Error'") // cyrillic-ok: pre-existing identifier, line reflowed by the formatter
    )
    expect(хвост.slice(0, 1500)).toContain('ctx\n          .reply(')
  })

  it('причина различает перегрузку и недействительный ключ', () => {
    /*
     * Они чинятся по-разному: одно проходит само, второе требует
     * перевыпуска ключа. Общее «что-то пошло не так» стоило бы владельцу
     * вечера на поиски несуществующей поломки.
     */
    expect(КОД).toMatch(/rate\.\?limit\|429/)
    expect(КОД).toMatch(/unauthorized\|401/)
    expect(КОД).toContain('перегружены')
    expect(КОД).toContain('недействителен ключ')
  })

  it('человеку предлагают, что делать сейчас', () => {
    // Сообщение об отказе без следующего шага — это жалоба, а не помощь.
    //
    // The step used to be the sentence "open the app with the APP button". It
    // is now a BUTTON, which is stronger: a button can be pressed, where a
    // sentence can be read and not found. So the keyboard on the refusal is
    // what is checked, not a phrase anyone may reword.
    expect(КОД).toContain('откройте приложение') // cyrillic-ok: the message under test is Russian
    const хвост = КОД.slice(КОД.indexOf('откройте приложение')) // cyrillic-ok: pre-existing identifier
    expect(
      хвост.slice(0, 400), // cyrillic-ok: pre-existing identifier
      'a refusal must carry a keyboard: something to press, not something to look for'
    ).toContain('standardButtons(')
  })

  it('падение самой отправки не роняет обработчик', () => {
    const хвост = КОД.slice(КОД.indexOf('откройте приложение')) // cyrillic-ok: pre-existing identifier
    expect(хвост.slice(0, 400)).toContain('.catch(') // cyrillic-ok: pre-existing identifier
  })
})
