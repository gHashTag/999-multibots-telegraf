import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { CRM_TOUCH_TOOLS } from './src/agent/crm-touch-tools'
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
const tool = (name: string) => {
  // Looked up in BOTH sets: crm_touch and crm_history live in a separate,
  // English-only module, and a test that searched only the old array would
  // report "tool missing" for a tool the agent serves perfectly well.
  const found = [...CRM_TOOLS, ...CRM_TOUCH_TOOLS].find(t => t.name === name)
  if (!found) throw new Error(`нет инструмента ${name}`)
  return found
}

const STRANGER_CTX = { telegramId: '999', pool: {} } as any
const OWNER_CTX = { telegramId: '144022504', pool: {} } as any

/*
 * Настройки Supabase ставятся ДЛЯ ВСЕГО файла: без них любой инструмент
 * падает на «CRM не настроен», и проверка доступа отвечала бы не на тот
 * вопрос — «нет ключей» вместо «не ваши люди».
 */
beforeEach(() => {
  process.env.SUPABASE_URL = 'https://пример.test'
  process.env.SUPABASE_SERVICE_KEY = 'ключ'
})

/*
 * КТО СМОТРИТЕЛЬ — ТЕПЕРЬ НАСТРОЙКА, А НЕ ЗАШИТОЕ ЧИСЛО.
 *
 * Раньше `crm-tools.ts` держал собственную копию id владельца платформы со
 * значением по умолчанию. Копия правила «кому видно всё» — способ поправить
 * одну и забыть другую, а цена ошибки здесь — чужие клиенты на чужом экране.
 *
 * Правило переехало в `src/hive/roles.ts` и читает `HIVE_KEEPERS`. Тест обязан
 * объявить смотрителя САМ: молчаливое умолчание в коде — это и есть то, от
 * чего уходим.
 */
process.env.HIVE_KEEPERS = '144022504'

describe('каждый видит только свою аудиторию', () => {
  it.each(['crm_overview', 'crm_hot_leads', 'crm_winback'])(
    '%s отказывает тому, за кем ботов нет',
    async name => {
      // Пустой список ботов — не повод показать всё: показывать нечего.
      vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => [] }) as any)
      await expect(tool(name).handler({}, STRANGER_CTX)).rejects.toThrow(
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
    await tool('crm_overview').handler({}, STRANGER_CTX)
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
      tool('crm_overview').handler({}, undefined as any)
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
    const r: any = await tool('crm_overview').handler({}, OWNER_CTX)
    expect(r.всего_людей).toBe(4)
    expect(r.платящих).toBe(2)
    expect(r.доля_платящих).toBe('50.0%')
    expect(r.по_ботам).toEqual({ bot1: 2, bot2: 2 })
  })

  it('горячий лид — недавний И НЕПЛАТИВШИЙ', async () => {
    const r: any = await tool('crm_hot_leads').handler({ дней: 14 }, OWNER_CTX) // cyrillic-ok
    expect(r.люди.map((ч: any) => ч.telegram_id)).toEqual(['2'])
  })

  it('вернуть — ПЛАТИВШИЙ и замолчавший', async () => {
    const r: any = await tool('crm_winback').handler({ молчит_дней: 30 }, OWNER_CTX) // cyrillic-ok
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
    const r: any = await tool('crm_winback').handler({ молчит_дней: 30 }, OWNER_CTX) // cyrillic-ok
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
     * «всего_людей: 1000» при 2380 в таблице и «пришли_за_7_дней: 0», потому // cyrillic-ok
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

    const r: any = await tool('crm_overview').handler({}, OWNER_CTX)
    expect(r.всего_людей).toBe(ВСЕГО)
    expect(запрошено).toEqual(['0-999', '1000-1999'])
  })

  it('каждый запрос уходит С заголовком Range', async () => {
    let сRange = 0
    vi.stubGlobal('fetch', async (_u: string, init: any) => {
      if (init?.headers?.Range) сRange++
      return { ok: true, json: async () => [] } as any
    })
    await tool('crm_overview').handler({}, OWNER_CTX)
    expect(сRange).toBeGreaterThan(0)
  })
})

/**
 * A CRM THAT FORGETS IS A REPORT.
 *
 * Measured 2026-09-08 before this: `grep -c "INSERT|UPDATE|CREATE TABLE"` over
 * crm-tools.ts was 0, and no table anywhere recorded a touch. So the hot-lead
 * list returned the same names every day, and the same people got written to
 * twice -- the fastest way to have an account limited and to lose somebody who
 * was only still thinking.
 *
 * Every check below describes a way that memory can go wrong with somebody
 * else's clients.
 */
