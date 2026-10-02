import Foundation
import Security
import UIKit

/**
 * Кто мы для сервера.
 *
 * ЗАЧЕМ. Веб-клиент доказывает личность подписью `initData`, которую Telegram
 * выдаёт внутри своего WebView. Нативное приложение её получить не может — и
 * до сих пор ходило в API вообще без заголовка личности. Сервер отвечал 401,
 * а на экране агент просто молчал: ни ошибки, ни объяснения, ни подсказки,
 * что делать. Ровно тот молчаливый отказ, который мы вычищаем везде.
 *
 * ЧТО ЗДЕСЬ ЕСТЬ СЕЙЧАС. Ключ агента — привязанная к человеку строка, которую
 * сервер уже понимает (`X-Agent-Key`). Это временное решение и оно честно
 * названо временным: ключ вводится один раз и живёт в Keychain.
 *
 * ЧТО ЗДЕСЬ БУДЕТ. Сессия приложения из `session.ts`: короткий access-токен и
 * ротируемый refresh, обмен через вход по Telegram. Серверная половина уже
 * влита — `authenticate()` принимает `Authorization: Bearer` третьей веткой.
 * Поэтому метод `headers` возвращает ИМЕННО Bearer, когда токен есть: когда
 * появится вход, менять придётся хранилище, а не каждый вызов API.
 */
enum Identity {
  private static let сервис = "ai.t27.vibee.identity"

  /// Ключ агента: привязан к telegram_id на стороне сервера.
  static var agentKey: String? {
    get { прочитать("agent-key") }
    set { записать("agent-key", newValue) }
  }

  /// Access-токен сессии. Короткий: протухает и обновляется сам.
  static var accessToken: String? {
    get { прочитать("access-token") }
    set { записать("access-token", newValue) }
  }

  /**
   * Refresh-токен: длинный, ротируемый, ОДНОРАЗОВЫЙ.
   *
   * Сервер считает повторное предъявление кражей и отзывает всю семью сессий
   * разом. Поэтому здесь ровно одно место записи и ни одной копии в памяти
   * дольше запроса: если старый токен где-то задержится и уйдёт вторым, мы
   * сами себя разлогиним и не поймём почему.
   */
  static var refreshToken: String? {
    get { прочитать("refresh-token") }
    set { записать("refresh-token", newValue) }
  }

  /// Есть ли чем представиться. Экраны спрашивают это, а не разбирают ключи.
  static var known: Bool { accessToken != nil || agentKey != nil }

  /// Настоящая сессия, а не отладочный ключ. Разница видна в Профиле.
  static var hasSession: Bool { refreshToken != nil }

  /**
   * Годится ли личность для маршрутов ЗА ОБЩИМ ГВАРДОМ рендера.
   *
   * ПОЧЕМУ НЕ `known`. Для этих маршрутов `known` ЛЖЁТ: с одним лишь ключом
   * агента он `true`, а общий гвард (`render/auth.ts:329-421`) знает ровно три
   * способа — серверный ключ, подпись мини-аппа и `Authorization: Bearer`.
   * Ключа агента среди них нет. Замер: `POST /api/generate/image` с
   * `X-Agent-Key` отвечает 401 «no X-Api-Key and no Telegram initData» — тот же
   * замер описан в `GenerateScreen.swift:174-192`. Спросить `known` перед
   * запросом к ленте, генерации, проектам или рендеру значит пропустить
   * человека к заведомому отказу.
   *
   * ПОЧЕМУ `refreshToken` СЧИТАЕТСЯ ГОДНЫМ. Access живёт минуты и его может не
   * быть на руках прямо сейчас. Запрос уйдёт без него, получит 401, и
   * `сЛичностью`/`отправить` ОДИН раз обновят сессию и повторят — это уже
   * написано и работает. Отказать здесь значило бы сказать «нужен вход» тому,
   * кто вошёл десять минут назад.
   */
  static var сессияГодится: Bool { accessToken != nil || refreshToken != nil }

