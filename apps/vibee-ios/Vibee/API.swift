import Foundation

enum API {
  /// Тот же сервер, в который ходит веб-клиент. Ничего не форкаем.
  static let base = URL(string: "https://vibee-render-production.up.railway.app")!

  /// Поля названы ровно так, как их отдаёт сервер — проверено живым запросом,
  /// а не выведено из типов веб-клиента. Необязательные поля действительно
  /// приходят null (creatorAvatar, thumbnailUrl), поэтому они Optional.
  struct Template: Decodable, Identifiable {
    let id: String
    let creatorName: String
    let creatorUsername: String
    let creatorAvatar: String?
    let name: String
    let description: String
    let videoUrl: String
    /**
     * Обложка. Поле упоминалось в комментарии выше как «приходит null» — и
     * НЕ БЫЛО ОБЪЯВЛЕНО ВОВСЕ, поэтому приложение его не читало. Сервер
     * отдаёт `thumbnailUrl` на обоих маршрутах; в профиле карточки при этом
     * оставались чёрными, и выглядело это как отсутствие данных, хотя данные
     * приходили.
     *
     * Optional по-настоящему: у роликов, опубликованных до появления обложек,
     * значение null и останется таким, пока их не дозаполнят.
     */
    let thumbnailUrl: String?
    let viewsCount: Int
    let starsCount: Int
    let createdAt: String
    /**
     * Лайки. ОБА поля необязательные, и это не перестраховка.
     *
     * `isLiked` сервер считает LEFT JOIN'ом по `user_id` из строки запроса
     * (render-server.ts:5747): без параметра поле приходит `false` у всего,
     * а маршрут `/api/users/:username/templates` (render-server.ts:6350)
     * не отдаёт его ВОВСЕ. Тот же `Template` декодируется с обоих адресов —
     * сделай поле обязательным, и лента автора перестанет разбираться
     * целиком: вместо роликов человек увидит «Лента не загрузилась».
     */
    let likesCount: Int?
    let isLiked: Bool?
  }

  /**
   * Отказ действия, который НЕ СТЫДНО ПОКАЗАТЬ.
   *
   * Каждый случай различается словами, потому что человеку нужны разные
   * действия: при `нуженВход` — зайти в Профиль, при `сеть` — подождать, при
   * `отказ` — сообщить о поломке. Один общий текст «не получилось» стоил бы
   * ровно того же, что молчащая кнопка.
   */
  enum ActionError: LocalizedError {
    case нуженВход
    case отказ(Int)
    case странныйОтвет
    case сеть(Error)

    var errorDescription: String? {
      switch self {
      case .нуженВход:
        return "Нужен вход: Профиль → войти по коду из мини-аппа"
      case .отказ(let код):
        return "Сервер отказал: HTTP \(код)"
      case .странныйОтвет:
        return "Сервер ответил не тем, чего ждали"
      case .сеть(let e):
        return "Не дошло до сервера: \(e.localizedDescription)"
      }
    }
  }

  private struct FeedResponse: Decodable { let templates: [Template] }

  /**
   * Карточка профиля. Поля названы так, как их отдаёт сервер — проверено
   * живым запросом (`/api/users/t27_dev`), а не выведено из веб-клиента.
   * Сервер здесь отвечает в snake_case, а лента — в camelCase: два разных
   * маршрута, две разные привычки. Молча «причесать» их значило бы получить
   * nil там, где данные есть.
   */
  /**
   * ПРОФИЛЬ. Поля те же, что читает веб, — иначе два клиента показывают
   * РАЗНОГО человека по одному и тому же ответу.
   *
   * Найдено 07.09.2026 по просьбе владельца «страницы профиля должны
   * совпадать по логике и дизайну». Сервер отдаёт семнадцать полей, а здесь
   * разбирались четыре: счётчики, обложка и галочка молча выбрасывались при
   * декодировании. Не «не успели показать» — данные приходили и терялись.
   *
   * Все новые поля НЕОБЯЗАТЕЛЬНЫЕ. `Decodable` со строгим полем падает целиком
   * на первом же ответе, где поля нет, — и вместо недостающего счётчика
   * человек получил бы пустой экран профиля.
   */
  struct Profile: Decodable {
    let username: String
    let display_name: String?
    let bio: String?
    let avatar_url: String?
    let cover_url: String?
    let is_verified: Bool?
    let followers_count: Int?
    let following_count: Int?
    let templates_count: Int?
    let total_views: Int?
    let total_likes: Int?
  }

