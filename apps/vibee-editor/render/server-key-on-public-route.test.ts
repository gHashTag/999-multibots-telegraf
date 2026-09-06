import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { authenticate, hasServerKey, isPublic } from './auth'

/**
 * НА ПУБЛИЧНОМ МАРШРУТЕ `authenticate().via` НЕ ГОВОРИТ О КЛЮЧЕ НИЧЕГО.
 *
 * `authenticate` начинается с `isPublic` и на публичном маршруте возвращает
 * `via: 'public'`, НЕ ДОЙДЯ до проверки ключа. Для вопроса «пускать или нет»
 * это верно и дёшево. Но обработчику, которому нужно отличить СВОЙ СЕРВЕР от
 * «кого-то опознанного», такой ответ бесполезен.
 *
 * Куплено ошибкой, 06.09.2026. Ветка «сервис бота зовёт агента от имени
 * человека» сверялась с `authenticate(req).via === 'api-key'` на маршруте
 * /api/agent/chat — а он числится публичным, потому что проверяет личность
 * сам. Условие не выполнялось НИКОГДА: при верном серверном ключе бот получал
 * «не удалось определить пользователя».
 *
 * Тот же класс, что и `/api/feed/pending` тем же днём: проверка стояла не там,
 * где принимается решение. Поймано живым запросом к проду, а не тестом, —
 * поэтому проверка появляется здесь.
 */
const КЛЮЧ = 'ключ-сервера-для-проверки-длинный'

describe('ключ сервера отличим от «просто пустили»', () => {
  let прежний: string | undefined
  beforeEach(() => {
    прежний = process.env.RENDER_API_KEY
    process.env.RENDER_API_KEY = КЛЮЧ
  })
  afterEach(() => {
    process.env.RENDER_API_KEY = прежний
  })

  const запрос = (url: string, ключ?: string) =>
    ({ url, method: 'POST', headers: ключ ? { 'x-api-key': ключ } : {} }) as any

  it('маршрут агента действительно публичный — иначе повода нет', () => {
    // Если это перестанет быть правдой, ловушка исчезнет, и файл надо
    // перечитать, а не молча оставить.
    expect(isPublic(запрос('/api/agent/chat'))).toBe(true)
  })

  it('authenticate НА НЁМ отвечает public даже с верным ключом', () => {
    /*
     * Вот она, ловушка целиком: ключ прислан, ключ верный, а `via` — 'public'.
     * Условие `via === 'api-key'` не выполнится.
     */
    expect(authenticate(запрос('/api/agent/chat', КЛЮЧ)).via).toBe('public')
  })

  it('hasServerKey отвечает по КЛЮЧУ, а не по публичности', () => {
    expect(hasServerKey(запрос('/api/agent/chat', КЛЮЧ))).toBe(true)
    expect(hasServerKey(запрос('/api/agent/chat', 'чужой-ключ-той-же-длины'))).toBe(
      false
    )
    expect(hasServerKey(запрос('/api/agent/chat'))).toBe(false)
  })

  it('ПРЕФИКС верного ключа не подходит', () => {
    /*
     * Главный случай, ради которого сравнение постоянного времени и нужно.
     * Наивное `expected.startsWith(given)` приняло бы первые пять символов —
     * то есть ключ можно было бы подобрать посимвольно, по одному запросу на
     * символ. Проверка без этого случая пропускала такую подмену: «чужой
     * ключ той же длины» startsWith тоже отвергает.
     */
    expect(hasServerKey(запрос('/api/agent/chat', КЛЮЧ.slice(0, 5)))).toBe(false)
    expect(hasServerKey(запрос('/api/agent/chat', КЛЮЧ.slice(0, -1)))).toBe(
      false
    )
    // И длиннее верного — тоже нет.
    expect(hasServerKey(запрос('/api/agent/chat', КЛЮЧ + 'x'))).toBe(false)
  })

  it('пустой настроенный ключ никого не пускает', () => {
    // Незаданный RENDER_API_KEY не должен превращать пустой заголовок в
    // совпадение: «ничего == ничего» открыло бы дверь всем.
    process.env.RENDER_API_KEY = ''
    expect(hasServerKey(запрос('/api/agent/chat', ''))).toBe(false)
    expect(hasServerKey(запрос('/api/agent/chat', КЛЮЧ))).toBe(false)
  })
})

describe('опознавание вызывающего пользуется правильной проверкой', () => {
  const МАРШРУТЫ = fs.readFileSync(
    path.join(__dirname, 'src', 'agent', 'routes.ts'),
    'utf8'
  )

  it('resolveIdentity спрашивает hasServerKey, а не authenticate().via', () => {
    expect(МАРШРУТЫ).toContain('if (hasServerKey(req)) {')
    expect(МАРШРУТЫ).not.toContain("authenticate(req).via === 'api-key'")
  })

  it('id называется ЯВНО и проверяется на форму', () => {
    /*
     * Умолчания быть не может: «не назвали — значит владелец» превратило бы
     * каждый безымянный вызов в действие от лица владельца. И id обязан
     * выглядеть как telegram_id, иначе в хранилище разговора попадёт мусор.
     */
    expect(МАРШРУТЫ).toContain("searchParams.get(\n      'telegram_id'\n    )")
    expect(МАРШРУТЫ).toMatch(/\/\^\\d\{5,15\}\$\//)
  })
})
