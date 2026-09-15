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
    const длинный = Array.from(
      { length: 400 },
      (_, i) => `Абзац номер ${i}. ${'слово '.repeat(20)}`
    ).join('\n\n')
    const части = разбитьДлинное(длинный)
    expect(части.length).toBeGreaterThan(1)
    for (const ч of части)
      expect(ч.length).toBeLessThanOrEqual(ПРЕДЕЛ_СООБЩЕНИЯ)
  })

  it('ничего не теряется и порядок сохраняется', () => {
    /*
     * Разбиение, теряющее текст, хуже отказа: человек читает связный на вид
     * ответ, из которого молча вынули середину.
     */
    const абзацы = Array.from({ length: 300 }, (_, i) => `часть-${i}`)
    const части = разбитьДлинное(абзацы.join('\n\n'))
    const собрано = части.join('\n\n')
    for (const а of абзацы) expect(собрано).toContain(а)
    expect(собрано.indexOf('часть-0')).toBeLessThan(
      собрано.indexOf('часть-299')
    )
  })

  it('строка длиннее предела режется, а не теряется', () => {
    // Один абзац без единого переноса — крайний случай, на котором наивное
    // деление по абзацам вернуло бы кусок длиннее предела.
    const монолит = 'я'.repeat(ПРЕДЕЛ_СООБЩЕНИЯ * 3)
    const части = разбитьДлинное(монолит)
    for (const ч of части)
      expect(ч.length).toBeLessThanOrEqual(ПРЕДЕЛ_СООБЩЕНИЯ)
    expect(части.join('').length).toBe(монолит.length)
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
  const CODE = fs
    .readFileSync(
      path.join(__dirname, '..', '..', 'navigation', 'registerCommands.ts'),
      'utf8'
    )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('показанное во время витка гасится в finally, а не только при успехе', () => {
    /*
     * THE PROPERTY IS PINNED, NOT THE NAME OF THE HELPER.
     *
     * This asserted the literal `const стоп = держатьПечатает`. Since
     * 2026-09-15 the owner is shown the answer being written rather than an
     * indicator (keepDraft, sendMessageDraft), and the old line went red
     * against code doing the same thing better. That line was never the
     * point: the point is that the person sees SOMETHING during the turn and
     * that it is stopped in `finally` -- otherwise it would hang there after
     * an error from the agent.
     */
    expect(CODE).toContain('keepDraft(')
    expect(CODE).toContain('const стоп = draft.stop')
    expect(CODE.replace(/\s+/g, ' ')).toContain('finally { стоп()')
  })

  it('поток ответа доходит до того, кто его показывает', () => {
    // Without this line the draft exists and stays empty forever.
    expect(CODE.replace(/\s+/g, ' ')).toContain('onProgress: draft.show')
  })

  /*
   * THE SPLITTING IS PINNED, NOT THE SHAPE OF THE LOOP.
   *
   * This asserted the exact line `for (const часть of разбитьДлинное(...))`.
   * The loop was rewritten to an indexed one -- so that the LAST part carries
   * the buttons and the others do not -- and the test went red against code
   * doing the same thing slightly better. The loop form was never the thing
   * worth guarding.
   */
  it('ответ отправляется частями', () => {
    // A long answer is cut up...
    expect(CODE).toContain('разбитьДлинное(')
    // ...and every part reaches the person, not just the first.
    const window = CODE.slice(
      CODE.indexOf('разбитьДлинное('),
      CODE.indexOf('разбитьДлинное(') + 400
    )
    expect(window).toMatch(/for \(|\.forEach\(|for await/)
    expect(window).toContain('ctx.reply(')
  })
})
