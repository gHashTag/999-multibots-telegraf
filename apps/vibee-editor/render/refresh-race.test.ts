import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * ГОНКА ДВУХ ВКЛАДОК НЕ ДОЛЖНА ВЫГЛЯДЕТЬ КАК КРАЖА.
 *
 * Найдено при разборе входа 07.09.2026.
 *
 * `refreshInFlight` в клиенте — переменная модуля, то есть одна НА ВКЛАДКУ.
 * Refresh-токен лежит в `localStorage`, общем для всех вкладок одного
 * браузера, и таймер обновления заводится от общего срока. Две открытые
 * вкладки приходят обновляться с разницей в миллисекунды — это не крайний
 * случай, а то, что происходит у каждого, кто открыл приложение дважды.
 *
 * Сервер читал второй приход как кражу и гасил ВСЮ СЕМЬЮ: человека
 * выбрасывало из приложения, а вернуться он мог только через восьмизначный код
 * из Telegram. Без единого злоумышленника, ежедневно.
 *
 * Здесь закреплены три вещи, которые легко потерять при следующей правке:
 * отдельный код ответа, отдельный статус и то, что клиент на него ПЕРЕЧИТЫВАЕТ
 * хранилище, а не стирает его.
 */

const читать = (...части: string[]) =>
  fs
    .readFileSync(path.join(__dirname, ...части), 'utf8')
    // Комментарии снимаем: рассказ о защите — не защита. Этот файл уже пять
    // раз ловил собственные комментарии вместо кода.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

const МАРШРУТЫ = читать('session-routes.ts')

/**
 * Только ветка гонки — от её условия до ближайшего `return true`.
 *
 * Первая версия брала «четыреста символов после метки» и захватывала соседний
 * блок с его 401: тест падал на чужом коде и, что хуже, мог бы ЗЕЛЕНЕТЬ на
 * чужом. Границу задаёт конец ветки, а не число.
 */
const ВЕТКА_ГОНКИ = (() => {
  const от = МАРШРУТЫ.indexOf("outcome.reason === 'raced'")
  if (от < 0) return ''
  const до = МАРШРУТЫ.indexOf('return true', от)
  return МАРШРУТЫ.slice(от, до < 0 ? от : до)
})()
const КЛИЕНТ = читать('..', 'player', 'src', 'lib', 'appSession.ts')

describe('сервер отличает гонку от кражи', () => {
  it('у гонки свой код ответа, не общий отказ', () => {
    expect(МАРШРУТЫ).toContain("outcome.reason === 'raced'")
    expect(МАРШРУТЫ).toContain('auth_refresh_raced')
  })

  it('гонка отвечает 409, а не 401', () => {
    // 401 клиент обязан считать окончательным и вычистить сессию — то есть
    // выгнать человека. Конфликт одновременных запросов — это 409.
    const блок = ВЕТКА_ГОНКИ
    expect(блок).toContain('409')
    expect(блок).not.toContain('401')
  })

  it('ответ на гонку не отзывает сессии', () => {
    const блок = ВЕТКА_ГОНКИ
    expect(блок).not.toMatch(/revoke/i)
  })
})

