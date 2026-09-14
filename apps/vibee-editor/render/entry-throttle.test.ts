import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  пуститьПопытку,
  источникЗапроса,
  клиентЗапроса,
  пуститьВход,
  ПОТОЛОК_КАНАЛА,
  забытьОкна,
  числоОкон,
  ПОПЫТОК_В_ОКНЕ,
  ОКНО_МС,
  allowPerKey,
  perKeyWindowCount,
} from './src/entry-throttle'

/**
 * ДВЕРЬ, КОТОРУЮ МОЖНО БЫЛО ЗАКРЫТЬ ВСЕМ.
 *
 * Найдено 07.09.2026 при разборе входа в приложение.
 *
 * `POST /api/auth/pair/claim` не требует личности и не может: у входящего
 * ещё ничего нет. От перебора защищались начислением промахов — но запросом
 * БЕЗ фильтра по владельцу:
 *
 *     UPDATE app_pairing_codes SET attempts = attempts + 1
 *      WHERE consumed_at IS NULL AND expires_at > now()
 *
 * Каждый мимо-удар гасил живые коды ВСЕХ людей платформы. Тормоза по частоте
 * не было. Пять запросов в секунду с любого адреса — и вход по коду не
 * работает ни у кого, навсегда, ценой копеек.
 */
describe('перебор ограничен по источнику', () => {
  beforeEach(() => забытьОкна())

  it('в пределах окна пускает ровно столько, сколько объявлено', () => {
    for (let i = 0; i < ПОПЫТОК_В_ОКНЕ; i++) {
      expect(пуститьПопытку('1.2.3.4', 1000).можно, `попытка ${i + 1}`).toBe(
        true
      )
    }
    const лишняя = пуститьПопытку('1.2.3.4', 1000)
    expect(лишняя.можно).toBe(false)
  })

  it('говорит, сколько ждать, а не просто «нет»', () => {
    // Отказ без «когда» человек читает как поломку.
    for (let i = 0; i < ПОПЫТОК_В_ОКНЕ; i++) пуститьПопытку('1.2.3.4', 0)
    const r = пуститьПопытку('1.2.3.4', 30_000)
    expect(r.можно).toBe(false)
    if (!r.можно) {
      expect(r.ждатьСекунд).toBeGreaterThan(0)
      expect(r.ждатьСекунд).toBeLessThanOrEqual(ОКНО_МС / 1000)
    }
  })

  it('окно кончается — попытки возвращаются', () => {
    for (let i = 0; i < ПОПЫТОК_В_ОКНЕ; i++) пуститьПопытку('1.2.3.4', 0)
    expect(пуститьПопытку('1.2.3.4', ОКНО_МС).можно).toBe(true)
  })

  it('один источник не запирает другого', () => {
    /*
     * Иначе тормоз сам стал бы отказом в обслуживании — ровно тем, что он
     * чинит: один злоумышленник закрывал бы дверь всем.
     */
    for (let i = 0; i < ПОПЫТОК_В_ОКНЕ; i++) пуститьПопытку('1.2.3.4', 0)
    expect(пуститьПопытку('5.6.7.8', 0).можно).toBe(true)
  })

  it('память не растёт без предела', () => {
    // Счётчик, которым можно исчерпать память, — это второй способ уронить
    // сервис через защиту от первого.
    for (let i = 0; i < 12_000; i++) пуститьПопытку(`ист-${i}`, 0)
    expect(числоОкон()).toBeLessThanOrEqual(12_001)
    // После истечения окна чистка действительно освобождает.
    пуститьПопытку('ещё', ОКНО_МС * 2)
    expect(числоОкон()).toBeLessThan(12_001)
  })

  it('канал считается по соединению — этот ключ не подделать', () => {
    expect(источникЗапроса({ socket: { remoteAddress: '9.9.9.9' } })).toBe(
      '9.9.9.9'
    )
    expect(
      источникЗапроса({
        socket: { remoteAddress: '9.9.9.9' },
        headers: { 'x-forwarded-for': '1.1.1.1' },
      } as any)
    ).toBe('9.9.9.9')
  })

  it('клиент считается по левому X-Forwarded-For, иначе по соединению', () => {
    /*
     * Railway обрывает TLS у себя, поэтому remoteAddress — адрес прокси, ОДИН
     * НА ВСЕХ. Ключ клиента нужен, чтобы сосед за тем же прокси не запирал
     * дверь; он подделываем, и потому под ним только узкий лимит.
     */
    expect(
      клиентЗапроса({
        socket: { remoteAddress: '10.0.0.1' },
        headers: { 'x-forwarded-for': '1.1.1.1, 10.0.0.1' },
      } as any)
    ).toBe('1.1.1.1')
    // Без заголовка клиент НЕ различим — и это должно быть видно как пустота,
    // а не как подстановка адреса прокси.
    expect(
      клиентЗапроса({ socket: { remoteAddress: '10.0.0.1' } } as any)
    ).toBe('')
  })

  it('без X-Forwarded-For узкий лимит не применяется — только потолок', () => {
    /*
     * Ставит ли край Railway этот заголовок, изнутри не проверить. Откат «нет
     * заголовка — считаем по соединению» дал бы десять попыток в минуту на всю
     * платформу: авария, ради которой всё это и переписано, спрятанная в
     * запасной ветке. Неизвестность решается в пользу работающего входа.
     */
    забытьОкна()
    const без = { socket: { remoteAddress: '10.0.0.1' }, headers: {} } as any
    for (let i = 0; i < ПОПЫТОК_В_ОКНЕ + 5; i++) {
      expect(пуститьВход(без, 1000).можно, `попытка ${i + 1}`).toBe(true)
    }
  })
})