  /**
   * Профиль по своему telegram_id: единственное, что приложение о себе знает.
   *
   * ── ИМЯ ПРИХОДИТ ПУСТЫМ, И ЭТО ОБЫЧНОЕ ДЕЛО ──────────────────────────────
   *
   * Найдено аудитом паритета 07.09.2026. `GET /api/users/id/:telegram_id`
   * отвечает **200** с `username: null`, когда у человека ещё нет
   * опубликованного профиля (render-server.ts:9122-9134). Здесь стояло
   * `let username: String` — НЕобязательное поле, — и `JSONDecoder` бросал.
   *
   * Ронялся при этом не запрос, а ВЕСЬ ЭКРАН: человек видел «Профиль не
   * загрузился» и ни слова о том, что загружать нечего. То есть у всякого,
   * кто ещё ничего не опубликовал, профиль в приложении не открывался вовсе —
   * а это ровно те, кто пришёл первый раз.
   *
   * Поле необязательное, а отсутствие имени — отдельный, названный случай.
   */
  enum ПрофильError: LocalizedError {
    case имениНет

    var errorDescription: String? {
      switch self {
      case .имениНет:
        return "Профиль ещё не создан: у аккаунта нет @имени. "
          + "Задайте его в Telegram («Настройки» → «Имя пользователя») и вернитесь."
      }
    }
  }

  static func profile(telegramId: String) async throws -> Profile {
    struct ById: Decodable { let username: String? }
    let (d, _) = try await URLSession.shared.data(
      from: base.appendingPathComponent("api/users/id/\(telegramId)"))
    let имя = (try? JSONDecoder().decode(ById.self, from: d))?.username
    guard let имя, !имя.isEmpty else { throw ПрофильError.имениНет }
    return try await profile(username: имя)
  }

  /**
   * SOUL — визитка человека, которую читают и люди, и агенты.
   *
   * Тот же адрес, что у веба (`SoulCard.tsx:76`): один источник, иначе два
   * клиента однажды покажут разные визитки одного человека.
   *
   * Пустой SOUL — НЕ ошибка: у большинства его просто нет. Поэтому здесь
   * `String?`, а не бросок: отсутствие визитки не должно ронять профиль.
   */
  static func soul(username: String) async throws -> String? {
    struct Ответ: Decodable { let soul: String? }
    let (d, resp) = try await URLSession.shared.data(
      from: base.appendingPathComponent("api/soul/\(username)"))
    guard (resp as? HTTPURLResponse)?.statusCode == 200 else { return nil }
    let текст = try? JSONDecoder().decode(Ответ.self, from: d).soul
    let чистый = текст?.trimmingCharacters(in: .whitespacesAndNewlines)
    return (чистый?.isEmpty ?? true) ? nil : чистый
  }

  static func profile(username: String) async throws -> Profile {
    let (d, _) = try await URLSession.shared.data(
      from: base.appendingPathComponent("api/users/\(username)"))
    return try JSONDecoder().decode(Profile.self, from: d)
  }

  /**
   * Остаток токенов и цены — ОДНИМ запросом.
   *
   * Цены приходят с сервера, а не зашиты здесь. Своя копия таблицы означала бы
   * два источника одной правды: сервер поднял цену видео, приложение об этом
   * не узнало и продолжило обещать доступное — то есть врать ровно там, где
   * речь о деньгах.
   *
   * Требует подписи: маршрут отдаёт остаток только тому, чью подпись проверил.
   */
  /**
   * Положить файл на S3 и получить ссылку.
   *
   * Маршрут `/upload` принимает СЫРОЕ тело и имя в заголовке `X-Filename` —
   * не multipart. Это уже готовый транспорт, которым пользуется рендер;
   * заводить второй ради приложения было бы второй правдой об одном и том же.
   *
   * Возвращает абсолютную ссылку: относительная доедет до KieAI как мусор,
   * и провайдер откажет по причине, из которой ничего не понять.
   */
  static func положитьФайл(_ данные: Data, имя: String, тип: String) async throws -> String {
    var з = URLRequest(url: base.appendingPathComponent("upload"))
    з.httpMethod = "POST"
    з.setValue(тип, forHTTPHeaderField: "Content-Type")
    з.setValue(имя, forHTTPHeaderField: "X-Filename")
    /*
     * ЛИЧНОСТЬ — ТЕМ ЖЕ СПОСОБОМ, ЧТО И ВЕЗДЕ.
     *
     * Первая версия ушла без заголовков, и загрузка отвечала
     * «unauthorized: no X-Api-Key and no Telegram initData» — дословно тот
     * случай, ради которого в этом цикле и записано главное правило. Общий
     * сторож принимает `Authorization: Bearer` (auth.ts:496), то есть сессию
     * приложения; чинить надо было вызов, а не сервер.
     *
     * Нашлось потому, что отказ показан НА ЭКРАНЕ словами. Молчаливый провал
     * выглядел бы как «кнопка не нажимается».
     */
    for (k, v) in Identity.headers() { з.setValue(v, forHTTPHeaderField: k) }
    з.httpBody = данные
    з.timeoutInterval = 120
    let (d, о) = try await URLSession.shared.data(for: з)
    guard let к = (о as? HTTPURLResponse)?.statusCode, (200..<300).contains(к) else {
      let текст = String(data: d, encoding: .utf8) ?? ""
      throw NSError(
        domain: "upload", code: (о as? HTTPURLResponse)?.statusCode ?? -1,
        userInfo: [NSLocalizedDescriptionKey: текст.isEmpty ? "загрузка не удалась" : текст]
      )
    }
    struct Ответ: Decodable { let url: String? }
    guard let ссылка = try? JSONDecoder().decode(Ответ.self, from: d).url, !ссылка.isEmpty
    else { throw NSError(domain: "upload", code: -2,
      userInfo: [NSLocalizedDescriptionKey: "сервер не назвал ссылку"]) }
    return ссылка.hasPrefix("http")
      ? ссылка
      : base.appendingPathComponent(ссылка).absoluteString
  }

