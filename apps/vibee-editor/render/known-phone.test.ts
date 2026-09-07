import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  запомнитьНомер,
  узнатьНомер,
  забытьНомер,
  нормализоватьНомер,
  забытьТаблицу,
} from './src/agent/known-phone'

/**
 * НОМЕР, КОТОРЫМ ЧЕЛОВЕК ПОДЕЛИЛСЯ САМ.
 *
 * Владелец 07.09.2026: «заполни телефон из телеграм, чтобы руками не писать».
 *
 * Замер перед работой: телефона нет НИГДЕ — ни в базе рендера, ни в Supabase
 * (42 поля в `users`). Telegram не отдаёт номер ботам ни при каком входе; он
 * приходит РОВНО в одном случае — человек нажал «Поделиться номером».
 *
 * Значит «не писать руками» = один раз нажать, дальше подставляется.
 */

function пул() {
  const строки = new Map<string, { phone: string; источник: string }>()
  return {
    строки,
    async query(sql: string, params: unknown[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (s.startsWith('CREATE TABLE')) return { rows: [] }
      if (s.startsWith('INSERT INTO tg_known_phones')) {
        строки.set(String(params[0]), {
          phone: String(params[1]),
          источник: String(params[2]),
        })
        return { rows: [] }
      }
      if (s.startsWith('SELECT phone FROM tg_known_phones')) {
        /*
         * УСЛОВИЕ БЕРЁТСЯ ИЗ ЗАПРОСА, А НЕ ПОВТОРЯЕТСЯ ЗДЕСЬ.
         *
         * Первая версия делала `строки.get(params[0])` — то есть держала
         * СВОЮ копию `WHERE telegram_id = $1`. Мутация «убрать условие из
         * настоящего запроса» прошла насквозь: подделка продолжала честно
         * фильтровать за него. Ровно та подделка, которую этот проект уже
         * ловил на одноразовости кода спаривания.
         */
        const сверяетВладельца = s.includes('telegram_id = $1')
        const найдено = [...строки.entries()].filter(
          ([id]) => !сверяетВладельца || id === String(params[0])
        )
        return { rows: найдено.map(([, н]) => ({ phone: н.phone })) }
      }
      if (s.startsWith('DELETE FROM tg_known_phones')) {
        строки.delete(String(params[0]))
        return { rows: [] }
      }
      return { rows: [] }
    },
  }
}

describe('номер приводится к одному виду', () => {
  it('разные записи одного номера дают одно значение', () => {
    /*
     * Telegram отдаёт «79991234567», человек пишет «+7 (999) 123-45-67».
     * Разный вид одного номера у двух клиентов выглядел бы как два разных.
     */
    const ожидаем = '+79991234567'
    for (const вид of [
      '79991234567',
      '+7 999 123-45-67',
      '+7 (999) 123 45 67',
      '  +79991234567  ',
    ]) {
      expect(нормализоватьНомер(вид), вид).toBe(ожидаем)
    }
  })

  it('мусор не становится номером', () => {
    for (const плохо of ['', 'нет', '123', null, undefined, '1'.repeat(20)]) {
      expect(нормализоватьНомер(плохо)).toBeNull()
    }
  })
})

describe('хранение номера', () => {
  beforeEach(() => забытьТаблицу())

  it('сохранён — и читается', async () => {
    const p = пул()
    expect(
      await запомнитьНомер(p, {
        telegramId: '42',
        phone: '+7 999 123-45-67',
        источник: 'бот',
      })
    ).toBe('сохранён')
    expect(await узнатьНомер(p, '42')).toBe('+79991234567')
  })

  it('чужого номера не видно', async () => {
    // Подсказка чужого номера — это подсказка отправить код доступа не туда.
    const p = пул()
    await запомнитьНомер(p, {
      telegramId: '42',
      phone: '79991234567',
      источник: 'бот',
    })
    expect(await узнатьНомер(p, '43')).toBeNull()
  })

  it('мусор не сохраняется', async () => {
    const p = пул()
    expect(
      await запомнитьНомер(p, {
        telegramId: '42',
        phone: 'нет',
        источник: 'бот',
      })
    ).toBe('не похоже на номер')
    expect(await узнатьНомер(p, '42')).toBeNull()
  })

  it('ОТКЛЮЧЕНИЕ ЗАБЫВАЕТ НОМЕР', async () => {
    /*
     * Единственная причина хранить номер — «чтобы не вводить снова при
     * подключении». После отключения причины нет, и оставшийся номер стал бы
     * хранением, которого человек не заказывал и не может отменить.
     */
    const p = пул()
    await запомнитьНомер(p, {
      telegramId: '42',
      phone: '79991234567',
      источник: 'бот',
    })
    await забытьНомер(p, '42')
    expect(await узнатьНомер(p, '42')).toBeNull()
  })
})

describe('обещания на экранах не разошлись с делом', () => {
  const read = (
    ...ч: string[] // cyrillic-ok: pre-existing param name
  ) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...ч), 'utf8')

  /*
   * The mini app's promise moved into the dictionary on 2026-09-08.
   *
   * Project rule: interface text lives only in `player/src/atoms/language.ts`,
   * so the connect screen now renders `t('connect.can.phone')` and the sentence
   * itself is in the dictionary. A check still reading the .tsx would pass on
   * an empty screen -- it would be looking where the text no longer is.
   *
   * Both halves are read: the dictionary must SAY it, and the screen must
   * actually render that key. Either alone is a promise nobody makes.
   */
  const MINIAPP = read(
    'apps',
    'vibee-editor',
    'player',
    'src',
    'components',
    'Profile',
    'ConnectTelegram.tsx'
  )
  const DICT = read(
    'apps',
    'vibee-editor',
    'player',
    'src',
    'atoms',
    'language.ts'
  )
  const IOS = read('apps', 'vibee-ios', 'Vibee', 'ConnectTelegram.swift')

  it('ни один экран больше не обещает, что телефон НЕ хранится', () => {
    /*
     * Здесь стояло «Телефон, код и пароль не сохраняются». С подстановкой
     * номера это стало бы ложью. Экран, обещающий не хранить и хранящий,
     * хуже экрана без обещаний: второй просто молчит, первый вводит в
     * заблуждение.
     */
    /*
     * Whitespace is collapsed before matching. The promise lives in JSX and
     * prettier rewraps long lines as it sees fit: on 2026-09-07, after an edit
     * to neighbouring code, the sentence split across two lines and this check
     * failed -- while the text on screen had not changed by one letter.
     *
     * A check that fails on a line break teaches people to ignore it. This one
     * should fail only when the screen has genuinely stopped telling the truth.
     */
    const flat = (s: string) => s.replace(/\s+/g, ' ')
    // cyrillic-ok: pre-existing screen names below
    for (const [name, raw] of [
      ['словарь', DICT],
      ['iOS', IOS],
    ] as const) {
      // cyrillic-ok
      const screen = flat(raw)
      expect(
        screen,
        `${name} всё ещё обещает не хранить телефон`
      ).not.toContain('Телефон, код и пароль не сохраняются')
      expect(screen, `${name} не говорит, что номер хранится`).toContain(
        'Номер сохраняется'
      )
      expect(screen, `${name} не говорит про удаление`).toContain(
        'при отключении удаляется'
      )
    }
    // ...and the screen actually renders the key that carries it.
    expect(MINIAPP, 'мини-апп не показывает обещание про номер').toContain(
      "t('connect.can.phone')"
    )
  })

  it('оба клиента подставляют номер, но НЕ отправляют его сами', () => {
    // Подставить — да. Нажать за человека «Получить код» — нет: это начало
    // доступа к его переписке.
    expect(MINIAPP).toContain('setPhoneFromTelegram(true)')
    expect(IOS).toContain('номерИзTelegram = true')
    for (const screen of [MINIAPP, IOS]) {
      expect(screen).not.toMatch(/auto.?submit/i)
      expect(screen).not.toContain('автоматически отправ')
    }
  })

  it('оба говорят, ОТКУДА взялся номер', () => {
    // The mini app says it through the dictionary; iOS still carries its own
    // string. Both are checked where the sentence actually lives.
    expect(MINIAPP).toContain("t('connect.phone.fromTelegram')")
    expect(DICT).toContain('Номер из Telegram')
    expect(IOS).toContain('Номер из Telegram')
  })
})
