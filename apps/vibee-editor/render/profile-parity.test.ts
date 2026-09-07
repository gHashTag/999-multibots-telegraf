import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * ПРОФИЛЬ ДОЛЖЕН БЫТЬ ОДНИМ И ТЕМ ЖЕ ЭКРАНОМ В ВЕБЕ И В ПРИЛОЖЕНИИ.
 *
 * Владелец 07.09.2026: «страницы профиля должны совпадать по логике и дизайну
 * — сайт и в мобиле».
 *
 * Первое измеренное расхождение было не про вёрстку: сервер отдаёт по
 * `/api/users/:username` семнадцать полей, веб читает счётчики и обложку, а
 * `API.Profile` в Swift разбирал ЧЕТЫРЕ. Данные приходили и молча терялись при
 * декодировании — то есть на iPhone профиль был беднее не потому, что «не
 * успели показать».
 *
 * Этот файл сторожит СОВПАДЕНИЕ, а не вёрстку. Он не может проверить, как
 * выглядит экран (для этого есть запуск в симуляторе), но может проверить, что
 * два клиента говорят об одном и том же человеке одними и теми же величинами.
 */

const КОРЕНЬ = path.join(__dirname, '..', '..', '..')
const читать = (...ч: string[]) => fs.readFileSync(path.join(КОРЕНЬ, ...ч), 'utf8')

const ВЕБ_ШАПКА = читать(
  'apps', 'vibee-editor', 'player', 'src', 'components', 'Profile', 'ProfileHeader.tsx'
)
const IOS_API = читать('apps', 'vibee-ios', 'Vibee', 'API.swift')
const IOS_ЭКРАН = читать('apps', 'vibee-ios', 'Vibee', 'ProfileScreen.swift')

/** Поля, по которым веб строит ряд счётчиков. */
const СЧЁТЧИКИ = [
  'followers_count',
  'following_count',
  'templates_count',
  'total_views',
  'total_likes',
]

