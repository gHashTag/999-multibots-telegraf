import { describe, it, expect, beforeEach } from 'vitest'
import { isPublic } from './auth'
import {
  обработатьПодключение,
  этоПутьПодключения,
  нормализоватьТелефон,
  нормализоватьКод,
  сохранитьСессию,
  прочитатьСессию,
  отключитьСессию,
  начатьВход,
  подтвердитьКод,
  подтвердитьПароль,
  забытьПопытки,
  забытьТаблицуСессий,
  числоПопыток,
  type Пул,
} from './src/agent/tg-connect'

/**
 * ПОДКЛЮЧЕНИЕ СВОЕГО TELEGRAM.
 *
 * Владелец: «надо чтобы бот прямо в телеграм запрашивал доступ, чтобы там вся
 * настройка у клиентов».
 *
 * Код входа, отправленный СООБЩЕНИЕМ внутри Telegram, платформа аннулирует —
 * так она защищает людей от самой частой кражи аккаунта («пришлите мне код»).
 * Поэтому код вводится в форму мини-приложения: для человека это по-прежнему
 * «внутри Telegram», но через переписку код не проходит.
 *
 * Проверки ниже — про границы, а не про удобство: чужой вход, чужая сессия,
 * что хранится и что нет.
 */

/** Поддельный пул, подчиняющийся SQL: неузнанный запрос — ошибка, не тишина. */
function поддельныйПул() {
  /** Подсказанные номера: их читает статус. */
  const номера = new Map<string, string>()
  const строки = new Map<string, { session: string; phone: string | null }>()
  /*
   * Подделка записывает СОБЫТИЯ, а не только состояние. Без этого порядок
   * «выйти, потом забыть» ненаблюдаем: мутация, удаляющая строку первой,
   * оставляла тест зелёным — поймано ею же.
   */
  const события: string[] = []
  const пул: Пул = {
    async query(sql: string, params: unknown[] = []) {
      const т = sql.replace(/\s+/g, ' ').trim()
      if (/^CREATE TABLE/i.test(т)) return { rows: [] }
      if (/^INSERT INTO tg_sessions/i.test(т)) {
        строки.set(String(params[0]), {
          session: String(params[1]),
          phone: params[2] == null ? null : String(params[2]),
        })
        return { rows: [] }
      }
      if (
        /^SELECT session FROM tg_sessions WHERE telegram_id = \$1$/i.test(т)
      ) {
        const с = строки.get(String(params[0]))
        return { rows: с ? [{ session: с.session }] : [] }
      }
      if (/^DELETE FROM tg_sessions WHERE telegram_id = \$1$/i.test(т)) {
        события.push('забыли')
        строки.delete(String(params[0]))
        return { rows: [] }
      }
      /*
       * Соседняя таблица подсказанных номеров: статус читает её тем же
       * ответом, чтобы экран не делал второго круга сети.
       *
       * Условие берётся ИЗ ЗАПРОСА, а не повторяется здесь: подделка со своей
       * копией `WHERE` зеленеет ровно тогда, когда условие из настоящего кода
       * убрали.
       */
      if (/^SELECT phone FROM tg_known_phones/i.test(т)) {
        const сверяет = т.includes('telegram_id = $1')
        const найдено = [...номера.entries()].filter(
          ([id]) => !сверяет || id === String(params[0])
        )
        return { rows: найдено.map(([, phone]) => ({ phone })) }
      }
      if (/^DELETE FROM tg_known_phones/i.test(т)) {
        номера.delete(String(params[0]))
        return { rows: [] }
      }
      throw new Error(`подделка не узнала запрос: ${т.slice(0, 140)}`)
    },
  }
  return { пул, строки, события }
}

/**
 * What Telegram answers to `auth.sendCode` for a third-party api_id: the code
 * goes into the Telegram app, and no other channel is offered. A plain object
 * with `className`, because the code under test reads exactly that.
 */
function sentCodeAnswer() {
  return {
    className: 'auth.SentCode',
    type: { className: 'auth.SentCodeTypeApp', length: 5 },
    phoneCodeHash: 'HASH',
  }
}