  /**
   * ГОЛОСА — С СЕРВЕРА, А НЕ СПИСКОМ В КОДЕ.
   *
   * В приложении стояли три имени: «Sarah», «Rachel», «Josh». Они уходили как
   * `voice_id` в нижнем регистре и не были идентификаторами голоса НИГДЕ —
   * ни у ElevenLabs, ни у MiniMax. Провайдер, который реально читает текст,
   * получал неизвестную строку, отбрасывал её и говорил голосом по умолчанию:
   * три попытки разными голосами стоили трижды и давали один файл.
   *
   * Маршрут `/api/voices` называет и голоса, и того, чьи они (`provider`) —
   * он же падает с ElevenLabs на MiniMax тем же порядком, что и озвучка.
   * Спрашивать его — единственный способ не завести четвёртый список.
   */
  struct Голос: Decodable, Hashable {
    let id: String
    let name: String
    let category: String?
  }

  private struct ОтветГолосов: Decodable {
    let voices: [Голос]?
    let provider: String?
  }

  /// Голоса того провайдера, который будет читать. Пустой список — не отказ:
  /// экран оставит запасные, лишь бы не показать пустую строку выбора.
  static func голоса() async throws -> [Голос] {
    let (d, _) = try await URLSession.shared.data(
      from: base.appendingPathComponent("api/voices"))
    return (try? JSONDecoder().decode(ОтветГолосов.self, from: d))?.voices ?? []
  }

  struct Баланс: Decodable {
    let balance: Int
    let prices: [String: Int]
    /**
     * Цены по МОДЕЛЯМ, ключ — то же имя, что уходит на сервер (`kie/<id>`).
     *
     * Цена по виду работы (`prices`) — не та сумма, которую списывают:
     * сервер берёт цену выбранной модели, а на вид падает лишь когда цены
     * модели нет. Замер расхождения на живом сервере:
     *
     *     картинка   обещали 1   списали 8
     *     липсинк    обещали 3   списали 6
     *     видео      обещали 20  списали 5
     *
     * Первые две строки — отказ ПОСЛЕ нажатия, ровно то, ради чего проверка
     * до нажатия и писана. Третья хуже: мы гасили кнопку человеку, которому
     * денег хватало.
     *
     * Необязательное: старый сервер поля не пришлёт — тогда работаем по виду,
     * как раньше.
     */
    let modelPrices: [String: Int]?
    /**
     * Какие цены — за секунду. Приходит С СЕРВЕРА, а не хранится здесь.
     *
     * Свой список у приложения уже был и был верен случайно: посекундный
     * сегодня только липсинк. Сделай видео посекундным на сервере — и
     * приложение продолжило бы обещать плоскую цену, а отказ пришёл бы уже
     * после нажатия. Необязательное: старый сервер поля не пришлёт, и это не
     * повод не показать баланс.
     */
    let perSecond: [String]?
    /**
     * Какие МОДЕЛИ считаются посекундно — именами, которые шлём мы сами.
     *
     * `perSecond` выше помечает ВИДЫ работы, и для видео такая пометка
     * невозможна: из двенадцати моделей восемь берут за секунду, четыре за
     * ролик. Пометив вид целиком, мы соврали бы одной половине списка.
     */
    let perSecondModels: [String]?
    /**
     * Какие из посекундных считаются ПО ЗАМЕРУ присланного файла.
     *
     * Для них точной суммы до нажатия нет ни у кого: длину задаёт файл. Экран
     * умножал цену на чип «6с/10с», который до провайдера не доходит вовсе —
     * один и тот же ролик обещал 96 или 160 токенов, а счёт приходил за
     * настоящую длину.
     */
    let perSecondFromFile: [String]?
    /**
     * Какие поля КАЖДАЯ модель действительно получит — пересечение её
     * контракта с тем, что умеет передать маршрут.
     *
     * У десяти видеомоделей из двенадцати контракт — один `prompt`, а экран
     * показывал «Длительность» и «Кадр» всем подряд: человек выбирал 9:16 для
     * рилса и получал то, что модель решила сама.
     */
    let modelFields: [String: [String]]?
    /**
     * Какие модели считаются ЗА ТЫСЯЧУ ЗНАКОВ. Сервер так и списывает, а
     * экран об этом молчал: цена росла с длиной текста, а подпись обещала
     * одно число, и сумму человек узнавал только из чека.
     */
    let perThousandCharsModels: [String]?
    /**
     * Освобождён ли этот кошелёк от списания (владелец из ADMIN_IDS).
     *
     * С него не списывают вовсе, а экран сверял остаток с ценой и гасил
     * кнопку — единственный счёт, с которого НИКОГДА не берут, оказался
     * единственным, кому запрещали работать. Признак приходит с сервера:
     * свой список админов в приложении разошёлся бы с серверным молча.
     *
     * Необязательное: старый сервер поля не пришлёт, и это не повод менять
     * поведение для всех.
     */
    let exempt: Bool?

