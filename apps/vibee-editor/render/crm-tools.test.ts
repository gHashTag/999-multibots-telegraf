import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { CRM_TOOLS } from './src/agent/crm-tools'

/**
 * CRM ПОКАЗЫВАЕТ ЧУЖИХ ЛЮДЕЙ — ЗНАЧИТ ГЛАВНОЕ ЗДЕСЬ НЕ ЦИФРЫ, А ГРАНИЦА.
 *
 * Владелец просил CRM и «горячих лидов». Контакты Telegram по-прежнему
 * требуют его личного входа, но ждать незачем: аудитория уже есть — 2380
 * человек и 1510 завершённых платежей (замер 06.09.2026). Это люди, которые
 * сами пришли к его ботам.
 *
 * И ровно поэтому первая проверка — про доступ. Отдать этот список «любому
 * опознанному» значит отдать базу клиентов каждому, кто открыл мини-апп:
 * подпись мини-аппа есть у всех пользователей платформы.
 */
const инструмент = (имя: string) => {
  const т = CRM_TOOLS.find(t => t.name === имя)
  if (!т) throw new Error(`нет инструмента ${имя}`)
  return т
}

const ЧУЖОЙ = { telegramId: '999', pool: {} } as any
const ВЛАДЕЛЕЦ = { telegramId: '144022504', pool: {} } as any

/*
 * Настройки Supabase ставятся ДЛЯ ВСЕГО файла: без них любой инструмент
 * падает на «CRM не настроен», и проверка доступа отвечала бы не на тот
 * вопрос — «нет ключей» вместо «не ваши люди».
 */
beforeEach(() => {
  process.env.SUPABASE_URL = 'https://пример.test'
  process.env.SUPABASE_SERVICE_KEY = 'ключ'
})

describe('каждый видит только свою аудиторию', () => {
  it.each(['crm_overview', 'crm_hot_leads', 'crm_winback'])(
    '%s отказывает тому, за кем ботов нет',
    async имя => {
      // Пустой список ботов — не повод показать всё: показывать нечего.
      vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => [] }) as any)
      await expect(инструмент(имя).handler({}, ЧУЖОЙ)).rejects.toThrow(
        /ботов не числится/
      )
      vi.unstubAllGlobals()
    }
  )

  it('владелец бота видит ТОЛЬКО своих людей — фильтр уходит в запрос', async () => {
    /*
     * Главная проверка разделения: фильтр по bot_name должен попасть В САМ
     * ЗАПРОС. Отфильтровать после выборки означало бы тянуть чужую базу в
     * память и полагаться на то, что фильтр не забудут.
     */
    const адреса: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      const a = String(url)
      адреса.push(a)
      const тело = a.includes('/avatars?')
        ? [{ bot_name: 'bot1' }]
        : a.includes('/users?')
          ? []
          : a.includes('/payments_v2?')
            ? []
            : null
      if (тело === null) throw new Error(`подделка не знает адрес: ${a}`)
      return { ok: true, json: async () => тело } as any
    })
    await инструмент('crm_overview').handler({}, ЧУЖОЙ)
    const запросЛюдей = адреса.find(a => a.includes('/users?')) || ''
    expect(запросЛюдей).toContain('bot_name=in.')
    expect(запросЛюдей).toContain('bot1')
    vi.unstubAllGlobals()
  })

  it('отказывает и при ОТСУТСТВИИ контекста', async () => {
    /*
     * Fail-closed: «контекста нет» не должно означать «значит, свой». Именно
     * так в соседнем модуле (telegram-tools) четыре читающих инструмента
     * когда-то отдавали переписку владельца кому угодно.
     */
    await expect(
      инструмент('crm_overview').handler({}, undefined as any)
    ).rejects.toThrow(/подтверждённой личности/)
  })
})