describe('телефон и код приводятся к виду, который примет Telegram', () => {
  it('человеческие разделители убираются', () => {
    expect(нормализоватьТелефон('+7 (999) 123-45-67')).toBe('+79991234567')
    expect(нормализоватьТелефон('79991234567')).toBe('+79991234567')
  })

  it('мусор отвергается с внятной подсказкой', () => {
    expect(() => нормализоватьТелефон('телефон')).toThrow(/международном/)
    expect(() => нормализоватьТелефон('+123')).toThrow()
  })

  it('код принимается с пробелами и дефисами', () => {
    // Telegram присылает «12345», а люди вставляют «1 2 3 4 5» и «123-45».
    expect(нормализоватьКод('1 2 3 4 5')).toBe('12345')
    expect(нормализоватьКод('123-45')).toBe('12345')
    expect(() => нормализоватьКод('abc')).toThrow(/цифр/)
  })
})

describe('сессия принадлежит человеку', () => {
  beforeEach(() => {
    забытьПопытки()
    забытьТаблицуСессий()
  })

  it('сохранённая читается своим владельцем', async () => {
    const { пул } = поддельныйПул()
    await сохранитьСессию(пул, '1', 'СЕССИЯ-1', '+79991234567')
    expect(await прочитатьСессию(пул, '1')).toBe('СЕССИЯ-1')
  })

  it('ЧУЖАЯ сессия не читается', async () => {
    const { пул } = поддельныйПул()
    await сохранитьСессию(пул, '1', 'СЕССИЯ-1')
    expect(await прочитатьСессию(пул, '2')).toBeNull()
  })

  it('повторное подключение ЗАМЕНЯЕТ, а не плодит вторую', async () => {
    /*
     * Две живые сессии на один аккаунт — это две двери, о второй из которых
     * человек не знает и которую не сможет закрыть.
     */
    const { пул, строки } = поддельныйПул()
    await сохранитьСессию(пул, '1', 'СТАРАЯ')
    await сохранитьСессию(пул, '1', 'НОВАЯ')
    expect(строки.size).toBe(1)
    expect(await прочитатьСессию(пул, '1')).toBe('НОВАЯ')
  })

  it('отключение СНАЧАЛА выходит в Telegram, потом забывает', async () => {
    /*
     * Порядок важен: удалив строку первой, мы потеряли бы возможность выйти —
     * и оставили бы висеть сеанс, которого человек уже не видит у себя.
     */
    const { пул, события } = поддельныйПул()
    await сохранитьСессию(пул, '1', 'СЕССИЯ-1')
    const итог = await отключитьСессию(пул, '1', async с => {
      события.push(`вышли:${с}`)
    })
    // Сначала выход, ТОЛЬКО ПОТОМ забвение.
    expect(события).toEqual(['вышли:СЕССИЯ-1', 'забыли'])
    expect(итог).toEqual({ забыто: true, вышли: true })
    expect(await прочитатьСессию(пул, '1')).toBeNull()
  })

  it('не смогли выйти — всё равно забываем у себя', async () => {
    // Держать строку, которой человек больше не доверяет, хуже, чем не
    // закрыть чужой сеанс: у нас она работает, у него — нет.
    const { пул } = поддельныйПул()
    await сохранитьСессию(пул, '1', 'СЕССИЯ-1')
    const итог = await отключитьСессию(пул, '1', async () => {
      throw new Error('Telegram недоступен')
    })
    expect(итог).toEqual({ забыто: true, вышли: false })
    expect(await прочитатьСессию(пул, '1')).toBeNull()
  })
})