const fakePool = () => {
  const rows: any[] = []
  return {
    rows,
    query: async (sql: string, params: any[] = []) => {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (s.startsWith('CREATE')) return { rows: [] }
      if (s.startsWith('INSERT INTO crm_touches')) {
        rows.push({
          owner_id: params[0],
          lead_id: params[1],
          bot_name: params[2],
          kind: params[3],
          note: params[4],
          at: new Date().toISOString(),
        })
        return { rows: [] }
      }
      if (s.includes('FROM crm_touches')) {
        /*
         * The WHERE is read OFF THE QUERY, not repeated here. A fake that keeps
         * its own copy of `owner_id = $1` filters on behalf of the code, and a
         * mutation removing the real condition passes straight through it. This
         * repository has already paid for that shape of fake twice.
         */
        const byOwner = s.includes('owner_id = $1')
        const byLead = s.includes('lead_id = $2')
        return {
          rows: rows.filter(
            r =>
              (!byOwner || r.owner_id === String(params[0])) &&
              (!byLead || r.lead_id === String(params[1]))
          ),
        }
      }
      return { rows: [] }
    },
  }
}

const stubNet = (byBot: Record<string, string>) =>
  vi.stubGlobal('fetch', async (url: string) => {
    const a = String(url)
    if (a.includes('/avatars?')) {
      return { ok: true, json: async () => [{ bot_name: 'bot1' }] } as any
    }
    if (a.includes('/users?')) {
      const m = /telegram_id=eq\.([^&]+)/.exec(a)
      if (m) {
        const bot = byBot[decodeURIComponent(m[1])]
        return {
          ok: true,
          json: async () =>
            bot ? [{ telegram_id: decodeURIComponent(m[1]), bot_name: bot }] : [],
        } as any
      }
      return {
        ok: true,
        json: async () =>
          Object.entries(byBot).map(([id, bot]) => ({
            telegram_id: id,
            bot_name: bot,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          })),
      } as any
    }
    return { ok: true, json: async () => [] } as any
  })