describe('за одним прокси люди не запирают дверь друг другу', () => {
  beforeEach(() => забытьОкна())

  const зр = (кто: string) =>
    ({
      socket: { remoteAddress: '10.0.0.1' },
      headers: { 'x-forwarded-for': кто },
    }) as any

  it('исчерпавший лимит сосед не мешает другому за тем же адресом', () => {
    /*
     * ЭТО ГЛАВНОЕ. Первая версия тормоза считала только по соединению — и на
     * Railway, где адрес общий, десять попыток в минуту закрывали вход всей
     * платформе. То есть чинившийся отказ в обслуживании возвращался бы через
     * саму защиту, только надёжнее: без всякого злоумышленника.
     */
    for (let i = 0; i < ПОПЫТОК_В_ОКНЕ; i++) {
      expect(пуститьВход(зр('1.1.1.1'), 1000).можно).toBe(true)
    }
    expect(пуститьВход(зр('1.1.1.1'), 1000).можно).toBe(false)
    expect(пуститьВход(зр('2.2.2.2'), 1000).можно).toBe(true)
  })

  it('потолок канала держит того, кто крутит заголовок', () => {
    // Ключ клиента подделывается сменой заголовка — значит один он не защита.
    let пущено = 0
    for (let i = 0; i < ПОТОЛОК_КАНАЛА + 50; i++) {
      if (пуститьВход(зр(`подделка-${i}`), 1000).можно) пущено++
    }
    expect(пущено).toBe(ПОТОЛОК_КАНАЛА)
  })

  it('потолок канала шире, чем лимит человека, — иначе он бы и был лимитом', () => {
    expect(ПОТОЛОК_КАНАЛА).toBeGreaterThan(ПОПЫТОК_В_ОКНЕ * 10)
  })

  it('отказ по лимиту клиента всё равно стоит места в потолке канала', () => {
    /*
     * Иначе потолок обходится тривиально: бей одним заголовком, получай отказы
     * бесплатно, и канал остаётся пустым для настоящего перебора.
     *
     * Обратное направление (отказ по каналу заряжает клиента) НЕ закреплено
     * намеренно: когда канал закрыт, закрыт он для всех, и счётчик клиента
     * ничего не меняет. Проверять свойство без последствий — это тест ради
     * теста.
     */
    for (let i = 0; i < ПОПЫТОК_В_ОКНЕ + 20; i++)
      пуститьВход(зр('1.1.1.1'), 1000)
    let пущено = 0
    for (let i = 0; i < ПОТОЛОК_КАНАЛА; i++) {
      if (пуститьВход(зр(`иной-${i}`), 1000).можно) пущено++
    }
    expect(пущено).toBeLessThan(ПОТОЛОК_КАНАЛА - ПОПЫТОК_В_ОКНЕ)
  })
})