  /// Свой telegram_id — сервер называет его при обмене кода. Без него
  /// Профиль не знает, чей профиль показывать, и это единственное, что ему
  /// нужно: имя и аватар он возьмёт с сервера.
  static var telegramId: String? {
    get { прочитать("telegram-id") }
    set { записать("telegram-id", newValue) }
  }

  /**
   * Заголовки для любого запроса к API.
   *
   * Порядок намеренный: сессия сильнее ключа агента. Ключ — отладочный путь,
   * он не протухает и не отзывается сам; как только есть настоящая сессия,
   * ходить надо ей.
   */
  static func headers() -> [String: String] {
    if let t = accessToken { return ["Authorization": "Bearer \(t)"] }
    if let k = agentKey { return ["X-Agent-Key": k] }
    return [:]
  }

  // MARK: - Keychain

  /**
   * `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, а не `WhenUnlocked`.
   *
   * `ThisDeviceOnly` — чтобы ключ не уехал в резервную копию и не всплыл на
   * чужом устройстве при восстановлении. `AfterFirstUnlock` — чтобы фоновое
   * обновление ленты работало при заблокированном экране: `WhenUnlocked`
   * отдаёт `errSecInteractionNotAllowed`, и запрос падал бы без причины.
   */
  /**
   * Пишет и ВОЗВРАЩАЕТ статус. Раньше он молча выбрасывался.
   *
   * `SecItemAdd(add, nil)` — результат в никуда, и это ровно тот случай, где
   * молчание дороже всего: вход по коду проходил на сервере, код сгорал,
   * `claimPairing` рапортовал успех — а токены не сохранялись, и человек
   * снова видел «нужен вход» без единого слова о причине. Keychain отказывает
   * не в теории: `errSecMissingEntitlement` (-34018) прилетает от сборки без
   * нужного entitlement, и симулятор здесь ведёт себя иначе, чем устройство.
   *
   * Вызывающий обязан посмотреть на ответ. Запись, которая умеет не
   * состояться, не должна выглядеть как та, что не умеет.
   */
  @discardableResult
  private static func записать(_ ключ: String, _ значение: String?) -> OSStatus {
    let base: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: сервис,
      kSecAttrAccount as String: ключ,
    ]
    SecItemDelete(base as CFDictionary)
    guard let значение, let data = значение.data(using: .utf8) else {
      // Стирание — законный исход, а не сбой: `nil` значит «забудь».
      return errSecSuccess
    }
    var add = base
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let статус = SecItemAdd(add as CFDictionary, nil)
    if статус == errSecMissingEntitlement { запасное[ключ] = значение }
    return статус
  }

  /**
   * ЗАПАСНОЕ ХРАНИЛИЩЕ ТОЛЬКО ДЛЯ СИМУЛЯТОРА. На устройстве его НЕТ.
   *
   * Симулятор не даёт приложению право keychain-access-groups: Xcode
   * вырезает его при ad-hoc подписи, и это проверено — подписанный бинарник
   * получает пустой словарь прав, а Keychain отвечает -34018. Держать из-за
   * этого вход нерабочим значит не иметь возможности проверить НИ ОДНУ
   * функцию, которая требует личности.
   *
   * Ветка закрыта `#if targetEnvironment(simulator)`, то есть на устройстве
   * её нет в собранном коде вовсе — не «не вызывается», а отсутствует. Там
   * -34018 остаётся жёстким отказом, как и должно: на устройстве это признак
   * неверно собранного приложения, и прятать его нельзя.
   */
  #if targetEnvironment(simulator)
    private static var запасное: [String: String?] {
      get {
        (UserDefaults.standard.dictionary(forKey: "identity-fallback")
          as? [String: String])?.mapValues { Optional($0) } ?? [:]
      }
      set {
        var d = UserDefaults.standard.dictionary(forKey: "identity-fallback")
          as? [String: String] ?? [:]
        for (k, v) in newValue { if let v { d[k] = v } else { d[k] = nil } }
        UserDefaults.standard.set(d, forKey: "identity-fallback")
      }
    }
  #else
    /// На устройстве запасного пути нет: присваивание никуда не ведёт.
    private static var запасное: [String: String?] {
      get { [:] }
      set { _ = newValue }
    }
  #endif

  private static func прочитать(_ ключ: String) -> String? {
    let q: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: сервис,
      kSecAttrAccount as String: ключ,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var out: CFTypeRef?
    guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
          let d = out as? Data, let s = String(data: d, encoding: .utf8), !s.isEmpty
    else { return запасное[ключ] ?? nil }
    return s
  }
}