    /// Сколько стоит шаг. Имена операций — с сервера (`TOKEN_PRICES`),
    /// поэтому здесь только соответствие «вид шага → имя операции».
    /// - Parameter модель: имя модели В ТОМ ЖЕ ВИДЕ, в каком уйдёт на сервер.
    /// Считается ли ЭТА модель посекундно. Вид работы спрашиваем только
    /// тогда, когда модель не выбрана или сервер её не назвал.
    /// Чем меряется цена этой модели: «с», «1000 зн.» или ничем (за вызов).
    func мера(_ операция: String, модель: String?) -> String? {
      if let м = модель, perThousandCharsModels?.contains(м) == true {
        return "1000 зн."
      }
      return посекундная(операция, модель: модель) ? "с" : nil
    }

    /**
     * ОТСУТСТВИЕ МОДЕЛИ В СПИСКЕ — ЭТО НЕ «ПЛОСКАЯ ЦЕНА».
     *
     * Здесь стоял ранний выход: раз список моделей непуст, ответ брали ТОЛЬКО
     * из него, а посекундный ВИД работы уже не спрашивали. Пока сервер валил
     * в список всё подряд, это сходило; теперь он присылает лишь те модели,
     * счёт за которые сам умножает, и липсинк оттуда законно ушёл — его длину
     * задаёт присланный звук, а не выбор на экране.
     *
     * С ранним выходом это стало бы ложью в другую сторону: липсинк считался
     * бы плоским, экран сверил бы остаток с ценой ОДНОЙ секунды и пропустил
     * нажатие, за которое сервер возьмёт вдесятеро. Отказ после нажатия —
     * ровно то, ради устранения чего проверка и появилась.
     *
     * Поэтому список моделей ДОБАВЛЯЕТ посекундность, а не отменяет её: нет
     * модели в списке — спрашиваем вид работы.
     */
    /// Доедет ли это поле до провайдера у выбранной модели.
    ///
    /// Неизвестная модель и старый сервер без списка отвечают ДА: прятать
    /// настройку на догадке хуже, чем показать лишнюю — так мы отняли бы
    /// работающий выбор.
    func полеДоходит(_ поле: String, модель: String?) -> Bool {
      guard let м = модель, let список = modelFields?[м] else { return true }
      return список.contains(поле)
    }

    /// Считается ли эта модель по замеру присланного файла: тогда сумму до
    /// нажатия не называем, только цену секунды.
    func поЗамеруФайла(_ модель: String?) -> Bool {
      guard let м = модель else { return false }
      return perSecondFromFile?.contains(м) == true
    }

    func посекундная(_ операция: String, модель: String? = nil) -> Bool {
      if let м = модель, perSecondModels?.contains(м) == true { return true }
      return (perSecond ?? []).contains(операция)
    }

    func цена(_ операция: String, модель: String? = nil) -> Int? {
      if let м = модель, let по = modelPrices?[м] { return по }
      return prices[операция]
    }
  }

  /**
   * Задачи генерации этого человека — для ПОДБОРА оборванного результата.
   *
   * Липсинк и видео идут минутами, и Railway рвёт соединение раньше, чем
   * провайдер отвечает: замер дал 502 «upstream error» на запросе, который при
   * повторе вернул готовый ролик. Работа при этом СДЕЛАНА и ОПЛАЧЕНА — теряется
   * только ответ по дороге, и это худший из исходов.
   *
   * Сервер заводит задачу до обращения к провайдеру (`startJob`), поэтому
   * оборванный запрос оставляет след, по которому результат можно забрать.
   */
  struct Задача: Decodable {
    let id: String
    let kind: String
    let state: String
    let startedAt: Double
    let url: String?
    let error: String?
  }

