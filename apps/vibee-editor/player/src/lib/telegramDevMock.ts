/**
 * ПОДСТАВНОЙ TELEGRAM — ТОЛЬКО ДЛЯ РАЗРАБОТКИ, ТОЛЬКО ПО ЯВНОЙ ПРОСЬБЕ.
 *
 * Заведено 07.09.2026, после двух дорогих правок вслепую.
 *
 * ЗАЧЕМ. Экраны входа живут за `isTelegram()`, и вне Telegram мини-апп их не
 * показывает вовсе — правильное поведение для продакшена и полная слепота для
 * работы. Посмотреть, как выглядит экран кода спаривания, нельзя было НИКАК:
 * ни локально, ни на стенде. Правки в него шли по тексту и типам.
 *
 * Чем это кончилось, известно точно. Ту же слепоту в приложении на iOS
 * оплатили дважды: сначала поле обрезало код на шестой цифре и вход не работал
 * вовсе, потом подсказка «код из Telegram» не влезла в поле и обрезалась в
 * «код из Tele…». Оба раза текст и типы были в порядке; нашёл живой запуск.
 *
 * ── ПОЧЕМУ ЭТО НЕ ДЫРА ─────────────────────────────────────────────────────
 *
 * Две независимые преграды, и обе обязательны:
 *
 *  1. `import.meta.env.DEV`. В продакшен-сборке ветка вычисляется как `false`
 *     на этапе сборки, и весь модуль выбрасывается минификатором. Проверка
 *     `telegram-dev-mock.test.ts` собирает бандл и ищет в нём метку — если
 *     подставка туда попала, тест падает.
 *
 *  2. Явная просьба в адресе: `?mock-telegram=<id>`. Без неё подставка не
 *     включается даже в режиме разработки — случайно запущенный dev-сервер
 *     не превращается в «все вошли». Подмена ответа на выдачу кода требует
 *     ВТОРОГО согласия: `&mock-pair-code=12345678`.
 *
 * И главное: подставка НЕ ДАЁТ ДОСТУПА. Она подделывает то, что видит КЛИЕНТ,
 * — имя, факт «мы внутри Telegram» и строку `initData`. Но строка эта заведомо
 * негодная: в ней нет поля `hash`, и сервер отвергает её первой же проверкой.
 * Подписать по-настоящему нельзя, ключа бота здесь нет — в этом и смысл
 * подписи. Поэтому любой запрос за данными человека получает честный 401.
 *
 * Видно оформление, не содержимое: ровно то, что нужно, чтобы смотреть на
 * экраны, и ровно то, чего мало для входа.
 */

const МЕТКА = 'mock-telegram'

interface ПодставнойПользователь {
  id: number
  first_name: string
  username?: string
}

/**
 * Включить подставку, если попросили и если это сборка для разработки.
 *
 * Зовётся ОДИН раз, до монтирования приложения: `getWebApp()` читает
 * `window.Telegram` при каждом обращении, но `TelegramProvider` смотрит на него
 * при монтировании, и подставка, поставленная позже, уже никого не убедит.
 */