describe('оба клиента читают одни и те же поля профиля', () => {
  it('веб действительно строит ряд из этих пяти — иначе список устарел', () => {
    // Если веб перестал их показывать, менять надо ЭТОТ список, а не молча
    // расходиться с приложением.
    for (const поле of СЧЁТЧИКИ) {
      expect(ВЕБ_ШАПКА, `веб не читает ${поле}`).toContain(`profile.${поле}`)
    }
  })

  it('iOS РАЗБИРАЕТ те же пять полей', () => {
    /*
     * Здесь и было расхождение: `Profile: Decodable` знал четыре поля из
     * семнадцати, и счётчики выбрасывались при декодировании.
     */
    const от = IOS_API.indexOf('struct Profile: Decodable')
    expect(от, 'структура Profile не найдена').toBeGreaterThan(0)
    const структура = IOS_API.slice(от, IOS_API.indexOf('}', от))
    for (const поле of СЧЁТЧИКИ) {
      expect(структура, `iOS не разбирает ${поле}`).toContain(поле)
    }
  })

  it('поля счётчиков в iOS НЕОБЯЗАТЕЛЬНЫЕ', () => {
    /*
     * `Decodable` со строгим полем падает ЦЕЛИКОМ на первом ответе, где поля
     * нет, и человек получает пустой экран профиля вместо недостающего числа.
     */
    const от = IOS_API.indexOf('struct Profile: Decodable')
    const структура = IOS_API.slice(от, IOS_API.indexOf('}', от))
    for (const поле of СЧЁТЧИКИ) {
      // Проверяем ТОЧНУЮ строку, а не регулярку: в первой версии экранирование
      // съело смысл, и сторож падал на верном коде — обвинял невиновного.
      expect(
        структура,
        `${поле} обязателен — один пустой ответ уронит весь профиль`
      ).toContain(`${поле}: Int?`)
    }
  })

  it('iOS ПОКАЗЫВАЕТ счётчики, а не только разбирает', () => {
    // Разобрать и не показать — это то же расхождение, только дороже: данные
    // уже пришли.
    for (const поле of СЧЁТЧИКИ) {
      expect(IOS_ЭКРАН, `${поле} разобран, но не показан`).toContain(поле)
    }
  })

  it('подписи и ПОРЯДОК совпадают с вебом', () => {
    /*
     * Порядок — не вкусовщина. Человек, привыкший к вебу, читает вторую
     * колонку как «подписки» и не перепроверяет её: переставленные числа он
     * запомнит неверно.
     */
    const от = IOS_ЭКРАН.indexOf('счётчики(_ p: API.Profile)')
    const блок = IOS_ЭКРАН.slice(от, от + 700)
    const порядокIOS = СЧЁТЧИКИ.map(п => блок.indexOf(п))
    expect(порядокIOS.every(i => i > 0), 'не все счётчики в блоке').toBe(true)
    expect([...порядокIOS].sort((a, b) => a - b)).toEqual(порядокIOS)

    for (const подпись of ['ПОДПИСЧИКИ', 'ПОДПИСКИ', 'ВИДЕО', 'ПРОСМОТРЫ', 'ЛАЙКИ']) {
      expect(блок, `нет подписи ${подпись}`).toContain(подпись)
    }
  })

  it('SOUL.md есть в обоих клиентах и берётся одним адресом', () => {
    /*
     * Визитка, по которой человека находят люди и агенты. В вебе карточка
     * была, на телефоне — не было вовсе, при том что сервер отдаёт текст тем
     * же адресом. Один источник обязателен: два разных — это две разные
     * визитки одного человека.
     */
    const веб = читать(
      'apps', 'vibee-editor', 'player', 'src', 'components', 'Profile', 'SoulCard.tsx'
    )
    const ios = читать('apps', 'vibee-ios', 'Vibee', 'API.swift')
    expect(веб).toContain('/api/soul/')
    expect(ios).toContain('api/soul/')
    expect(IOS_ЭКРАН).toContain('карточкаSoul')
  })

  it('свёртка SOUL одинаковая: шесть строк и та же кнопка', () => {
    // Человек, знающий веб, ищет ту же кнопку на том же месте.
    const веб = читать(
      'apps', 'vibee-editor', 'player', 'src', 'components', 'Profile', 'SoulCard.tsx'
    )
    expect(веб).toContain('СТРОК_В_ПРЕВЬЮ = 6')
    expect(IOS_ЭКРАН).toContain('строкВПревью = 6')
    for (const слово of ['Читать целиком', 'Свернуть']) {
      expect(веб, `веб потерял «${слово}»`).toContain(слово)
      expect(IOS_ЭКРАН, `iOS потерял «${слово}»`).toContain(слово)
    }
  })

  it('подключение Telegram есть в обоих, и согласие идёт ДО телефона', () => {
    /*
     * Человек отдаёт доступ к своей переписке. Форма, умалчивающая о
     * последствиях, — фишинг по форме, чем бы она ни была по намерению.
     * Поэтому проверяется не только наличие экрана, но и ПОРЯДОК: факты выше
     * поля ввода.
     */
    const веб = читать(
      'apps', 'vibee-editor', 'player', 'src', 'components', 'Profile', 'ConnectTelegram.tsx'
    )
    const ios = читать('apps', 'vibee-ios', 'Vibee', 'ConnectTelegram.swift')
    for (const текст of [веб, ios]) {
      expect(текст).toContain('читать ваши диалоги')
      expect(текст).toContain('не сохраняются')
    }
    /*
     * Порядок сверяется по МЕСТУ ОТРИСОВКИ, а не по месту объявления.
     *
     * Первая версия сравнивала позиции самих строк в файле и падала на Swift:
     * список фактов объявлен `private static let факты` НИЖЕ формы, хотя
     * рисуется выше неё. Тест проверял бы порядок строк в исходнике —
     * величину, не имеющую отношения к тому, что видит человек.
     */
    expect(веб.indexOf('читать ваши диалоги')).toBeLessThan(веб.indexOf('+7 999'))
    expect(ios.indexOf('ForEach(Self.факты')).toBeLessThan(ios.indexOf('+7 999'))
    expect(IOS_ЭКРАН).toContain('ConnectTelegramView()')
  })

  it('пустое @имя не роняет профиль на iOS', () => {
    /*
     * Сервер отвечает 200 с `username: null`, когда публиковать ещё нечего.
     * Необязательное поле в `Decodable` роняло ВЕСЬ экран, и человек, впервые
     * открывший приложение, видел «Профиль не загрузился».
     */
    const ios = читать('apps', 'vibee-ios', 'Vibee', 'API.swift')
    expect(ios).toContain('let username: String?')
    expect(ios).toContain('имениНет')
    expect(IOS_ЭКРАН).toContain('API.ПрофильError')
  })

  it('«Ждут одобрения» есть в обоих и берёт те же адреса', () => {
    /*
     * САМАЯ ДОРОГАЯ ИЗ НАЙДЕННЫХ ПОТЕРЬ.
     *
     * Все чтения ленты фильтруют `is_public = TRUE`, поэтому неодобренный
     * ролик не виден НИГДЕ, кроме этого раздела. Пока его не было на телефоне,
     * владелец, живущий в приложении, не узнавал о сделанном агентом вообще:
     * работа лежала в базе и была невидима отовсюду, навсегда.
     */
    const веб = читать(
      'apps', 'vibee-editor', 'player', 'src', 'components', 'Profile', 'ProfilePending.tsx'
    )
    const ios = читать('apps', 'vibee-ios', 'Vibee', 'API.swift')
    for (const адрес of ['api/feed/pending', 'api/feed/approve']) {
      expect(веб, `веб потерял ${адрес}`).toContain(адрес)
      expect(ios, `iOS не знает ${адрес}`).toContain(адрес)
    }
    expect(IOS_ЭКРАН).toContain('ждутОдобрения')
  })

  it('карточка исчезает ТОЛЬКО после успеха — в обоих клиентах', () => {
    /*
     * Убрать её сразу «для отзывчивости» значит сказать «опубликовано» там,
     * где публикации не было: человек уходит уверенным, ролик лежит дальше, и
     * второй раз он туда не заглянет.
     *
     * В вебе это уже записано словами в комментарии; здесь проверяется, что
     * удаление стоит ПОСЛЕ успешного запроса, а не до него.
     */
    const веб = читать(
      'apps', 'vibee-editor', 'player', 'src', 'components', 'Profile', 'ProfilePending.tsx'
    )
    expect(веб.indexOf('if (!о.ok) throw')).toBeLessThan(веб.indexOf('setСписок(с =>'))
    expect(IOS_ЭКРАН.indexOf('try await API.одобрить')).toBeLessThan(
      IOS_ЭКРАН.indexOf('ожидают.removeAll')
    )
  })

  it('iOS разбирает id и строкой, и числом', () => {
    /*
     * Измерено на живом ответе: сервер отдаёт `{"id":"51"}` — СТРОКОЙ.
     * Объявленный `Int` ронял разбор целиком, и раздел выглядел бы рабочим и
     * всегда пустым: худший вид поломки, потому что жаловаться не на что.
     */
    const ios = читать('apps', 'vibee-ios', 'Vibee', 'API.swift')
    const от = ios.indexOf('struct Ожидающий')
    const блок = ios.slice(от, от + 1800)
    expect(блок).toContain('decode(Int.self, forKey: .id)')
    expect(блок).toContain('decode(String.self, forKey: .id)')
  })

  it('iOS читает ответ той формы, что отдаёт сервер', () => {
    // Сервер отвечает `{ success, templates }`. Разбор, ждущий `items`, вернул
    // бы пустой список молча.
    const сервер = читать('apps', 'vibee-editor', 'render', 'render-server.ts')
    expect(сервер).toContain("success: true, templates: r.rows")
    const ios = читать('apps', 'vibee-ios', 'Vibee', 'API.swift')
    expect(ios).toContain('let templates: [Ожидающий]?')
  })

  it('план берётся ТЕМИ ЖЕ инструментами, что у агента', () => {
    /*
     * План — это то, чем человек и агент обмениваются работой. Завести рядом
     * отдельный REST значило бы два описания одного списка: одно для человека,
     * другое для агента. Они разойдутся, и первым это заметит тот, кто
     * попросит агента «отметь, что вышло», а в приложении увидит прежнее.
     */
    const веб = читать(
      'apps', 'vibee-editor', 'player', 'src', 'components', 'Profile', 'ProfilePlan.tsx'
    )
    const ios = читать('apps', 'vibee-ios', 'Vibee', 'API.swift')
    for (const инструмент of ['plan_list', 'plan_item_update']) {
      expect(веб, `веб потерял ${инструмент}`).toContain(инструмент)
      expect(ios, `iOS не знает ${инструмент}`).toContain(инструмент)
    }
    expect(ios).toContain('tools/call')
    expect(IOS_ЭКРАН).toContain('карточкаПлана')
  })

  it('круг статусов одинаковый: замысел → в работе → вышло → замысел', () => {
    /*
     * Разный круг на двух экранах означал бы, что одно нажатие даёт разный
     * результат в зависимости от того, где нажали, — и человек перестанет
     * доверять кнопке.
     */
    const веб = читать(
      'apps', 'vibee-editor', 'player', 'src', 'components', 'Profile', 'ProfilePlan.tsx'
    )
    expect(веб).toMatch(/замысел:\s*'doing'/)
    expect(веб).toMatch(/'в работе':\s*'done'/)
    expect(веб).toMatch(/вышло:\s*'idea'/)

    const ios = читать('apps', 'vibee-ios', 'Vibee', 'API.swift')
    const от = ios.indexOf('func следующийСтатус')
    const круг = ios.slice(от, от + 320)
    expect(круг).toContain('case "замысел": return "doing"')
    expect(круг).toContain('case "в работе": return "done"')
    expect(круг).toContain('return "idea"')
  })

  it('счётчик «сделано» считает одно и то же', () => {
    // В вебе это `статус === 'вышло'`; расхождение дало бы два разных ответа
    // на вопрос «как идёт».
    const веб = читать(
      'apps', 'vibee-editor', 'player', 'src', 'components', 'Profile', 'ProfilePlan.tsx'
    )
    expect(веб).toContain("статус === 'вышло'")
    expect(IOS_API).toContain('$0.статус == "вышло"')
  })

  it('JSON-RPC ошибка не превращается в пустой план', () => {
    /*
     * JSON-RPC отвечает 200 И на ошибку — она лежит в поле `error`. Молча
     * вернуть пустоту значило бы показать пустой план вместо причины: человек
     * решит, что плана нет, и заведёт второй.
     */
    const ios = читать('apps', 'vibee-ios', 'Vibee', 'API.swift')
    const от = ios.indexOf('private static func инструмент')
    const блок = ios.slice(от, от + 1400)
    expect(блок).toContain('тело["error"]')
    expect(блок).toContain('throw')
  })

  it('сокращение тысяч одинаковое: 1.2K и 3.4M', () => {
    // Иначе одно и то же число выглядит на двух экранах по-разному, и человек
    // решает, что видит разные величины.
    expect(ВЕБ_ШАПКА).toContain("toFixed(1)}K")
    expect(ВЕБ_ШАПКА).toContain("toFixed(1)}M")
    expect(IOS_ЭКРАН).toContain('%.1fK')
    expect(IOS_ЭКРАН).toContain('%.1fM')
  })
})
