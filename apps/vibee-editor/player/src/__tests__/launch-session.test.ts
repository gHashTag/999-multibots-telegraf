import { beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * МИНИ-АПП НАКОНЕЦ БЕРЁТ СЕССИЮ — И НЕ ЛОМАЕТСЯ, ЕСЛИ НЕ ВЗЯЛ.
 *
 * Найдено 07.09.2026: `/api/auth/telegram` не звал НИКТО. Маршрут написан,
 * покрыт тестами, задеплоен — и не имел ни одного посетителя. Весь мини-апп
 * работал по заголовку `X-Telegram-Init-Data` на каждом запросе, а вся работа
 * вокруг сессий (обновление, гонка вкладок, отзыв семьи, «один запуск — одна
 * семья») касалась только веба.
 *
 * ЧЕГО ЭТА ПРАВКА НЕ ДЕЛАЕТ. Она НЕ делает личность внутри Telegram
 * отзываемой: `initData` живёт сутки, и пока жива — по ней выпускается новая
 * сессия. Настоящий отзыв возможен только вместе с коротким окном приёма
 * `initData`, и делать это надо ПОСЛЕ того, как станет видно, что сессии
 * выпускаются. Обещать здесь больше — значит соврать в комментарии.
 *
 * ГЛАВНОЕ СВОЙСТВО — БЕЗВРЕДНОСТЬ. Не вышло обменять? Работаем как вчера.
 */

const хранилище = new Map<string, string>()

vi.mock('@/config', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/config')),
  API_BASE: 'https://api.example.test',
}))

vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => хранилище.get(k) ?? null,
  setItem: (k: string, v: string) => void хранилище.set(k, v),
  removeItem: (k: string) => void хранилище.delete(k),
  clear: () => хранилище.clear(),
})

import { exchangeTelegramLaunch, getAppAccessToken } from '../lib/appSession'

describe('обмен подписи запуска на сессию', () => {
  /*
   * `vi.unstubAllGlobals()` здесь НЕ зовётся намеренно: он снимает и подделку
   * `sessionStorage`, после чего модуль начинает писать в хранилище jsdom, а
   * проверки читают Map — и два теста падали на значении, оставшемся от
   * предыдущего. Подделка хранилища живёт весь файл, чистится содержимое.
   */
  beforeEach(() => {
    хранилище.clear()
    window.sessionStorage?.clear?.()
  })

  it('пустая подпись — запроса нет вовсе', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await exchangeTelegramLaunch('')).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('успех — сессия сохранена и её видно', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            access_token: 'a',
            refresh_token: 'r',
            expires_in: 600,
          }),
          { status: 200 }
        )
      )
    )
    const с = await exchangeTelegramLaunch('user=1&hash=x')
    expect(с?.access_token).toBe('a')
    expect(getAppAccessToken()).toBe('a')
  })

  it('ОТКАЗ СЕРВЕРА НЕ ЛОМАЕТ НИЧЕГО: null, без броска и без записи', async () => {
    /*
     * Это главное свойство правки. Подпись может не сойтись (устаревший токен
     * бота, чужой бот, подделка), и тогда всё обязано работать ровно как
     * вчера — по заголовку подписи.
     */
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'нет' }), { status: 401 }))
    )
    await expect(exchangeTelegramLaunch('user=1&hash=x')).resolves.toBeNull()
    expect(getAppAccessToken()).toBe('')
  })

  it('обрыв сети — тоже null, а не исключение', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('сеть') }))
    await expect(exchangeTelegramLaunch('user=1&hash=x')).resolves.toBeNull()
  })

  it('ответ без срока не принимается за сессию', async () => {
    // Частичный ответ хуже отказа: сохранив его, клиент считал бы себя
    // вошедшим и не пытался бы снова.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r' }), {
          status: 200,
        })
      )
    )
    expect(await exchangeTelegramLaunch('user=1&hash=x')).toBeNull()
    expect(getAppAccessToken()).toBe('')
  })
})

describe('запросы предъявляют оба удостоверения, когда оба есть', () => {
  const КОД = fs
    .readFileSync(path.join(__dirname, '..', 'lib', 'apiFetch.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('ПРИ ПОДПИСИ BEARER НЕ ШЛЁТСЯ — иначе вход ломается через 10 минут', () => {
    /*
     * СТОРОЖ НА СЛОМАННЫЙ МНОЙ ВХОД (07.09.2026).
     *
     * Я поставил сюда оба заголовка сразу, рассудив: «сервер принимает любое
     * из двух, лишний ничего не меняет». Сервер говорит обратное прямым
     * текстом в `auth.ts`:
     *
     *     «Отказ НЕ проваливается в следующую ветку… Если токен протух или
     *      отозван, честный ответ — 401 с причиной».
     *
     * Порядок веток там: ключ сервера → ключ агента → СЕССИЯ → подпись.
     * Присланный Bearer РЕШАЕТ исход. Access живёт десять минут, поэтому
     * через десять минут после запуска мини-апп слал протухший Bearer вместе
     * с исправной подписью и получал 401 на каждый запрос.
     *
     * Владелец описал это как «не входит автоматом, как раньше».
     *
     * Пока порядок на сервере такой, при наличии подписи идёт ОНА ОДНА.
     */
    const начало = КОД.indexOf('if (initData) {')
    const ветка = КОД.slice(начало, КОД.indexOf('} else {', начало))
    expect(ветка.length, 'ветку не нашли — проверка пуста').toBeGreaterThan(20)
    expect(ветка).toContain("h.set('X-Telegram-Init-Data', initData)")
    expect(ветка).not.toContain('Authorization')
  })

  it('без подписи сессия предъявляется — иначе веб и iOS остаются без входа', () => {
    // Опорный тест: «Bearer не шлётся» не должно означать «не шлётся никогда».
    const начало = КОД.indexOf('} else {', КОД.indexOf('if (initData) {'))
    const иначе = КОД.slice(начало, начало + 300)
    expect(иначе).toContain("h.set('Authorization', `Bearer ${accessToken}`)")
  })
})

describe('обмен зовётся один раз за запуск', () => {
  const КОД = fs
    .readFileSync(
      path.join(__dirname, '..', 'components', 'Telegram', 'TelegramProvider.tsx'),
      'utf8'
    )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('вызов есть и защищён от повтора', () => {
    expect(КОД).toContain('exchangeTelegramLaunch(initData)')
    expect(КОД).toContain('обменПробовали.current')
  })

  it('без подписи обмен не запускается', () => {
    const ветка = КОД.slice(КОД.indexOf('обменПробовали.current'))
    expect(ветка).toContain('if (!initData) return')
  })
})