describe('касание записывается только про своих людей', () => {
  beforeEach(async () => {
    const { forgetTouchTable } = await import('./src/agent/crm-touches')
    forgetTouchTable()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('владелец бота записывает касание своего лида', async () => {
    stubNet({ '111': 'bot1' })
    const pool = fakePool()
    const r: any = await tool('crm_touch').handler(
      { telegram_id: '111', kind: 'written', note: 'позвал на разбор' },
      { telegramId: '77', pool } as any
    )
    expect(r.saved, r.why).toBe(true)
    expect(pool.rows).toHaveLength(1)
    expect(pool.rows[0].lead_id).toBe('111')
    expect(pool.rows[0].owner_id).toBe('77')
  })

  it('ЧУЖОГО лида коснуться нельзя, и отказ не выдаёт, чей он', async () => {
    /*
     * The sharpest one. A touch outside your scope is a write into another
     * owner's space: mark their client "refused" and the person drops out of
     * THEIR list tomorrow. The refusal is worded as "no such person" so a probe
     * cannot learn whose client somebody is by being told "not yours".
     */
    stubNet({ '222': 'чужой_бот' })
    const pool = fakePool()
    const r: any = await tool('crm_touch').handler(
      { telegram_id: '222', kind: 'refused' },
      { telegramId: '77', pool } as any
    )
    expect(r.saved).toBe(false)
    expect(r.why).toBe('такого человека нет')
    expect(pool.rows, 'чужое касание всё-таки записалось').toHaveLength(0)
  })

  it('бот лида берётся из базы, а не со слов вызывающего', async () => {
    // Trusting a claimed bot_name would make the check decorative: name your
    // own bot and touch anybody.
    stubNet({ '222': 'чужой_бот' })
    const pool = fakePool()
    const r: any = await tool('crm_touch').handler(
      { telegram_id: '222', kind: 'written', bot_name: 'bot1' },
      { telegramId: '77', pool } as any
    )
    expect(r.saved).toBe(false)
    expect(pool.rows).toHaveLength(0)
  })

  it('выдуманный вид касания отклоняется', async () => {
    // "warm", "in progress" are judgements nobody can count a month later.
    stubNet({ '111': 'bot1' })
    const pool = fakePool()
    const r: any = await tool('crm_touch').handler(
      { telegram_id: '111', kind: 'тёплый' },
      { telegramId: '77', pool } as any
    )
    expect(r.saved).toBe(false)
    expect(pool.rows).toHaveLength(0)
  })

  it('неудачная запись НЕ выдаётся за успешную', async () => {
    // A memory that silently fails to save is worse than none: the list keeps
    // looking correct while it forgets.
    stubNet({ '111': 'bot1' })
    const brokenPool = {
      query: async () => {
        throw new Error('база недоступна')
      },
    }
    const r: any = await tool('crm_touch').handler(
      { telegram_id: '111', kind: 'written' },
      { telegramId: '77', pool: brokenPool } as any
    )
    expect(r.saved).toBe(false)
    expect(r.why).toBeTruthy()
  })
})

describe('история касаний не показывает чужое', () => {
  beforeEach(async () => {
    const { forgetTouchTable } = await import('./src/agent/crm-touches')
    forgetTouchTable()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('свои касания видны', async () => {
    stubNet({ '111': 'bot1' })
    const pool = fakePool()
    await tool('crm_touch').handler(
      { telegram_id: '111', kind: 'written', note: 'первое' },
      { telegramId: '77', pool } as any
    )
    const r: any = await tool('crm_history').handler(
      { telegram_id: '111' },
      { telegramId: '77', pool } as any
    )
    expect(r.total).toBe(1)
    expect(r.touches[0].note).toBe('первое')
  })

  it('касания ДРУГОГО владельца по тому же человеку не видны', async () => {
    /*
     * Two owners can share a lead only if they share a bot, but the memory is
     * per-owner regardless: what one of them wrote in a note is theirs.
     */
    stubNet({ '111': 'bot1' })
    const pool = fakePool()
    await tool('crm_touch').handler(
      { telegram_id: '111', kind: 'note', note: 'секрет соседа' },
      { telegramId: 'сосед', pool } as any
    )
    const r: any = await tool('crm_history').handler(
      { telegram_id: '111' },
      { telegramId: '77', pool } as any
    )
    expect(r.total).toBe(0)
    expect(JSON.stringify(r)).not.toContain('секрет соседа')
  })
})

describe('тронутых не предлагают снова', () => { // cyrillic-ok
  beforeEach(async () => {
    const { forgetTouchTable } = await import('./src/agent/crm-touches')
    forgetTouchTable()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('после касания человек уходит из горячих лидов, и это сказано числом', async () => {
    /*
     * THE WHOLE POINT. Without this the same names come back every day and the
     * same people get written to twice.
     *
     * "Set aside", not "hidden": the count is reported. A list that quietly
     * shrinks is a list nobody can trust, and this repository has spent a day
     * on exactly that failure elsewhere.
     */
    stubNet({ '111': 'bot1', '222': 'bot1' })
    const pool = fakePool()
    const before: any = await tool('crm_hot_leads').handler(
      {},
      { telegramId: '77', pool } as any
    )
    expect(before.показано).toBe(2) // cyrillic-ok
    expect(before.set_aside_touched).toBe(0)

    await tool('crm_touch').handler(
      { telegram_id: '111', kind: 'written' },
      { telegramId: '77', pool } as any
    )

    const after: any = await tool('crm_hot_leads').handler(
      {},
      { telegramId: '77', pool } as any
    )
    expect(after.показано, 'тронутый снова в списке').toBe(1) // cyrillic-ok
    expect(
      after.set_aside_touched,
      'человек исчез молча — список, который тихо усыхает, доверия не заслуживает'
    ).toBe(1)
    expect(JSON.stringify(after.люди)).not.toContain('111') // cyrillic-ok
  })

  it('касание ДРУГОГО владельца чужой список не укорачивает', async () => {
    // Otherwise touching a shared lead would quietly remove them from a
    // colleague's list -- a write into somebody else's working day.
    stubNet({ '111': 'bot1', '222': 'bot1' })
    const pool = fakePool()
    await tool('crm_touch').handler(
      { telegram_id: '111', kind: 'written' },
      { telegramId: 'сосед', pool } as any
    )
    const mine: any = await tool('crm_hot_leads').handler(
      {},
      { telegramId: '77', pool } as any
    )
    expect(mine.показано).toBe(2) // cyrillic-ok
    expect(mine.set_aside_touched).toBe(0)
  })
})

describe('кто ждёт ответа', () => {
  beforeEach(async () => {
    const { forgetTouchTable } = await import('./src/agent/crm-touches')
    forgetTouchTable()
  })
  afterEach(() => vi.unstubAllGlobals())

  /** A pool whose touches carry a chosen age, so "days" is testable. */
  const poolWith = (
    seed: Array<{ lead: string; kind: string; daysAgo: number; owner?: string }>
  ) => {
    const rows = seed.map(s => ({
      owner_id: s.owner ?? '77',
      lead_id: s.lead,
      kind: s.kind,
      note: null,
      at: new Date(Date.now() - s.daysAgo * 86400000).toISOString(),
    }))
    return {
      rows,
      query: async (sql: string, params: any[] = []) => {
        const q = sql.replace(/\s+/g, ' ').trim()
        if (q.startsWith('CREATE')) return { rows: [] }
        if (q.includes('FROM crm_touches')) {
          // The WHERE is read off the query, never repeated here -- a fake that
          // filters on the code's behalf hides a missing condition.
          const byOwner = q.includes('owner_id = $1')
          return {
            rows: rows.filter(r => !byOwner || r.owner_id === String(params[0])),
          }
        }
        return { rows: [] }
      },
    }
  }

  it('ответивший, которому мы молчим, идёт ПЕРВЫМ', async () => {
    /*
     * The ordering is the product. A waiting screen that lists "we wrote and
     * nobody answered" above "they answered and we are silent" buries the only
     * item that costs money every day it is ignored.
     */
    stubNet({ '111': 'bot1', '222': 'bot1' })
    const pool = poolWith([
      { lead: '222', kind: 'written', daysAgo: 20 },
      { lead: '111', kind: 'replied', daysAgo: 1 },
    ])
    const r: any = await tool('crm_waiting').handler(
      {},
      { telegramId: '77', pool } as any
    )
    expect(r.total).toBe(2)
    expect(r.waiting[0].telegram_id).toBe('111')
    expect(r.waiting[0].waiting).toBe('ours')
  })

  it('свежее «написали» не дёргает, пока не вышел срок', async () => {
    stubNet({ '111': 'bot1' })
    const pool = poolWith([{ lead: '111', kind: 'written', daysAgo: 1 }])
    const r: any = await tool('crm_waiting').handler(
      {},
      { telegramId: '77', pool } as any
    )
    expect(r.total).toBe(0)
  })

  it('отказавшийся не появляется в ожидающих', async () => {
    stubNet({ '111': 'bot1' })
    const pool = poolWith([
      { lead: '111', kind: 'replied', daysAgo: 1 },
      { lead: '111', kind: 'refused', daysAgo: 5 },
    ])
    const r: any = await tool('crm_waiting').handler(
      {},
      { telegramId: '77', pool } as any
    )
    expect(r.total, 'сказавшего нет снова тянут в работу').toBe(0)
  })

  it('ЧУЖОЙ лид не попадает в мой список ожидания', async () => {
    /*
     * The touch table is per owner, but the audience filter is what stops a
     * lead from another owner's bot appearing here if a touch ever names one.
     */
    stubNet({ '111': 'bot1' })
    const pool = poolWith([
      { lead: '111', kind: 'replied', daysAgo: 1 },
      { lead: '999', kind: 'replied', daysAgo: 1 },
    ])
    const r: any = await tool('crm_waiting').handler(
      {},
      { telegramId: '77', pool } as any
    )
    expect(r.total).toBe(1)
    expect(JSON.stringify(r.waiting)).not.toContain('999')
  })

  it('касания соседа в мой список ожидания не попадают', async () => {
    stubNet({ '111': 'bot1' })
    const pool = poolWith([
      { lead: '111', kind: 'replied', daysAgo: 1, owner: 'сосед' },
    ])
    const r: any = await tool('crm_waiting').handler(
      {},
      { telegramId: '77', pool } as any
    )
    expect(r.total).toBe(0)
  })

  it('пустой список говорит, что это хорошо, а не молчит', async () => {
    // An empty screen with no words reads as broken. This one is a result.
    stubNet({ '111': 'bot1' })
    const r: any = await tool('crm_waiting').handler(
      {},
      { telegramId: '77', pool: poolWith([]) } as any
    )
    expect(r.total).toBe(0)
    expect(String(r.what_to_do)).toContain('хорошая новость')
  })
})