export function включитьПодставнойTelegram(): void {
  if (!import.meta.env.DEV) return
  if (typeof window === 'undefined') return

  const параметры = new URLSearchParams(window.location.search)
  const запрошено = параметры.get(МЕТКА)
  if (!запрошено) return

  // Уже настоящий Telegram — не трогаем. Подставка, затирающая живой WebApp,
  // сделала бы отладку внутри Telegram невозможной.
  if (
    window.Telegram?.WebApp?.platform &&
    window.Telegram.WebApp.platform !== 'unknown'
  ) {
    return
  }

  const id = Number(запрошено)
  const пользователь: ПодставнойПользователь = {
    id: Number.isSafeInteger(id) && id > 0 ? id : 144022504,
    first_name: параметры.get('mock-name') || 'Разработка',
    username: параметры.get('mock-username') || undefined,
  }

  const WebApp = {
    platform: 'ios',
    version: '7.0',
    colorScheme: 'dark',
    themeParams: {},
    /*
     * СТРОКА ЗАВЕДОМО ПОДДЕЛЬНАЯ, И ЭТО НАПИСАНО В НЕЙ САМОЙ.
     *
     * Пустая строка была бы честнее по букве, но тогда экраны за
     * `hasVerifiableInitData()` — включая весь Профиль и экран кода входа —
     * остаются закрыты, и смотреть по-прежнему не на что.
     *
     * Поэтому строка есть, но она НЕ ПРИТВОРЯЕТСЯ настоящей: в ней нет поля
     * `hash`, и сервер отвергнет её первой же проверкой. Слово `mock` внутри
     * видно в любом журнале и в любой вкладке «Сеть».
     */
    initData: `user=${encodeURIComponent(
      JSON.stringify(пользователь)
    )}&auth_date=${Math.floor(Date.now() / 1000)}&mock=1`,
    initDataUnsafe: { user: пользователь },
    /*
     * ЭТОТ МЕТОД ОБЯЗАТЕЛЕН, И ЕГО ОТСУТСТВИЕ СТОИЛО ЧАСА.
     *
     * Первая версия подставки его не имела. `useTelegramWebApp()` зовёт
     * `isVersionAtLeast` при монтировании — вызов `undefined` бросал, цепочка
     * эффектов обрывалась, автологин не срабатывал, и профиль показывал «нет
     * подписи», при том что и подпись, и пользователь были на месте.
     *
     * Подставка, у которой не хватает метода, ломает приложение ТИШЕ, чем его
     * отсутствие: она выглядит работающей и врёт о причине.
     */
    isVersionAtLeast: () => true,
    ready() {},
    expand() {},
    close() {},
    HapticFeedback: {
      selectionChanged() {},
      impactOccurred() {},
      notificationOccurred() {},
    },
    BackButton: { show() {}, hide() {}, onClick() {}, offClick() {} },
    MainButton: {
      show() {},
      hide() {},
      setText() {},
      onClick() {},
      offClick() {},
    },
    onEvent() {},
    offEvent() {},
    setHeaderColor() {},
    setBackgroundColor() {},
    enableClosingConfirmation() {},
    disableVerticalSwipes() {},
  }

  // cyrillic-ok-next-line: pre-existing local name
  installFullscreenMock(WebApp, параметры.get('mock-fullscreen'))

  ;(window as unknown as { Telegram?: unknown }).Telegram = { WebApp }

  подставитьКодСпаривания(параметры)

  // Громко и в консоль: тихая подставка — это способ однажды принять её за
  // настоящий вход и час искать несуществующую ошибку сервера.
  console.warn(
    `[${МЕТКА}] Telegram ПОДДЕЛАН для разработки: id=${пользователь.id}. ` +
      'Подписи нет — запросы к серверу за чужими данными получат 401.'
  )
}

/**
 * A PHONE IN FULLSCREEN, FOR LOOKING AT THE TOP OF EVERY SCREEN.
 *
 * `?mock-telegram=1&mock-fullscreen=59,46` -- the device inset and the room
 * Telegram's own buttons take, in pixels; bare `mock-fullscreen=1` means an
 * iPhone with a Dynamic Island (59 and 46).
 *
 * Fullscreen moves the app's whole box down (styles/telegram.css), and the
 * only place that could be seen was a real phone after a deploy. The mock
 * answers `requestFullscreen()` the way the client does -- it flips
 * `isFullscreen`, publishes the insets and fires `fullscreenChanged` -- and it
 * DRAWS what would cover the page: the status bar strip and the two floating
 * pills. Without the drawing a header sitting under Telegram's Close button
 * looks perfectly fine in a browser.
 *
 * Installed onto the mock itself rather than spread into it: `isFullscreen`
 * is read later, and a spread would have copied today's `false` for good.
 */
