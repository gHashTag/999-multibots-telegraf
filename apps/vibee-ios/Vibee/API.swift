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
  struct Profile: Decodable {
    let username: String
    let display_name: String?
    let bio: String?
    let avatar_url: String?
  }

  /// Профиль по своему telegram_id: единственное, что приложение о себе знает.
  static func profile(telegramId: String) async throws -> Profile {
    struct ById: Decodable { let username: String }
    let (d, _) = try await URLSession.shared.data(
      from: base.appendingPathComponent("api/users/id/\(telegramId)"))
    let username = try JSONDecoder().decode(ById.self, from: d).username
    return try await profile(username: username)
  }

  static func profile(username: String) async throws -> Profile {
    let (d, _) = try await URLSession.shared.data(
      from: base.appendingPathComponent("api/users/\(username)"))
    return try JSONDecoder().decode(Profile.self, from: d)
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