  static func задачи() async throws -> [Задача] {
    struct Ответ: Decodable { let jobs: [Задача] }
    let (d, http) = try await сЛичностью(
      URLRequest(url: base.appendingPathComponent("api/generate/jobs")))
    guard http.statusCode == 200 else { throw причина(d, http.statusCode) }
    return try JSONDecoder().decode(Ответ.self, from: d).jobs
  }

  static func баланс() async throws -> Баланс {
    let (d, http) = try await сЛичностью(
      URLRequest(url: base.appendingPathComponent("api/balance")))
    guard http.statusCode == 200 else { throw причина(d, http.statusCode) }
    return try JSONDecoder().decode(Баланс.self, from: d)
  }

  /// Ролики автора. Тот же `Template`, что и в ленте — сервер отдаёт одну
  /// форму на оба маршрута, и заводить вторую модель значило бы завести
  /// второе место, где она разойдётся.
  static func userTemplates(username: String) async throws -> [Template] {
    let (d, _) = try await URLSession.shared.data(
      from: base.appendingPathComponent("api/users/\(username)/templates"))
    return try JSONDecoder().decode(FeedResponse.self, from: d).templates
  }

  static func feed(page: Int = 0, limit: Int = 20) async throws -> [Template] {
    var c = URLComponents(url: base.appendingPathComponent("api/feed"),
                          resolvingAgainstBaseURL: false)!
    var q = [URLQueryItem(name: "page", value: "\(page)"),
             .init(name: "limit", value: "\(limit)"),
             .init(name: "sort", value: "recent")]
    /**
     * `user_id` — ЕДИНСТВЕННЫЙ способ узнать, что лайкнул ИМЕННО ЭТОТ человек.
     *
     * Сервер не выводит это из заголовка личности: `is_liked` считается
     * LEFT JOIN'ом по параметру строки запроса (render-server.ts:5747-5748).
     * Без параметра все сердечки приходят пустыми, и лента показывала бы
     * «не нравится» на роликах, которые человек уже отметил, — а первое же
     * нажатие снимало бы лайк вместо того, чтобы его поставить.
     */
    if let я = Identity.telegramId { q.append(.init(name: "user_id", value: я)) }
    c.queryItems = q
    let (data, _) = try await URLSession.shared.data(from: c.url!)
    return try JSONDecoder().decode(FeedResponse.self, from: data).templates
  }

  /**
   * POST с личностью и ОДНОЙ попыткой обновить протухшую сессию.
   *
   * Access-токен живёт час, а лента открыта дольше. Без этой ветки первое же
   * действие после протухания отвечало бы 401, и человек читал бы «нужен
   * вход», имея на руках живой refresh. Повтор ровно один: если и он получил
   * 401, сессии действительно нет и об этом надо сказать, а не крутить цикл.
   */
  private static func отправить(
    путь: String, тело: [String: Any]
  ) async throws -> (Data, Int) {
    func собрать() -> URLRequest {
      var r = URLRequest(url: base.appendingPathComponent(путь))
      r.httpMethod = "POST"
      r.setValue("application/json", forHTTPHeaderField: "Content-Type")
      for (k, v) in Identity.headers() { r.setValue(v, forHTTPHeaderField: k) }
      r.httpBody = try? JSONSerialization.data(withJSONObject: тело)
      return r
    }
    func выполнить(_ r: URLRequest) async throws -> (Data, Int) {
      do {
        let (d, resp) = try await URLSession.shared.data(for: r)
        return (d, (resp as? HTTPURLResponse)?.statusCode ?? 0)
      } catch {
        throw ActionError.сеть(error)
      }
    }
    var (data, код) = try await выполнить(собрать())
    if код == 401, await Identity.refreshSession() {
      (data, код) = try await выполнить(собрать())
    }
    return (data, код)
  }