describe('чужой вход нельзя завершить', () => {
  beforeEach(() => забытьПопытки())

  /** Поддельный клиент MTProto: сеть в тесте — это проверка сети, не логики. */
  function поддельныйКлиент(нуженПароль = false) {
    return {
      apiId: 1,
      apiHash: 'h',
      session: { save: () => 'НОВАЯ-СЕССИЯ' },
      /*
       * THE FAKE REFUSES WHAT GRAMJS REFUSES.
       *
       * It used to be `async invoke() {}` -- it ignored its argument entirely
       * and agreed with anything. That is how a plain object went out in place
       * of an `Api.auth.SignIn` request and reached production, where every
       * sign-in died with "You can only invoke MTProtoRequests" after the
       * person had typed a correct code.
       *
       * GramJS checks `classType === 'request'` before serialising. So does
       * this double now, with the same message, and the field names too: the
       * old object said `phone` where Telegram wants `phoneNumber`.
       */
      async invoke(request: any) {
        if (!request || request.classType !== 'request') {
          throw new Error('You can only invoke MTProtoRequests')
        }
        // The login now starts with the raw request, not the `sendCode`
        // helper, so the refusal above guards this call as well.
        if (request.className === 'auth.SendCode') return sentCodeAnswer()
        if (request.className === 'auth.SignIn') {
          if (!request.phoneNumber) throw new Error('phoneNumber missing')
          if (!request.phoneCodeHash) throw new Error('phoneCodeHash missing')
          if (!request.phoneCode) throw new Error('phoneCode missing')
        }
        if (нуженПароль) throw new Error('SESSION_PASSWORD_NEEDED') // cyrillic-ok: pre-existing local name
      },
      async signInWithPassword() {},
      async disconnect() {},
    }
  }

  it('handle сам по себе не пропуск: чужой не завершит', async () => {
    /*
     * Иначе подсмотренный или подобранный handle позволил бы закончить чужой
     * вход и получить чужую сессию — то есть чужой аккаунт целиком.
     */
    const { handle } = await начатьВход(
      '1',
      '+79991234567',
      async () => поддельныйКлиент(),
      () => 'КЛЮЧ'
    )
    await expect(подтвердитьКод('2', handle, '12345')).rejects.toThrow(
      /начат другим/
    )
    // И свой — проходит.
    const r = await подтвердитьКод('1', handle, '12345')
    expect(r.сессия).toBe('НОВАЯ-СЕССИЯ')
  })

  it('двухфакторный пароль спрашивается отдельным шагом', async () => {
    const { handle } = await начатьВход(
      '1',
      '+79991234567',
      async () => поддельныйКлиент(true),
      () => 'КЛЮЧ2'
    )
    const шаг = await подтвердитьКод('1', handle, '12345')
    expect(шаг.нуженПароль).toBe(true)
    expect(шаг.сессия).toBeUndefined()
    const готово = await подтвердитьПароль('1', handle, 'пароль')
    expect(готово.сессия).toBe('НОВАЯ-СЕССИЯ')
  })

  it('законченный вход забывается — повтор невозможен', async () => {
    const { handle } = await начатьВход(
      '1',
      '+79991234567',
      async () => поддельныйКлиент(),
      () => 'КЛЮЧ3'
    )
    await подтвердитьКод('1', handle, '12345')
    expect(числоПопыток()).toBe(0)
    await expect(подтвердитьКод('1', handle, '12345')).rejects.toThrow(
      /не начат или истёк/
    )
  })

  it('несуществующий handle не притворяется начатым входом', async () => {
    await expect(подтвердитьКод('1', 'нет-такого', '12345')).rejects.toThrow(
      /не начат или истёк/
    )
  })
})