describe('промах больше не гасит чужие коды', () => {
  const ХРАНИЛИЩЕ = fs.readFileSync(
    path.join(__dirname, 'session-store.ts'),
    'utf8'
  )
  const МАРШРУТЫ = fs.readFileSync(
    path.join(__dirname, 'session-routes.ts'),
    'utf8'
  )
  /** Без комментариев: рассказ о снятом начислении обязан остаться в коде. */
  const КОД = ХРАНИЛИЩЕ
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('нет начисления попыток всем живым кодам', () => {
    expect(КОД).not.toMatch(
      /attempts = attempts \+ 1\s*\n?\s*WHERE consumed_at IS NULL AND expires_at/
    )
  })

  it('нет гашения кодов по общему счётчику', () => {
    expect(КОД).not.toMatch(
      /SET consumed_at = now\(\)\s*\n?\s*WHERE consumed_at IS NULL AND attempts/
    )
  })

  it('тормоз стоит на маршруте и ДО разбора тела', () => {
    // Считать попытку после разбора значит принимать тела, которые всё равно
    // будут отвергнуты.
    const блок = МАРШРУТЫ.slice(
      МАРШРУТЫ.indexOf("path === '/api/auth/pair/claim'"),
      МАРШРУТЫ.indexOf("path === '/api/auth/pair/claim'") + 1200
    )
    expect(блок).toContain('пуститьВход(req)')
    expect(блок.indexOf('пуститьВход')).toBeLessThan(блок.indexOf('readBody'))
    expect(блок).toContain('429')
    expect(блок).toContain('Retry-After')
  })
})

/*
 * PER-PERSON COUNTS ARE NOT HOSTAGE TO THE SIGN-IN DOORS.
 *
 * allowPerKey (the game-token limit per telegram_id) used to share the doors'
 * map. The doors add a window per X-Forwarded-For value, which the client
 * chooses, and a full map refuses keys it does not hold: about 170 requests a
 * second with rotating values made every game-token mint answer 429.
 */
describe('per-person windows live apart from the sign-in doors', () => {
  beforeEach(() => забытьОкна()) // cyrillic-ok: test reset

  it('a flood of invented X-Forwarded-For values leaves a verified person unrefused', () => {
    for (let i = 0; i < 10_002; i++) {
      const xff = `10.${i >> 16}.${(i >> 8) & 255}.${i & 255}`
      const req = {
        socket: { remoteAddress: '10.0.0.1' },
        headers: { 'x-forwarded-for': xff },
      } as any
      пуститьВход(req, 1000) // cyrillic-ok: the sign-in door limiter
    }
    expect(числоОкон()).toBeGreaterThan(10_000) // cyrillic-ok: doors map is full
    expect(allowPerKey('game-token:555000111', 10, 2000)).toEqual({ ok: true })
  })

  it('stays bounded when full, still admits a new person, and still counts one', () => {
    for (let i = 0; i < 10_050; i++) {
      expect(allowPerKey(`game-token:${i}`, 10, 1000).ok, `key ${i}`).toBe(true)
    }
    expect(perKeyWindowCount()).toBeLessThanOrEqual(10_000)

    expect(allowPerKey('game-token:fresh', 10, 1500)).toEqual({ ok: true })
    for (let i = 0; i < 9; i++) allowPerKey('game-token:fresh', 10, 1500)
    const eleventh = allowPerKey('game-token:fresh', 10, 1500)
    expect(eleventh.ok).toBe(false)
    // A new window opens once the old one has run its 60 s.
    expect(allowPerKey('game-token:fresh', 10, 1500 + 60_000).ok).toBe(true)
  })
})