  /**
   * Поставить или снять лайк. Возвращает состояние ПО ВЕРСИИ СЕРВЕРА.
   *
   * Сервер здесь — переключатель, а не счётчик: он смотрит в `template_likes`
   * и отвечает итогом (render-server.ts:5291-5332). Поэтому возвращаем его
   * ответ целиком, а не то, что нарисовали оптимистично: два устройства
   * одного человека иначе разъедутся навсегда.
   *
   * `telegram_id` идёт В ТЕЛЕ, потому что сервер читает его оттуда, а не из
   * заголовка личности. Без него — 400 `telegram_id_required`; проверено
   * живым запросом, поэтому отсутствие своего id отсекаем ЗДЕСЬ и отвечаем
   * человеку словами, а не гоняем заведомо мёртвый запрос.
   */
  static func like(templateId: String) async throws -> (liked: Bool, count: Int) {
    guard let я = Identity.telegramId else { throw ActionError.нуженВход }
    let (data, код) = try await отправить(
      путь: "api/feed/\(templateId)/like", тело: ["telegram_id": я])
    // 401 приходит от ОБЩЕГО гварда (auth.ts): ключ агента он не принимает,
    // только сессию или подпись мини-аппа. Для человека это тот же «войдите».
    if код == 401 { throw ActionError.нуженВход }
    guard (200...299).contains(код) else { throw ActionError.отказ(код) }
    struct Ответ: Decodable {
      let is_liked: Bool
      let likes_count: Int
    }
    guard let о = try? JSONDecoder().decode(Ответ.self, from: data) else {
      throw ActionError.странныйОтвет
    }
    return (о.is_liked, о.likes_count)
  }
  /**
   * Засчитать просмотр.
   *
   * ЗАЧЕМ. Веб делает это на каждом показанном ролике; нативная лента —
   * не делала, и всё, что смотрели в приложении, не попадало в счётчик.
   * Автор видел меньше просмотров, чем было на самом деле, и не мог понять,
   * почему цифры не растут.
   *
   * Это ровно тот класс потери, что и молчащий агент: разметку перенесли,
   * поведение — нет. Разница лишь в том, что здесь никто не жалуется —
   * недосчитанные просмотры не выглядят поломкой.
   *
   * Ошибку глотаем НАМЕРЕННО и молча: просмотр — не то, ради чего стоит
   * показывать человеку алерт или прерывать пролистывание. Но пишем в лог,
   * чтобы «счётчик не растёт» можно было объяснить, а не гадать.
   */
  static func trackView(templateId: String) async {
    do {
      let (_, код) = try await отправить(
        путь: "api/feed/\(templateId)/view", тело: [:])
      if !(200...299).contains(код) {
        NSLog("[Feed] просмотр не засчитан: HTTP \(код)")
      }
    } catch {
      NSLog("[Feed] просмотр не засчитан: \(error.localizedDescription)")
    }
  }

}

// MARK: - Проекты

/**
 * Проекты человека: таймлайн, который держит сервер.
 *
 * ЗАЧЕМ. Редактор открывал `Composition.демо` — выдумку, зашитую в код. Всё,
 * что человек в нём двигал, никуда не сохранялось и ниоткуда не приходило.
 * Экран выглядел работающим и не был подключён ни к чему; ровно тот класс,
 * который в этом репозитории уже трижды кончался правками в мёртвых файлах.
 *
 * Сервер до сих пор не умел хранить проект вовсе: маршрутов со словом project
 * не было ни одного (живой GET /api/projects отвечал 404 «Not found»). Поэтому
 * половина работы — серверная, `render/project-routes.ts`, и формы ниже
 * повторяют ЕЁ ответы, а не наоборот.
 *
 * ПОЧЕМУ snake_case В ПОЛЯХ. Так отвечает сам маршрут — он писался рядом с
 * маршрутами входа, у которых `access_token` и `telegram_id`. Причёсывать
 * имена на клиенте значит завести место, где они разойдутся молча.
 */
extension API {
  /// Строка списка: без композиции. Двадцать проектов не должны означать
  /// двадцать таймлайнов на проводе — композиция приходит вторым запросом.
  struct ProjectSummary: Decodable, Identifiable {
    let id: String
    let name: String
    let updated_at: String
  }

  struct Project: Decodable {
    let id: String
    let name: String
    let updated_at: String
    let composition: Composition

    private enum CodingKeys: String, CodingKey {
      case id, name, updated_at, composition
    }

    init(from decoder: Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      id = try c.decode(String.self, forKey: .id)
      name = try c.decode(String.self, forKey: .name)
      updated_at = try c.decode(String.self, forKey: .updated_at)
      if let document = try? c.decode(SyncedProjectDocument.self, forKey: .composition) {
        composition = document.composition
      } else {
        // Backward compatibility for the native shape saved before schema v1.
        composition = try c.decode(Composition.self, forKey: .composition)
      }
    }
  }

  private struct ProjectMetadata: Codable {
    let id: String
    let name: String
    let fps: Int
    let width: Int
    let height: Int
    let durationInFrames: Int
  }

  private struct SyncedProjectDocument: Codable {
    let schemaVersion: Int
    let project: ProjectMetadata
    let fps: Int
    let width: Int
    let height: Int
    let tracks: [Track]
    let assets: [SyncedAsset]
    let captions: [TimedCaption]
    let captionStyle: SyncedCaptionStyle?
    let showCaptions: Bool