/**
 * Вход и поддержание сессии.
 *
 * ПОЧЕМУ КОД, А НЕ ССЫЛКА. Приложение не внутри Telegram и подпись `initData`
 * получить не может — никогда, ни при каких условиях. Значит личность должна
 * прийти оттуда, где подпись есть: из мини-аппа. Диплинк был бы на два тапа
 * короче, но refresh-токен в адресной строке оседает в логах, в истории буфера
 * обмена и у того, кто рисует ссылку. Шесть цифр, прочитанных глазами с одного
 * экрана и набранных на другом, не оставляют копии нигде.
 */
extension Identity {
  enum ВходError: LocalizedError {
    case отказ(String)
    case сеть(Error)

    var errorDescription: String? {
      switch self {
      case .отказ(let текст): return текст
      case .сеть(let e):
        return say("Did not reach the server: ", "Не дошло до сервера: ")
          + e.localizedDescription
      }
    }
  }

  /// Склейка строк дала бы двойной слэш или его отсутствие в зависимости от
  /// того, чем кончается база. `appending` знает про разделитель сам.
  private static func адрес(_ путь: String) -> URL {
    API.base.appendingPathComponent(путь)
  }

  /**
   * ДЛИНА КОДА ЗАДАЁТСЯ СЕРВЕРОМ, А ЗДЕСЬ ТОЛЬКО ГРАНИЦЫ РАЗУМНОГО.
   *
   * Здесь стояло `count == 6`. Сервер поднял длину до восьми ради стойкости
   * (миллион вариантов против ста миллионов), и вход в приложение умер
   * ЦЕЛИКОМ: поле обрезало ввод на шестой цифре, кнопка не включалась, а до
   * запроса дело не доходило вовсе. Экран выглядел исправным, человек — нет.
   *
   * Урок не в том, чтобы поставить восьмёрку. Клиент НЕ МОЖЕТ знать эту
   * величину: она живёт в `PAIRING.DIGITS` на сервере и уже менялась. Две
   * копии одного числа в разных языках расходятся молча — и разошлись.
   *
   * Поэтому здесь широкие границы, а судит сервер: он отвечает «код должен
   * быть из N цифр» и остаётся единственным, кто эту величину знает. Худшее,
   * что теперь бывает, — «код не подошёл» вместо «код невозможно набрать».
   */
  static let минимумЦифрКода = 4
  static let максимумЦифрКода = 12

  /**
   * Why the server refused a sign-in code, in the phone's language.
   *
   * The server words every refusal in Russian, and the app used to show the
   * `detail` as it came -- Russian on an English phone, at the one moment a
   * person cannot go around the screen. Since 2026-10-02 each refusal on
   * `/api/auth/pair/claim` carries a `code`, and this reads the code.
   *
   * A Russian reader keeps the server's own `detail` when there is one: the
   * server owns that wording. An unknown code gets a sentence that still
   * says what to do, never the raw Russian. The list of codes is checked
   * against the server by render/pairing-refusal-codes.test.ts.
   */
  static func pairingRefusal(
    status: Int, body: [String: Any], russian: Bool = speaksRussian
  ) -> String {
    func l(_ en: String, _ ru: String) -> String { russian ? ru : en }
    let wait = (body["ждать_секунд"] as? Int).map { "\($0)" } ?? ""
    let digits = (body["digits"] as? Int).map { "\($0)" } ?? ""
    let sentences: [String: String] = [
      "unknown": l(
        "Code not found — check the digits and request a new one",
        "код не найден — проверьте цифры и запросите новый"),
      "expired": l(
        "The code is used up or expired — request a new one",
        "код уже использован или истёк — запросите новый"),
      "exhausted": l(
        "Too many attempts — request a new code",
        "слишком много попыток — запросите новый код"),
      "too_often": wait.isEmpty
        ? l(
          "Too many tries — wait a little and try again",
          "слишком часто — подождите и попробуйте снова")
        : l(
          "Too many tries — wait \(wait) s and try again",
          "слишком часто — подождите \(wait) с и попробуйте снова"),
      "bad_length": digits.isEmpty
        ? l("The code has the wrong number of digits", "в коде не то число цифр")
        : l("The code must be \(digits) digits", "код должен быть из \(digits) цифр"),
      "bad_body": l(
        "The app sent a request the server could not read — update the app",
        "сервер не разобрал запрос приложения — обновите приложение"),
    ]
    // A server from before the codes still answers 429 with a wait.
    let code =
      body["code"] as? String ?? body["reason"] as? String
      ?? (status == 429 ? "too_often" : "")
    if russian, let own = body["detail"] as? String, !own.isEmpty { return own }
    return sentences[code]
      ?? l(
        "The code was not accepted (the server answered \(status))",
        "Код не принят (сервер ответил \(status))")
  }

