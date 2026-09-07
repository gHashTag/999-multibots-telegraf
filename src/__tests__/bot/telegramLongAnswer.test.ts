import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  разбитьДлинное,
  держатьПечатает,
  ПРЕДЕЛ_СООБЩЕНИЯ,
} from '@/helpers/telegramLongAnswer'

/**
 * ДВА ПРИЁМА TELEGRAM, БЕЗ КОТОРЫХ ДОЛГИЙ ОТВЕТ ВЫГЛЯДИТ ПОЛОМКОЙ.
 *
 * Владелец попросил «лучшие фишки телеграм» в UI/UX. Самое заметное здесь не
 * украшения, а две особенности платформы:
 *
 *  1. `sendChatAction('typing')` гаснет через ~5 секунд, а виток агента с
 *     инструментами длится до трёх минут. Бот посылал его ОДИН раз — человек
 *     видел работу пять секунд, потом тишину, неотличимую от зависшего бота.
 *  2. Telegram ОТКАЗЫВАЕТ в отправке текста длиннее 4096 символов. Не
 *     обрезает — отказывает. Развёрнутый ответ агента перешагивает предел, и
 *     человек не получал ни ответа, ни объяснения.
 */
describe('длинный ответ доходит целиком', () => {
  it('короткий не трогаем', () => {
    expect(разбитьДлинное('привет')).toEqual(['привет'])
  })

  it('пустой не превращается в пустое сообщение', () => {
    // Telegram отвергает пустой текст; отправлять «ничего» бессмысленно.
    expect(разбитьДлинное('   ')).toEqual([])
  })

  it('каждая часть влезает в предел Telegram', () => {
    const longText = Array.from(
      { length: 400 },
      (_, i) => `Абзац номер ${i}. ${'слово '.repeat(20)}`
    ).join('\n\n')
    const parts = разбитьДлинное(longText) // cyrillic-ok: existing helper
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(ПРЕДЕЛ_СООБЩЕНИЯ) // cyrillic-ok: existing constant
    }
  })

  it('ничего не теряется и порядок сохраняется', () => {
    /*
     * Разбиение, теряющее текст, хуже отказа: человек читает связный на вид
     * ответ, из которого молча вынули середину.
     */
    const абзацы = Array.from({ length: 300 }, (_, i) => `часть-${i}`)
    const части = разбитьДлинное(абзацы.join('\n\n'))
    const assembled = части.join('\n\n') // cyrillic-ok: existing parts
    for (const paragraph of абзацы) expect(assembled).toContain(paragraph) // cyrillic-ok: existing paragraphs
    expect(assembled.indexOf('часть-0')).toBeLessThan(
      assembled.indexOf('часть-299')
    )
  })

  it('строка длиннее предела режется, а не теряется', () => {
    // Один абзац без единого переноса — крайний случай, на котором наивное
    // деление по абзацам вернуло бы кусок длиннее предела.
    const монолит = 'я'.repeat(ПРЕДЕЛ_СООБЩЕНИЯ * 3)
    const parts = разбитьДлинное(монолит) // cyrillic-ok: existing helper
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(ПРЕДЕЛ_СООБЩЕНИЯ) // cyrillic-ok: existing constant
    }
    expect(parts.join('').length).toBe(монолит.length) // cyrillic-ok: existing text
  })
})

describe('«печатает…» держится, пока идёт работа', () => {
  afterEach(() => vi.useRealTimers())

  it('повторяется, а не гаснет через пять секунд', () => {
    vi.useFakeTimers()
    const ctx = { sendChatAction: vi.fn().mockResolvedValue(undefined) }
    const стоп = держатьПечатает(ctx as any, 4000)
    expect(ctx.sendChatAction).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(12_000)
    expect(ctx.sendChatAction).toHaveBeenCalledTimes(4)
    стоп()
    vi.advanceTimersByTime(12_000)
    expect(ctx.sendChatAction).toHaveBeenCalledTimes(4)
  })

  it('отказ индикатора не роняет ответ', () => {
    /*
     * Если бот не может показать «печатает…», это не повод не отвечать.
     * Брошенное исключение из фонового таймера обрушило бы обработчик.
     */
    vi.useFakeTimers()
    const ctx = {
      sendChatAction: vi.fn().mockRejectedValue(new Error('нет прав')),
    }
    const стоп = держатьПечатает(ctx as any, 1000)
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow()
    стоп()
  })
})

describe('обработчик бота этим пользуется', () => {
  const КОД = fs
    .readFileSync(
      path.join(__dirname, '..', '..', 'navigation', 'registerCommands.ts'),
      'utf8'
    )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('индикатор гасится в finally, а не только при успехе', () => {
    // Иначе после ошибки агента «печатает…» осталось бы висеть.
    expect(КОД).toContain('const стоп = keepTyping') // cyrillic-ok: existing names
    expect(КОД).toMatch(/finally \{\s*стоп\(\)/)
  })

  it('uses the shared delivery that splits long answers and adds task buttons', () => {
    expect(КОД).toMatch(/replyWithAgentTaskButtons\(\s*ctx,\s*ответ\.текст,/u) // cyrillic-ok: existing names
  })
})