describe('клиент на гонку перечитывает хранилище', () => {
  it('409 разбирается отдельно от общей ветки отказа', () => {
    expect(КЛИЕНТ).toContain('response.status === 409')
    expect(КЛИЕНТ).toContain("body.error === 'auth_refresh_raced'")
  })

  it('ветка гонки стоит ДО общей ветки, которая чистит сессию', () => {
    /*
     * Порядок решает всё: общая ветка вызывает `clearAppSession()` и бросает.
     * Стоя первой, она выгонит человека раньше, чем дело дойдёт до разбора
     * гонки, и вся правка станет мёртвой.
     */
    expect(КЛИЕНТ.indexOf('auth_refresh_raced')).toBeLessThan(
      КЛИЕНТ.indexOf('clearAppSession()\n      throw new Error')
    )
  })

  /*
   * The three checks that stood here scanned the first 900 characters after
   * the 409 test. The branch grew (review, 2026-09-22), and one of them --
   * "the race branch never erases the session" -- went on passing only because
   * the tab's own end had moved past character 900. What the branch promises
   * now is narrower and exact, so these read the whole branch: from the 409
   * test to the success block after it. Behaviour is pinned in the player:
   * lib/__tests__/aSignInOutlivesTheTab.test.ts and aCookieSessionAcrossTabs.
   */
  const CLIENT = КЛИЕНТ // cyrillic-ok: this file's name for the client source
  const RACE = (() => {
    const from = CLIENT.indexOf('response.status === 409')
    const to = CLIENT.indexOf(
      "if (response.ok && typeof body.access_token === 'string')",
      from
    )
    return from < 0 || to < 0 ? '' : CLIENT.slice(from, to)
  })()

  it('the whole race branch is found', () => {
    expect(RACE.length).toBeGreaterThan(200)
    expect(RACE).toContain("body.error === 'auth_refresh_raced'")
  })

  it('what a winner wrote to this tab is written back, or the timer is never re-armed', () => {
    const reread = RACE.indexOf('const fresh = storage()?.getItem(REFRESH_KEY)')
    expect(reread).toBeGreaterThan(-1)
    const tail = RACE.slice(reread)
    expect(tail.indexOf('storeAppSession(')).toBeGreaterThan(-1)
    expect(tail.indexOf('storeAppSession(')).toBeLessThan(
      tail.indexOf('clearAppSession()')
    )
  })

  it('every retry is bounded: a literal list of at most three, and no while', () => {
    // A loop on 409 would turn a race of tabs into a stream of requests
    // against the sign-in brake. The cookie path tries a few times inside the
    // grace window (several tabs present one jar token at once); the count is
    // written out, so it cannot grow unnoticed.
    expect(RACE).not.toMatch(/\bwhile\s*\(/)
    const loops = [...RACE.matchAll(/\bfor\s*\(const \w+ of \[([^\]]*)\]\)/g)]
    const anyFor = [...RACE.matchAll(/\bfor\s*\(/g)]
    expect(anyFor.length).toBe(loops.length)
    for (const loop of loops) {
      expect(
        loop[1].split(',').filter(x => x.trim()).length
      ).toBeLessThanOrEqual(3)
    }
  })

  it('the race branch ends at most this tab, never the family', () => {
    // Only this tab's own spent copy ends here (a duplicated tab loses alone);
    // nothing in the branch signs the family out on the server.
    expect(RACE).not.toMatch(/revoke|logout/i)
    const clears = [...RACE.matchAll(/clearAppSession\(\)/g)]
    expect(clears.length).toBe(1)
    // The one clear is this tab's own, right before it says why.
    const clear = RACE.indexOf('clearAppSession()')
    expect(RACE.slice(clear, clear + 120)).toContain('rotated in another tab')
  })
})

describe('выход гасит семью, а не одну сессию', () => {
  /*
   * Веток было две, и обычный случай шёл по слабой: живой access-токен давал
   * `sid`, и гасилась ОДНА сессия; сильная ветка (вся семья) включалась только
   * у того, чей токен успел протухнуть.
   *
   * Сегодня разницы нет — вход заводит одну сессию с одной семьёй, ротация
   * сохраняет обе, — поэтому упасть тут было нечему. Ровно это и опасно:
   * первая правка, заводящая вторую сессию в семье, молча оставит после
   * «Выйти» живой шестидесятидневный токен.
   */
  const ВЫХОД = (() => {
    const от = МАРШРУТЫ.indexOf("path === '/api/auth/logout'")
    return от < 0 ? '' : МАРШРУТЫ.slice(от, от + 2600)
  })()

  it('семья определяется даже когда пришли с живым access-токеном', () => {
    expect(ВЫХОД).toContain('SELECT family_id FROM app_sessions')
  })

  it('поиск семьи стоит ДО выбора ветки гашения', () => {
    // Иначе он ничего не меняет: ветка уже выбрана.
    expect(ВЫХОД.indexOf('SELECT family_id FROM app_sessions')).toBeLessThan(
      ВЫХОД.indexOf('UPDATE app_sessions SET revoked_at')
    )
  })

  it('гашение по семье остаётся, и оно широкое', () => {
    expect(ВЫХОД).toContain('WHERE family_id = $1 AND revoked_at IS NULL')
  })
})

describe('iOS не выкидывает человека за гонку', () => {
  /*
   * В Swift защиты от одновременных обновлений нет ВОВСЕ: два запроса,
   * получивших 401, зовут `refreshSession()` каждый. На вебе для этого нужны
   * две вкладки, здесь хватает двух экранов. Любой отказ вёл к `forget()` —
   * человек оказывался выкинут, ничего не сделав.
   */
  const IOS = читать('..', '..', 'vibee-ios', 'Vibee', 'Identity.swift')
  const ОБНОВЛЕНИЕ = (() => {
    const от = IOS.indexOf('static func refreshSession')
    const до = IOS.indexOf('static func forget', от)
    return от < 0 ? '' : IOS.slice(от, до < 0 ? IOS.length : до)
  })()

  it('ветка обновления вообще найдена', () => {
    // Иначе три проверки ниже зеленеют на пустой строке.
    expect(ОБНОВЛЕНИЕ.length).toBeGreaterThan(200)
  })

  it('409 разбирается по тому же коду, что шлёт сервер', () => {
    expect(ОБНОВЛЕНИЕ).toContain('409')
    expect(ОБНОВЛЕНИЕ).toContain('auth_refresh_raced')
  })

  it('в ветке гонки Keychain перечитывается, а не стирается', () => {
    /*
     * Границу берём по концу ветки, а не «плюс триста символов»: окно
     * фиксированной длины перелезает в соседний `guard` с его `forget()` —
     * тест падает на чужом коде и точно так же может ЗАЗЕЛЕНЕТЬ на чужом.
     * Та же ошибка, что часом раньше была сделана в серверной половине этого
     * файла; повторил её здесь дословно.
     */
    const от = ОБНОВЛЕНИЕ.indexOf('auth_refresh_raced')
    const до = ОБНОВЛЕНИЕ.indexOf('guard код == 200', от)
    const блок = ОБНОВЛЕНИЕ.slice(от, до < 0 ? от : до)
    expect(блок.length).toBeGreaterThan(40)
    expect(блок).toContain('refreshToken')
    expect(блок).not.toContain('forget()')
  })

  it('разбор гонки стоит ДО guard, который стирает сессию', () => {
    expect(ОБНОВЛЕНИЕ.indexOf('auth_refresh_raced')).toBeLessThan(
      ОБНОВЛЕНИЕ.indexOf('forget()')
    )
  })
})