    init(id: String, name: String, composition: Composition) {
      schemaVersion = 1
      project = ProjectMetadata(
        id: id,
        name: name,
        fps: composition.fps,
        width: composition.width,
        height: composition.height,
        durationInFrames: composition.durationInFrames
      )
      fps = composition.fps
      width = composition.width
      height = composition.height
      tracks = composition.tracks.map { track in
        var normalized = track
        normalized.items = track.items.map { item in
          var clip = item
          if clip.type == nil {
            clip.type = track.type == "avatar" ? "video" : track.type
          }
          return clip
        }
        return normalized
      }
      assets = composition.assets ?? []
      captions = composition.captions ?? []
      captionStyle = composition.captionStyle
      showCaptions = composition.showCaptions ?? !(composition.captions ?? []).isEmpty
    }

    var composition: Composition {
      Composition(
        fps: fps,
        width: width,
        height: height,
        tracks: tracks,
        captions: captions,
        assets: assets,
        captionStyle: captionStyle,
        showCaptions: showCaptions
      )
    }
  }

  private struct ProjectList: Decodable { let projects: [ProjectSummary] }

  enum ProjectError: LocalizedError {
    case нетВхода
    case отказ(Int, String)
    case сеть(Error)
    case разбор(String)

    var errorDescription: String? {
      switch self {
      case .нетВхода:
        return "Вы не вошли"
      case .отказ(let код, let текст):
        return текст.isEmpty ? "Сервер отказал: HTTP \(код)" : текст
      case .сеть(let e):
        return "Не дошло до сервера: \(e.localizedDescription)"
      case .разбор(let что):
        return "Ответ сервера не разобран: \(что)"
      }
    }
  }

  /**
   * Запрос с личностью и ОДНОЙ попыткой обновить сессию.
   *
   * ЗАЧЕМ ОТДЕЛЬНЫЙ ПОМОЩНИК. Access-токен живёт десять минут
   * (`ACCESS_TTL_SECONDS = 600` в session.ts), а редактор открыт дольше.
   * Без обновления первый же запрос после десяти минут получал бы 401, и
   * человек видел бы «вы не вошли», хотя сессия жива и обновляема.
   *
   * `Identity.refreshSession()` для этого и написан — и до сих пор НЕ
   * ВЫЗЫВАЛСЯ НИОТКУДА (`grep refreshSession` находил одно объявление).
   * Готовый механизм, к которому забыли подвести провод: то же, что в этом
   * проекте уже случалось с `checkStuckTrainings` и `sanitizeUrl`.
   *
   * Повтор РОВНО ОДИН. Цикл повторов на 401 — это способ саморазлогиниться:
   * refresh одноразовый, и сервер считает повторное предъявление кражей,
   * отзывая всю семью сессий.
   */
  /*
   * ВИДИМОСТЬ ПОДНЯТА ДО `internal` НАМЕРЕННО.
   *
   * `Connect` (подключение своего Telegram) обязан ходить с ТОЙ ЖЕ личностью и
   * с тем же обновлением протухшей сессии. Своя копия этой логики разошлась бы
   * с этой — так в этом проекте уже расходились две двери подряд.
   */
  static func сЛичностью(_ запрос: URLRequest) async throws -> (Data, HTTPURLResponse) {
    func послать() async throws -> (Data, HTTPURLResponse) {
      var r = запрос
      for (k, v) in Identity.headers() { r.setValue(v, forHTTPHeaderField: k) }
      do {
        let (d, resp) = try await URLSession.shared.data(for: r)
        guard let http = resp as? HTTPURLResponse else {
          throw ProjectError.разбор("ответ не HTTP")
        }
        return (d, http)
      } catch let e as ProjectError {
        throw e
      } catch {
        throw ProjectError.сеть(error)
      }
    }

    let (d, http) = try await послать()
    guard http.statusCode == 401, await Identity.refreshSession() else {
      return (d, http)
    }
    return try await послать()
  }

  /// Текст отказа берём из ТЕЛА ответа, а не из `statusText`: на HTTP/2,
  /// который отдаёт Railway, он пуст всегда. Тело — единственное место, где
  /// сервер объясняет по-человечески.
  private static func причина(_ данные: Data, _ код: Int) -> ProjectError {
    let тело = (try? JSONSerialization.jsonObject(with: данные)) as? [String: Any] ?? [:]
    let текст = [тело["error"] as? String, тело["detail"] as? String]
      .compactMap { $0 }
      .joined(separator: ". ")
    return .отказ(код, текст)
  }

  /// Свои проекты, свежие сверху.
  static func projects() async throws -> [ProjectSummary] {
    guard Identity.known else { throw ProjectError.нетВхода }
    let (d, http) = try await сЛичностью(
      URLRequest(url: base.appendingPathComponent("api/projects")))
    guard http.statusCode == 200 else { throw причина(d, http.statusCode) }
    do {
      return try JSONDecoder().decode(ProjectList.self, from: d).projects
    } catch {
      throw ProjectError.разбор(error.localizedDescription)
    }
  }