describe('маршруты подключения: личность строже, чем у соседей', () => {
  beforeEach(() => {
    забытьПопытки()
    забытьТаблицуСессий()
  })

  const зав = (кто: string | null, строки = new Map<string, any>()) => ({
    getPool: async () => поддельныйПулИз(строки),
    личность: () => кто,
    readBody: async () => JSON.stringify({ phone: '+79991234567' }),
    создатьКлиент: async () => ({
      apiId: 1,
      apiHash: 'h',
      session: { save: () => 'НОВАЯ' },
      async invoke(request: any) {
        if (request?.className === 'auth.SendCode') return sentCodeAnswer()
      },
      async signInWithPassword() {},
      async disconnect() {},
    }),
    случайныйКлюч: () => 'КЛЮЧ',
    выйтиВTelegram: async () => {},
  })

  function поддельныйПулИз(строки: Map<string, any>): Пул {
    /*
     * Своя карта подсказанных номеров у каждой копии подделки.
     *
     * Раньше я объявлял её то в одной области, то в другой и трижды получал
     * «номера is not defined»: у этого файла ДВЕ подделки пула, и правка
     * вслепую попадала не в ту. Место объявления — там же, где хранилище,
     * которое она подменяет.
     */
    const номера = new Map<string, string>()
    return {
      async query(sql: string, params: unknown[] = []) {
        const т = sql.replace(/\s+/g, ' ').trim()
        if (/^CREATE TABLE/i.test(т)) return { rows: [] }
        if (/^INSERT INTO tg_sessions/i.test(т)) {
          строки.set(String(params[0]), { session: String(params[1]) })
          return { rows: [] }
        }
        if (
          /^SELECT session FROM tg_sessions WHERE telegram_id = \$1$/i.test(т)
        ) {
          const c = строки.get(String(params[0]))
          return { rows: c ? [{ session: c.session }] : [] }
        }
        if (/^DELETE FROM tg_sessions WHERE telegram_id = \$1$/i.test(т)) {
          строки.delete(String(params[0]))
          return { rows: [] }
        }
        if (/^SELECT phone FROM tg_known_phones/i.test(т)) {
          // Условие берётся ИЗ ЗАПРОСА, а не повторяется здесь: подделка со
          // своей копией `WHERE` зеленеет ровно тогда, когда условие из
          // настоящего кода убрали.
          const сверяет = т.includes('telegram_id = $1')
          const найдено = [...номера.entries()].filter(
            ([id]) => !сверяет || id === String(params[0])
          )
          return { rows: найдено.map(([, phone]) => ({ phone })) }
        }
        if (/^DELETE FROM tg_known_phones/i.test(т)) {
          номера.delete(String(params[0]))
          return { rows: [] }
        }
        throw new Error(`подделка не узнала запрос: ${т.slice(0, 140)}`)
      },
    }
  }

  it('без подписи — 401, и текст объясняет почему', async () => {
    const r = await обработатьПодключение(
      { url: '/api/tg/connect/start', method: 'POST' },
      зав(null) as any
    )
    expect(r.код).toBe(401)
    /*
     * Текст обязан назвать ОБА принимаемых способа.
     *
     * Раньше здесь закреплялось «вашей подписи», и вместе с формулировкой был
     * закреплён ложный совет: `chatIdentity` принимает и подпись мини-аппа, и
     * сессию приложения, а человеку в приложении на iPhone предлагалось
     * «открыть экран из приложения» — то есть отправляли по кругу.
     */
    const текст = String(r.тело.error)
    expect(текст).toMatch(/подпись Telegram/)
    expect(текст).toMatch(/приложении/)
    expect(текст).not.toMatch(/откройте экран из приложения/)
  })

  it('строка сессии НИКОГДА не возвращается клиенту', async () => {
    /*
     * Она сильнее пароля — не спрашивает второй фактор — и клиенту не нужна
     * ни для чего. Вернуть её один раз значит оставить её в истории запросов
     * браузера и в любом журнале по дороге.
     */
    const строки = new Map<string, any>()
    const д = зав('1', строки) as any
    await обработатьПодключение(
      { url: '/api/tg/connect/start', method: 'POST' },
      д
    )
    д.readBody = async () => JSON.stringify({ handle: 'КЛЮЧ', code: '12345' })
    const r = await обработатьПодключение(
      { url: '/api/tg/connect/code', method: 'POST' },
      д
    )
    expect(r.тело).toEqual({ ok: true, подключено: true })
    expect(JSON.stringify(r.тело)).not.toContain('НОВАЯ')
    // А в базе она есть.
    expect(строки.get('1')?.session).toBe('НОВАЯ')
  })

  it('статус не выдумывает подключение', async () => {
    const r = await обработатьПодключение(
      { url: '/api/tg/connect/status', method: 'GET' },
      зав('1') as any
    )
    /*
     * Статус теперь везёт и ПОДСКАЗКУ НОМЕРА — тем же ответом, чтобы экран не
     * делал второй круг сети ровно тогда, когда человек ждёт форму.
     *
     * `подключено: false` проверяется по-прежнему точно: выдуманное «да»
     * показало бы человеку «Telegram подключён» там, где ничего не подключено.
     * Номер здесь `null`: делиться им никто не приходил.
     */
    expect(r.тело).toEqual({ ok: true, подключено: false, phone: null })
  })

  it('все пути объявлены и достижимы через общий гвард', () => {
    /*
     * В этом файле уже четырежды случалось, что написанный и покрытый
     * тестами маршрут отвечал 401, не дойдя до обработчика. Здесь гвард
     * пропускает НАМЕРЕННО: личность проверяет сам обработчик, и проверяет
     * строже — он отвергает серверный ключ, который гвард пустил бы.
     */
    for (const путь of [
      '/api/tg/connect/start',
      '/api/tg/connect/resend',
      '/api/tg/connect/code',
      '/api/tg/connect/password',
      '/api/tg/connect/status',
      '/api/tg/connect',
    ]) {
      expect(этоПутьПодключения(путь)).toBe(true)
      expect(
        isPublic({ url: путь, method: 'POST', headers: {} } as any),
        `${путь} не пропущен гвардом — обработчик не получит запрос`
      ).toBe(true)
    }
  })
})