  /// Обменять код входа на сессию. Код гаснет на сервере в тот же миг.
  static func claimPairing(code: String) async throws {
    let цифры = code.filter(\.isNumber)
    guard цифры.count >= минимумЦифрКода, цифры.count <= максимумЦифрКода else {
      throw ВходError.отказ(
        say("Enter the whole code from Telegram", "Введите код из Telegram целиком"))
    }

    let имяУстройства = await MainActor.run { UIDevice.current.name }

    var r = URLRequest(url: адрес("api/auth/pair/claim"))
    r.httpMethod = "POST"
    r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    // Имя устройства попадёт в список сессий: человек должен узнавать, что
    // именно отзывает, не сверяя идентификаторы.
    r.httpBody = try JSONSerialization.data(withJSONObject: [
      "code": цифры,
      "device_name": имяУстройства,
    ])

    let (data, resp): (Data, URLResponse)
    do { (data, resp) = try await URLSession.shared.data(for: r) }
    catch { throw ВходError.сеть(error) }

    let тело = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    let код = (resp as? HTTPURLResponse)?.statusCode ?? 0
    /*
     * ТРЕТЬЕ ЗВЕНО СКВОЗНОГО ЛОГА.
     *
     * Мини-апп пишет, выдан ли код; сервер — принят ли он и почему нет; здесь
     * пишется, что увидело устройство. Без этого звена расследование
     * 2026-09-03 упиралось в догадки: со стороны сервера видно «claim
     * ОТКАЗ unknown», а был ли это тот же код, тот же человек и то же
     * устройство — неизвестно.
     *
     * `reason` от сервера печатаем машинным словом (unknown/expired/
     * exhausted): оно совпадает с тем, что пишет сервер, и две записи можно
     * свести. Сами шесть цифр НЕ печатаем никогда — это живой пароль.
     */
    print(
      "🔑 [pair] claim → http \(код)"
        + (код == 200
          ? ", сессия получена"
          : ", reason=\(тело["reason"] as? String ?? "?")"
            + ", detail=\(тело["detail"] as? String ?? "нет")")
    )
    guard код == 200 else {
      /**
       * Показываем ПРИЧИНУ отказа, а не «ошибка входа».
       *
       * Сервер честно различает «не найден», «истёк» и «слишком много попыток»
       * именно затем, чтобы человек, опоздавший на десять секунд, запросил
       * новый код, а не перенабирал верный по третьему разу.
       */
      throw ВходError.отказ(pairingRefusal(status: код, body: тело))
    }

    // Порядок важен: refresh пишем ПЕРВЫМ. Если приложение умрёт между двумя
    // записями, лучше остаться с обновляемым refresh без access, чем с
    // access, который через час протухнет навсегда.
    let статусRefresh = записать("refresh-token", тело["refresh_token"] as? String)
    let статусAccess = записать("access-token", тело["access_token"] as? String)
    записать("telegram-id", тело["telegram_id"] as? String)

    /**
     * СВЕРЯЕМСЯ С ХРАНИЛИЩЕМ, А НЕ ВЕРИМ ЗАПИСИ НА СЛОВО.
     *
     * Код одноразовый: к этой строке он уже сгорел на сервере. Если токены не
     * легли, а мы промолчим, человек останется без входа И без кода — и
     * следующая попытка потребует нового кода, чтобы снова ничего не
     * сохранить. Поэтому неудача записи обязана стать видимым отказом здесь,
     * а не «нужен вход» через три экрана.
     *
     * Проверка ЧТЕНИЕМ, а не только по статусу: статус говорит, что вызов
     * принят, а чтение — что значение действительно достаётся обратно. Между
     * этими утверждениями и живут защита класса и доступность элемента.
     */
    guard accessToken != nil, refreshToken != nil else {
      let keychain = "(Keychain: \(статусAccess), \(статусRefresh))"
      throw ВходError.отказ(
        say(
          "Sign-in accepted, but the session could not be saved \(keychain). "
            + "The code is used up — request a new one.",
          "Вход принят, но сохранить сессию не удалось \(keychain). "
            + "Код уже использован — запросите новый."
        )
      )
    }

    // Ключ агента больше не нужен и не должен пережить вход: два способа
    // представиться — это два способа разойтись. Стираем ПОСЛЕ проверки:
    // иначе неудачный вход отнял бы и то, чем человек мог представиться.
    agentKey = nil
  }

