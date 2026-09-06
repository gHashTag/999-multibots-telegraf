import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * ВЛОЖЕНИЕ К ЧАТУ ДОЛЖНО НЕСТИ ТО ЖЕ УДОСТОВЕРЕНИЕ, ЧТО И САМ ЧАТ.
 *
 * Владелец: «фото агенту не грузится в чате в боте». Человек видел
 * «photo_2569-09-05 21.50.27.jpeg: загрузка не удалась». Журнал прода назвал
 * настоящую причину дословно:
 *
 *   🔒 [auth] ОТКАЗ POST /upload — no X-Api-Key and no Telegram initData
 *
 * Запрос уходил БЕЗ удостоверения вообще. Механизм: `authHeaders` знала два
 * способа (подпись мини-аппа, сессия приложения), а третий — ключ агента —
 * дописывался СНАРУЖИ, в десяти компонентах, одной и той же строкой. Чат её
 * дописывал и работал; загрузка вложений не дописала и отвечала 401.
 *
 * Дверь, о которой знают не все входящие, — это не дверь.
 */
const ЛИБ = __dirname
const читать = (относительный: string) =>
  fs.readFileSync(path.join(ЛИБ, относительный), 'utf8')

describe('единственная дверь знает все три способа', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('без подписи и без сессии подставляется ключ агента', async () => {
    vi.stubEnv('DEV', true as unknown as string)
    vi.stubEnv('VITE_AGENT_KEY', 'agent-key-for-the-test')
    vi.doMock('./telegram', () => ({ getInitData: () => '' }))
    vi.doMock('./appSession', () => ({ getAppAccessToken: () => '' }))
    const { authHeaders } = await import('./apiFetch')
    expect(authHeaders().get('X-Agent-Key')).toBe('agent-key-for-the-test')
  })

  it('подпись мини-аппа имеет приоритет над ключом', async () => {
    /*
     * Порядок не косметический: подпись принадлежит КОНКРЕТНОМУ человеку, а
     * ключ агента — способ для наладки. Перепутав их, мы писали бы чужие
     * действия не тому владельцу.
     */
    vi.stubEnv('DEV', true as unknown as string)
    vi.stubEnv('VITE_AGENT_KEY', 'agent-key-for-the-test')
    vi.doMock('./telegram', () => ({ getInitData: () => 'auth_date=1&hash=x' }))
    vi.doMock('./appSession', () => ({ getAppAccessToken: () => '' }))
    const { authHeaders } = await import('./apiFetch')
    const h = authHeaders()
    expect(h.get('X-Telegram-Init-Data')).toBe('auth_date=1&hash=x')
    expect(h.has('X-Agent-Key')).toBe(false)
  })

  it('сессия приложения имеет приоритет над ключом', async () => {
    vi.stubEnv('DEV', true as unknown as string)
    vi.stubEnv('VITE_AGENT_KEY', 'agent-key-for-the-test')
    vi.doMock('./telegram', () => ({ getInitData: () => '' }))
    vi.doMock('./appSession', () => ({ getAppAccessToken: () => 'session-token' }))
    const { authHeaders } = await import('./apiFetch')
    const h = authHeaders()
    expect(h.get('Authorization')).toBe('Bearer session-token')
    expect(h.has('X-Agent-Key')).toBe(false)
  })
})

describe('загрузка идёт через ту же дверь', () => {
  it('s3Upload собирает заголовки через authHeaders, а не вручную', () => {
    /*
     * Проверка читает исходник НАМЕРЕННО: собрать заголовки правильным
     * образом можно и в обход — именно так и появился дефект. Здесь
     * закрепляется, что загрузка пользуется общей дверью.
     */
    const исходник = читать('s3Upload.ts')
    expect(исходник).toContain('authHeaders(')
    expect(исходник).not.toMatch(/headers:\s*\{/)
  })

  it('русское имя файла не роняет запрос до сети', async () => {
    /*
     * ВТОРОЙ ДЕФЕКТ ЭТОГО ЖЕ ПУТИ, и найден он случайно: я подставил
     * кириллицу в значение заголовка внутри проверки выше, и упал не сервер,
     * а браузерный `Headers.set` — «parameter 2 is not a valid ByteString».
     * Значение HTTP-заголовка обязано быть Latin-1.
     *
     * То есть у русскоязычного пользователя файл с русским именем не
     * загружался ВООБЩЕ: исключение возникало до отправки, прежний catch
     * возвращал null, человек читал «загрузка не удалась». В журнале сервера
     * такого отказа нет и быть не может — запрос не уходил.
     */
    vi.stubEnv('DEV', false as unknown as string)
    vi.doMock('./telegram', () => ({ getInitData: () => '' }))
    vi.doMock('./appSession', () => ({ getAppAccessToken: () => 'tok' }))
    const перехвачено: { имя: string | null } = { имя: null }
    vi.stubGlobal('fetch', async (_u: unknown, init: RequestInit) => {
      перехвачено.имя = new Headers(init.headers).get('X-Filename')
      return {
        status: 200,
        text: async () => JSON.stringify({ success: true, url: 'https://x/y' }),
      } as unknown as Response
    })
    const { uploadToS3 } = await import('./s3Upload')
    const файл = new File([new Uint8Array([1, 2, 3])], 'фото отчёт.jpg', {
      type: 'image/jpeg',
    })
    await expect(uploadToS3(файл, 'фото отчёт.jpg')).resolves.toBe('https://x/y')
    expect(перехвачено.имя).toBe(encodeURIComponent('фото отчёт.jpg'))
    // И обратно: сервер обязан уметь это раскодировать.
    expect(decodeURIComponent(перехвачено.имя as string)).toBe('фото отчёт.jpg')
  })

  it('сервер раскодирует имя, а не сохраняет проценты', () => {
    const сервер = fs.readFileSync(
      path.join(ЛИБ, '..', '..', '..', 'render', 'render-server.ts'),
      'utf8'
    )
    expect(сервер).toContain('decodeURIComponent(заголовокИмени)')
  })

  it('отказ доносит причину, а не превращается в пустоту', () => {
    /*
     * `return null` в catch стирал различие между «нет доступа», «файл
     * слишком большой» и «очередь занята». Человеку доставалось одно слово
     * «не удалась», и чинить по нему было нечего.
     */
    const исходник = читать('s3Upload.ts')
    expect(исходник).not.toMatch(/catch[\s\S]{0,200}return null/)
    expect(исходник).toContain('HTTP ${response.status}')
  })
})