describe('считаем по данным, а не по ощущениям', () => {
  const ЛЮДИ = [
    // платил, заходил вчера — живой, не лид
    { telegram_id: 1, username: 'a', first_name: 'A', bot_name: 'bot1', created_at: дн(100), updated_at: дн(1), language_code: 'ru' },
    // не платил, заходил вчера — ГОРЯЧИЙ
    { telegram_id: 2, username: 'b', first_name: 'B', bot_name: 'bot1', created_at: дн(3), updated_at: дн(1), language_code: 'ru' },
    // платил, молчит 90 дней — ВЕРНУТЬ
    { telegram_id: 3, username: null, first_name: 'C', bot_name: 'bot2', created_at: дн(300), updated_at: дн(90), language_code: 'en' },
    // не платил, молчит 200 дней — ни то ни другое
    { telegram_id: 4, username: 'd', first_name: 'D', bot_name: 'bot2', created_at: дн(400), updated_at: дн(200), language_code: 'en' },
  ]
  const ПЛАТЕЖИ = [{ telegram_id: 1 }, { telegram_id: 3 }]

  function дн(n: number): string {
    return new Date(Date.now() - n * 86_400_000).toISOString()
  }

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://пример.test'
    process.env.SUPABASE_SERVICE_KEY = 'ключ'
    /*
     * ПОДДЕЛКА ПОДЧИНЯЕТСЯ ЗАПРОСУ, А НЕ УГАДЫВАЕТ ОТВЕТ.
     *
     * Сегодня трижды находились тесты, где двойник сам решал, что вернуть, и
     * поломка настоящего кода их не роняла. Здесь ответ выбирается по ТАБЛИЦЕ
     * в адресе, а неизвестный адрес — ошибка, а не «пусто»: молчаливый пустой
     * ответ на незнакомый запрос выглядел бы как «никого не нашлось».
     */
    vi.stubGlobal('fetch', async (url: string) => {
      const адрес = String(url)
      const тело = адрес.includes('/users?')
        ? ЛЮДИ
        : адрес.includes('/payments_v2?')
          ? ПЛАТЕЖИ
          : null
      if (тело === null) throw new Error(`подделка не знает адрес: ${адрес}`)
      return { ok: true, json: async () => тело } as any
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('сводка считает платящих и долю', async () => {
    const r: any = await инструмент('crm_overview').handler({}, ВЛАДЕЛЕЦ)
    expect(r.всего_людей).toBe(4)
    expect(r.платящих).toBe(2)
    expect(r.доля_платящих).toBe('50.0%')
    expect(r.по_ботам).toEqual({ bot1: 2, bot2: 2 })
  })

  it('горячий лид — недавний И НЕПЛАТИВШИЙ', async () => {
    const r: any = await инструмент('crm_hot_leads').handler({ дней: 14 }, ВЛАДЕЛЕЦ)
    expect(r.люди.map((ч: any) => ч.telegram_id)).toEqual(['2'])
  })

  it('вернуть — ПЛАТИВШИЙ и замолчавший', async () => {
    const r: any = await инструмент('crm_winback').handler({ молчит_дней: 30 }, ВЛАДЕЛЕЦ)
    expect(r.люди.map((ч: any) => ч.telegram_id)).toEqual(['3'])
  })

  it('незавершённый платёж НЕ делает человека покупателем', async () => {
    /*
     * Запрос обязан фильтровать по COMPLETED и MONEY_INCOME. Иначе брошенная
     * попытка оплаты записала бы человека в покупатели — и он выпал бы из
     * горячих лидов, то есть из тех, кому как раз стоит написать.
     */
    const исходник = fs.readFileSync(
      path.join(__dirname, 'src', 'agent', 'crm-tools.ts'),
      'utf8'
    )
    expect(исходник).toContain('status=eq.COMPLETED')
    expect(исходник).toContain('type=eq.MONEY_INCOME')
  })

  it('человек без username отдаётся без ссылки, а не с битой', async () => {
    const r: any = await инструмент('crm_winback').handler({ молчит_дней: 30 }, ВЛАДЕЛЕЦ)
    expect(r.люди[0].ссылка).toBeNull()
  })
})

describe('CRM ничего не рассылает', () => {
  it('среди инструментов нет отправки', () => {
    /*
     * Массовая отправка — необратимое действие в адрес живых людей, и решать
     * его должен человек. Инструменты только показывают, кому имеет смысл
     * написать.
     */
    /*
     * Сверяем КОД без комментариев: рассказ о том, почему рассылки нет,
     * обязан содержать слово «рассылка» — и четырежды за смену такие
     * проверки ловили мою же прозу вместо поведения.
     */
    const код = fs
      .readFileSync(path.join(__dirname, 'src', 'agent', 'crm-tools.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(код).not.toMatch(/sendMessage|broadcast/i)
    for (const т of CRM_TOOLS) expect(т.name).toMatch(/^crm_/)
  })
})

describe('читаем всю базу, а не первую страницу', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('страницы склеиваются, пока не придёт короткая', async () => {
    /*
     * НАЙДЕНО НА ЖИВОЙ БАЗЕ, а не в тесте: crm_overview отвечал
     * «всего_людей: 1000» при 2380 в таблице и «пришли_за_7_дней: 0», потому
     * что PostgREST режет выдачу своим потолком. Худшая форма ошибки —
     * уверенный неверный ответ.
     *
     * Подделка ОБЯЗАНА уважать Range: иначе проверка пагинации сама была бы
     * слепой — ровно тот дефект, который сегодня находился четыре раза.
     */
    const ЧЕЛОВЕК = (i: number) => ({
      telegram_id: i,
      username: null,
      first_name: null,
      bot_name: 'bot1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      language_code: 'ru',
    })
    const ВСЕГО = 1500
    const запрошено: string[] = []
    vi.stubGlobal('fetch', async (url: string, init: any) => {
      const адрес = String(url)
      const диапазон = String(init?.headers?.Range ?? '')
      if (адрес.includes('/payments_v2?')) {
        return { ok: true, json: async () => [] } as any
      }
      if (!адрес.includes('/users?')) {
        throw new Error(`подделка не знает адрес: ${адрес}`)
      }
      запрошено.push(диапазон)
      const m = /^(\d+)-(\d+)$/.exec(диапазон)
      if (!m) throw new Error(`запрос без Range: ${диапазон || '(пусто)'}`)
      const от = Number(m[1])
      const до = Math.min(Number(m[2]), ВСЕГО - 1)
      const кусок = []
      for (let i = от; i <= до; i++) кусок.push(ЧЕЛОВЕК(i))
      return { ok: true, json: async () => кусок } as any
    })

    const r: any = await инструмент('crm_overview').handler({}, ВЛАДЕЛЕЦ)
    expect(r.всего_людей).toBe(ВСЕГО)
    expect(запрошено).toEqual(['0-999', '1000-1999'])
  })

  it('каждый запрос уходит С заголовком Range', async () => {
    let сRange = 0
    vi.stubGlobal('fetch', async (_u: string, init: any) => {
      if (init?.headers?.Range) сRange++
      return { ok: true, json: async () => [] } as any
    })
    await инструмент('crm_overview').handler({}, ВЛАДЕЛЕЦ)
    expect(сRange).toBeGreaterThan(0)
  })
})