function installFullscreenMock(
  target: Record<string, unknown>,
  request: string | null
): void {
  if (!request) return
  const [device, content] = request.split(',').map(Number)
  const deviceTop = Number.isFinite(device) && device > 1 ? device : 59
  const contentTop = Number.isFinite(content) && content > 0 ? content : 46

  const listeners = new Map<string, Set<() => void>>()
  const emit = (name: string) => listeners.get(name)?.forEach(cb => cb())
  const zero = { top: 0, bottom: 0, left: 0, right: 0 }

  Object.assign(target, {
    version: '8.0',
    isFullscreen: false,
    viewportHeight: window.innerHeight,
    viewportStableHeight: window.innerHeight,
    safeAreaInset: { ...zero },
    contentSafeAreaInset: { ...zero },
    onEvent(name: string, cb: () => void) {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name)!.add(cb)
    },
    offEvent(name: string, cb: () => void) {
      listeners.get(name)?.delete(cb)
    },
    setBottomBarColor() {},
    requestFullscreen() {
      target.isFullscreen = true
      target.safeAreaInset = { ...zero, top: deviceTop, bottom: 34 }
      target.contentSafeAreaInset = { ...zero, top: contentTop }
      drawTelegramChrome(deviceTop, contentTop)
      emit('fullscreenChanged')
    },
    exitFullscreen() {
      target.isFullscreen = false
      target.safeAreaInset = { ...zero }
      target.contentSafeAreaInset = { ...zero }
      document.getElementById('mock-telegram-chrome')?.remove()
      emit('fullscreenChanged')
    },
  })
}

/**
 * What the phone and the client put over the page in fullscreen. A child of
 * <html>, not of <body>: the body becomes a transformed box in fullscreen, and
 * this strip has to stay glued to the top of the screen the way the real one
 * is.
 */
function drawTelegramChrome(deviceTop: number, contentTop: number): void {
  document.getElementById('mock-telegram-chrome')?.remove()
  const strip = document.createElement('div')
  strip.id = 'mock-telegram-chrome'
  strip.style.cssText =
    `position:fixed;top:0;left:0;right:0;height:${deviceTop + contentTop}px;` +
    'z-index:2147483647;pointer-events:none;font:600 15px system-ui;color:#fff'
  const pill =
    'position:absolute;height:32px;border-radius:16px;padding:0 12px;' +
    'display:flex;align-items:center;background:rgba(120,120,128,.55)'
  const pillTop = deviceTop + (contentTop - 32) / 2
  strip.innerHTML =
    `<div style="position:absolute;top:0;left:0;right:0;height:${deviceTop}px;` +
    'display:flex;align-items:flex-end;justify-content:space-between;' +
    'padding:0 28px 8px;box-sizing:border-box;outline:1px dashed rgba(255,80,80,.7)">' +
    '<span>9:41</span><span>5G 100%</span></div>' +
    `<div style="${pill};top:${pillTop}px;left:12px">Close</div>` +
    `<div style="${pill};top:${pillTop}px;right:12px">&middot;&middot;&middot;</div>`
  document.documentElement.appendChild(strip)
}

/**
 * Фиктивный ответ на выдачу кода — чтобы увидеть САМ ЭКРАН кода.
 *
 * Без этого экран спаривания недостижим локально ни при каких условиях:
 * настоящий `/api/auth/pair/start` требует подписи, которой у разработки нет
 * и не может быть. А смотреть надо именно на него: код вырос с шести цифр до
 * восьми, и всё, что с ним связано — группировка, ширина поля, перенос строк —
 * до сих пор ни разу не показывалось человеку.
 *
 * Подменяется РОВНО ОДИН адрес. Всё остальное уходит в настоящий `fetch`, и
 * ответ на него будет настоящим отказом: подставка показывает вёрстку, а не
 * выдаёт доступ.
 */
function подставитьКодСпаривания(параметры: URLSearchParams): void {
  const код = параметры.get('mock-pair-code')
  if (!код) return

  const настоящий = window.fetch.bind(window)
  window.fetch = async (вход: RequestInfo | URL, опции?: RequestInit) => {
    const адрес =
      typeof вход === 'string'
        ? вход
        : вход instanceof URL
          ? вход.href
          : вход.url
    if (адрес.includes('/api/auth/pair/start')) {
      console.warn(`[${МЕТКА}] выдача кода ПОДДЕЛАНА: ${код}`)
      return new Response(JSON.stringify({ code: код, expires_in: 120 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return настоящий(вход, опции)
  }
}