  /// Один проект вместе с композицией.
  static func project(id: String) async throws -> Project {
    guard Identity.known else { throw ProjectError.нетВхода }
    let (d, http) = try await сЛичностью(
      URLRequest(url: base.appendingPathComponent("api/projects/\(id)")))
    guard http.statusCode == 200 else { throw причина(d, http.statusCode) }
    do {
      return try JSONDecoder().decode(Project.self, from: d)
    } catch {
      /**
       * Разбор — это НЕ «проект пустой».
       *
       * Композиция могла быть записана другим редактором в форме, которой эта
       * модель не знает. Промолчать и показать демку значило бы сказать
       * человеку «у вас нет проектов», когда проект есть и просто не понят, —
       * молчаливая подделка вместо отказа.
       */
      throw ProjectError.разбор(error.localizedDescription)
    }
  }

  /// Создать или заменить свой проект. Идентификатор выбирает клиент — на
  /// сервере поэтому один PUT вместо пары POST+PUT.
  @discardableResult
  static func saveProject(
    id: String, name: String, composition: Composition
  ) async throws -> ProjectSummary {
    guard Identity.known else { throw ProjectError.нетВхода }
    struct Тело: Encodable {
      let name: String
      let composition: SyncedProjectDocument
    }

    var r = URLRequest(url: base.appendingPathComponent("api/projects/\(id)"))
    r.httpMethod = "PUT"
    r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let document = SyncedProjectDocument(id: id, name: name, composition: composition)
    r.httpBody = try JSONEncoder().encode(Тело(name: name, composition: document))

    let (d, http) = try await сЛичностью(r)
    guard http.statusCode == 200 else { throw причина(d, http.statusCode) }
    do {
      return try JSONDecoder().decode(ProjectSummary.self, from: d)
    } catch {
      throw ProjectError.разбор(error.localizedDescription)
    }
  }
}

extension API {
  /**
   * Задание генерации — то, что сервер записал о нашем запросе.
   *
   * Существует ради одного случая: связь оборвалась, а генерация прошла.
   * Провайдеру заплачено, файл в хранилище, и потеряна только наша сторона
   * разговора. Сервер заводит задание ДО вызова провайдера, поэтому ответ
   * оседает там независимо от того, дослушали мы его или нет.
   */
  struct Job: Decodable {
    let id: String
    let kind: String
    let state: String
    let url: String?
    let provider: String?
    let error: String?
  }

  private struct JobsResponse: Decodable { let jobs: [Job] }

  /*
   * `последнееЗадание` УДАЛЕНА, и это часть правки, а не уборка.
   *
   * Она брала самую свежую готовую задачу вида БЕЗ проверки времени, то есть
   * могла отдать ПРЕДЫДУЩУЮ генерацию как свою. Оба места вызова переведены
   * на `подобратьОборванное`, который сверяет время начала запроса.
   *
   * Оставлять её рядом означало держать наготове тот же дефект: следующий
   * вызывающий взял бы короткую и понятную функцию, а не длинную с окном.
   */
}

extension API {
  /**
   * Пакеты токенов. Ключи ПО-РУССКИ — так их отдаёт сервер.
   *
   * Проверено живым запросом, а не выведено из веб-клиента:
   *   GET /api/tokens/packs → {"ok":true,"включено":true,
   *     "пакеты":[{"id":"10","токенов":10,"звёзд":15}, …]}
   *
   * Переименовывать их в латиницу через CodingKeys было бы аккуратнее на вид
   * и опаснее по сути: лишний слой, в котором опечатка даст nil молча. Пусть
   * модель повторяет провод как есть.
   */
  struct TokenPack: Decodable, Identifiable {
    let id: String
    let токенов: Int
    let звёзд: Int
  }

  private struct PacksResponse: Decodable {
    let ok: Bool
    let включено: Bool
    let пакеты: [TokenPack]
  }

  /**
   * Возвращает пустой список, когда продажа ВЫКЛЮЧЕНА на сервере.
   *
   * Флаг `включено` существует затем, чтобы её можно было закрыть, не
   * выкладывая приложение. Показать пакеты вопреки ему значило бы дать
   * человеку нажать на то, что сервер откажется выставить счётом.
   */
  static func tokenPacks() async -> [TokenPack] {
    var r = URLRequest(url: base.appendingPathComponent("api/tokens/packs"))
    for (k, v) in Identity.headers() { r.setValue(v, forHTTPHeaderField: k) }
    guard let (data, resp) = try? await URLSession.shared.data(for: r),
          (resp as? HTTPURLResponse)?.statusCode == 200,
          let ответ = try? JSONDecoder().decode(PacksResponse.self, from: data),
          ответ.включено
    else { return [] }
    return ответ.пакеты
  }
}