  /// Обновить протухший access. Возвращает false, если надо входить заново.
  @discardableResult
  static func refreshSession() async -> Bool {
    guard let rt = refreshToken else { return false }

    var r = URLRequest(url: адрес("api/auth/refresh"))
    r.httpMethod = "POST"
    r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    r.httpBody = try? JSONSerialization.data(withJSONObject: ["refresh_token": rt])

    guard let (data, resp) = try? await URLSession.shared.data(for: r) else {
      // Сеть отвалилась — это НЕ повод стирать сессию. Токен ещё жив.
      return false
    }
    let тело = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
    let код = (resp as? HTTPURLResponse)?.statusCode ?? 0

    /*
     * ГОНКА — НЕ КОНЕЦ СЕССИИ.
     *
     * Здесь нет защиты от одновременных обновлений вовсе: два запроса,
     * получившие 401, зовут `refreshSession()` каждый, и второй предъявляет
     * токен, который первый уже потратил. На вебе такое даёт две вкладки; тут
     * хватает двух экранов.
     *
     * Раньше любой отказ вёл к `forget()` — то есть человек, ничего не сделав,
     * оказывался выкинут и шёл за восьмизначным кодом. Сервер теперь отвечает
     * на такое 409 и НИЧЕГО не отзывает: победитель гонки уже положил новый
     * токен в Keychain, и его достаточно прочитать.
     *
     * `forget()` здесь не зовётся ни в одной ветке — в этом весь смысл правки.
     */
    if код == 409, (тело["error"] as? String) == "auth_refresh_raced" {
        if let свежий = refreshToken, свежий != rt { return true }
        return false
    }

    guard код == 200,
          let новыйRefresh = тело["refresh_token"] as? String,
          let новыйAccess = тело["access_token"] as? String
    else {
      /**
       * Отказ сервера — это конец сессии, и её надо стереть.
       *
       * Особенно `auth_reuse_detected`: сервер уже отозвал всю семью, потому
       * что счёл токен украденным. Повторять запрос бессмысленно и вредно —
       * каждая попытка выглядит как ещё одно предъявление.
       */
      forget()
      return false
    }

    refreshToken = новыйRefresh
    accessToken = новыйAccess
    return true
  }

  /// Забыть всё об этом человеке на этом устройстве.
  static func forget() {
    accessToken = nil
    refreshToken = nil
    agentKey = nil
    telegramId = nil
  }

  /// Выйти по-настоящему: и здесь, и на сервере.
  static func logout() async {
    if let t = accessToken {
      var r = URLRequest(url: адрес("api/auth/logout"))
      r.httpMethod = "POST"
      r.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization")
      _ = try? await URLSession.shared.data(for: r)
    }
    // Стираем ВНЕ зависимости от ответа: человек нажал «выйти», и экран обязан
    // это выполнить. Серверная половина — попытка, локальная — обещание.
    forget()
  }
}
