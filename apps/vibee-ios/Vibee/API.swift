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
  private static func сЛичностью(_ запрос: URLRequest) async throws -> (Data, HTTPURLResponse) {
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

  /**
   * Последнее ЗАВЕРШЁННОЕ задание нужного вида.
   *
   * Незавершённые пропускаем намеренно: показать «running» как результат
   * значило бы подсунуть человеку пустую ссылку. А молчание здесь честнее —
   * пусть повторит, чем получит ничто под видом чего-то.
   */
  static func последнееЗадание(вид: String) async -> Job? {
    var r = URLRequest(url: base.appendingPathComponent("api/generate/jobs"))
    for (k, v) in Identity.headers() { r.setValue(v, forHTTPHeaderField: k) }
    guard let (data, resp) = try? await URLSession.shared.data(for: r),
          (resp as? HTTPURLResponse)?.statusCode == 200,
          let ответ = try? JSONDecoder().decode(JobsResponse.self, from: data)
    else { return nil }

    return ответ.jobs.first { $0.kind == вид && $0.state == "done" && $0.url != nil }
  }
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

// MARK: - Ремикс

/**
 * Ремикс: взять чужой рецепт, поправить слова, собрать свой ролик.
 *
 * ЧТО ТАКОЕ РЕЦЕПТ. Рилс в этом сервисе — это JSON `{compositionId, props}`, а
 * не набор дорожек. Замер прода 2026-09-03, `GET /api/feed?limit=25&sort=recent`:
 * у ВСЕХ 25 свежих записей `template_settings` — это обёртка
 * `{ab_style, compositionId, poster, props, tg_posted_at}` с
 * `compositionId: "TrinityBlogReel"`, а колонки `assets` и `tracks` — пустые
 * массивы `"[]"` (ровно два символа). Слоёв в ленте нет вовсе; всё, из чего
 * собран ролик, лежит в `props`. Поэтому ремикс здесь — это правка пропсов и
 * повторный рендер той же композиции, а не открытие таймлайна.
 *
 * ПОЧЕМУ `/render`, А НЕ `/render/template`. Единственный из двух, кто
 * проверяет `compositionId` на входе и отвечает 400 со списком известных
 * (render-server.ts:4437-4448); у второго неизвестный id получает 202 и
 * падает секунд через пятнадцать — то есть человек увидел бы прогресс и крах.
 * Он же отдаёт `publicUrl` — подписанную ссылку, которую `AVPlayer` откроет
 * без заголовков; у `/render/template` `publicUrl` не выставляется никогда.
 */
extension API {
  /// Рецепт ролика: ровно то, из чего сервер его собирает.
  struct Рецепт {
    let compositionId: String
    /**
     * Пропсы как есть, `[String: Any]`, а не типизированная модель.
     *
     * Рецепт ЧУЖОЙ: его писал другой клиент и, возможно, другой версии. Поле,
     * которого не знает наша модель, при декодировании исчезло бы МОЛЧА — и
     * ремикс собрал бы не тот ролик, отчитавшись успехом. Тот же класс потери,
     * что и Zod на сервере, который вырезает незнакомые ключи
     * (TrinityBlogReel.tsx:110-123): один раз он уже стоил разбора.
     */
    let props: [String: Any]
  }

  /// Состояние задания рендера. Поля — те же, что в ответе `GET /render/:id`.
  struct СостояниеРендера {
    /// `pending` | `rendering` | `completed` | `failed`
    let статус: String
    let процент: Int
    let ссылка: URL?
    let отказ: String?
  }

  /**
   * Отказы ремикса. Каждый случай — своё ДЕЙСТВИЕ человека, поэтому и слова
   * разные: при `нуженВход` идти в Профиль, при `заданиеПотеряно` начинать
   * заново, при `рендерУпал` читать, что именно не понравилось серверу.
   */
  enum RemixError: LocalizedError {
    case нуженВход
    case безКомпозиции
    case рецептНеРазобран(String)
    case отказ(String)
    case заданиеПотеряно
    case сеть(String)

    var errorDescription: String? {
      switch self {
      case .нуженВход:
        // Слово в слово как у лайка (ActionError.нуженВход): двух разных
        // формулировок одного отказа в приложении быть не должно.
        return "Нужен вход: Профиль → войти по коду из мини-аппа"
      case .безКомпозиции:
        return """
          В записи нет compositionId — сервер не узнает, ЧТО собирать. \
          Так публиковали старые клиенты; у свежих роликов это поле есть.
          """
      case .рецептНеРазобран(let что):
        return "Рецепт не разобран: \(что)"
      case .отказ(let текст):
        return текст
      case .заданиеПотеряно:
        return """
          Рендер потерян на сервере. Задания живут в памяти процесса и \
          исчезают при перезапуске сервиса — это не обрыв связи и не ваша \
          ошибка. Можно начать заново.
          """
      case .сеть(let текст):
        return текст
      }
    }
  }

  /**
   * Запрос с личностью и ОДНОЙ попыткой обновить сессию.
   *
   * Переиспользует `сЛичностью`, а не заводит третью копию той же логики:
   * копий уже две (`отправить` — для ленты, `сЛичностью` — для проектов), и
   * каждая следующая это ещё одно место, где повтор на 401 разойдётся с
   * остальными. Повтор обязан остаться РОВНО одним: refresh одноразовый, и
   * сервер считает второе предъявление кражей, отзывая всю семью сессий.
   */
  private static func ответ(_ запрос: URLRequest) async throws -> (Data, Int) {
    do {
      let (данные, http) = try await сЛичностью(запрос)
      return (данные, http.statusCode)
    } catch let e as ProjectError {
      throw RemixError.сеть(e.localizedDescription)
    } catch {
      throw RemixError.сеть("Не дошло до сервера: \(error.localizedDescription)")
    }
  }

  /// Слова сервера тем же разбором, что у проектов: на HTTP/2, который отдаёт
  /// Railway, `statusText` пуст всегда, и объяснение живёт только в теле.
  private static func словаСервера(_ данные: Data, _ код: Int) -> String {
    причина(данные, код).localizedDescription
  }

  /**
   * Взять рецепт чужого ролика: `POST /api/feed/:id/use`.
   *
   * Маршрут НЕ публичный: `/api/feed` открыт гвардом только на GET
   * (auth.ts:210-212, 229-234), а на проде режим всегда `enforce`
   * (auth.ts:41-68) — локальный `warn` эту поломку маскирует. Замер прода
   * 2026-09-03: без личности приходит
   * `401 {"error":"unauthorized","detail":"no X-Api-Key and no Telegram initData"}`.
   */
  static func рецептРемикса(templateId: String) async throws -> Рецепт {
    // Спрашиваем ДО запроса, чтобы человек услышал «нужен вход», а не
    // «сервер отказал: HTTP 401». Предикат — `сессияГодится`, а не `known`:
    // с ключом агента общий гвард отвечает тем же 401 (см. Identity.swift).
    guard Identity.сессияГодится else { throw RemixError.нуженВход }

    var r = URLRequest(url: base.appendingPathComponent("api/feed/\(templateId)/use"))
    r.httpMethod = "POST"
    r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    // Тело сервер СЛИВАЕТ, не читая (render-server.ts:5974-5976): личность он
    // берёт из заголовка. Пустой объект — чтобы POST не ушёл без тела вовсе.
    r.httpBody = Data("{}".utf8)

    let (данные, код) = try await ответ(r)
    if код == 401 { throw RemixError.нуженВход }
    guard (200...299).contains(код) else {
      throw RemixError.отказ(словаСервера(данные, код))
    }

    guard let верх = (try? JSONSerialization.jsonObject(with: данные)) as? [String: Any],
          let запись = верх["template"] as? [String: Any]
    else { throw RemixError.рецептНеРазобран("в ответе нет поля template") }

    /**
     * `template_settings` приходит СТРОКОЙ, а не объектом.
     *
     * В SQL стоит `template_settings::text` (render-server.ts:6070): колонка
     * `jsonb`, но `::text` делает её обычным текстом, и node-pg отдаёт её как
     * есть. Разбор — на клиенте, второй раз. Объектную ветку держим потому,
     * что GET-маршруты той же ленты отдают то же поле уже разобранным и в
     * camelCase: одна и та же запись приходит из двух маршрутов в двух формах.
     */
    let сырое: Any = запись["template_settings"]
      ?? запись["templateSettings"]
      ?? [String: Any]()
    let обёртка: [String: Any]
    switch сырое {
    case let текст as String:
      обёртка = (try? JSONSerialization.jsonObject(with: Data(текст.utf8)))
        as? [String: Any] ?? [:]
    case let объект as [String: Any]:
      обёртка = объект
    default:
      обёртка = [:]
    }

    // `props` ВЛОЖЕНЫ, а не равны обёртке. Тот же разбор, что в вебе
    // (`settings.props ?? settings`, atoms/feed.ts:703): два клиента, читающие
    // одну ленту по-разному, разойдутся ровно там, где человек их сравнит.
    let props = обёртка["props"] as? [String: Any] ?? обёртка

    /**
     * Композиции НЕТ — отказываем, а не подставляем свою.
     *
     * Веб на этом месте падает в `'SplitTalkingHead'` (atoms/feed.ts:705-707).
     * Здесь так нельзя: там подстановка открывает РЕДАКТОР, где человек видит
     * результат и может передумать, а тут она молча отправила бы чужие пропсы
     * в чужую композицию и вернула готовый ролик — ложное подтверждение,
     * неотличимое от успеха. Замер 2026-09-03: у всех 25 свежих записей ленты
     * `compositionId` есть, так что отказ достанется только старым записям.
     */
    guard let композиция = обёртка["compositionId"] as? String, !композиция.isEmpty
    else { throw RemixError.безКомпозиции }

    return Рецепт(compositionId: композиция, props: props)
  }

  /**
   * Поставить рендер: `POST /render`. Возвращает renderId.
   *
   * Ответ — 202 и `{renderId, statusUrl, sseUrl}`; готового файла в нём нет и
   * быть не может, дальше только опрос.
   */
  static func начатьРендер(_ рецепт: Рецепт) async throws -> String {
    guard Identity.сессияГодится else { throw RemixError.нуженВход }

    /**
     * `userInfo` НЕ ШЛЁМ, и это не забывчивость.
     *
     * Его наличие включает автопубликацию: `publishToFeed` вызывается ровно
     * при `userInfo.telegram_id` (render-server.ts:2130-2146), и ролик уезжает
     * в ОБЩУЮ ленту сразу после рендера, плюс уходит сообщение в Telegram.
     * Человек нажал «собрать», а не «опубликовать». Публикация — отдельное
     * решение и отдельная кнопка, которой в приложении пока нет; сделать её
     * побочным эффектом кнопки «собрать» значит опубликовать за человека.
     */
    let тело: [String: Any] = [
      "type": "video",
      "compositionId": рецепт.compositionId,
      "inputProps": рецепт.props,
    ]
    // Проверяем ЗДЕСЬ, а не полагаемся на `try?`: молча отправленное пустое
    // тело вернулось бы невнятным «Invalid JSON» от сервера.
    guard JSONSerialization.isValidJSONObject(тело),
          let данныеТела = try? JSONSerialization.data(withJSONObject: тело)
    else { throw RemixError.рецептНеРазобран("пропсы не превратились обратно в JSON") }

    var r = URLRequest(url: base.appendingPathComponent("render"))
    r.httpMethod = "POST"
    r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    r.httpBody = данныеТела

    let (данные, код) = try await ответ(r)
    if код == 401 { throw RemixError.нуженВход }
    guard (200...299).contains(код) else {
      // На неизвестную композицию сервер отвечает 400 и СПИСКОМ известных
      // (render-server.ts:4437-4448) — показываем список: это готовый ответ на
      // вопрос «а что тогда можно», и придумывать свой текст поверх незачем.
      let тело = (try? JSONSerialization.jsonObject(with: данные)) as? [String: Any] ?? [:]
      let текст = словаСервера(данные, код)
      guard let список = (тело["available"] as? [String])?.joined(separator: ", ")
      else { throw RemixError.отказ(текст) }
      throw RemixError.отказ("\(текст). Сервер умеет: \(список)")
    }

    guard let о = (try? JSONSerialization.jsonObject(with: данные)) as? [String: Any],
          let id = о["renderId"] as? String
    else { throw RemixError.рецептНеРазобран("сервер принял задачу, но не назвал renderId") }
    return id
  }

  /**
   * Спросить состояние: `GET /render/:id`.
   *
   * Опрос, а не SSE, и это не лень. `/render/:id/status` принимает подпись
   * мини-аппа через `?initData=` (auth.ts:399-404), но НЕ принимает Bearer в
   * строке запроса, а `EventSource`-подобного клиента с заголовками здесь нет.
   * Для сессии приложения SSE — тупик; обычный GET с заголовком работает.
   */
  static func состояниеРендера(задание: String) async throws -> СостояниеРендера {
    let r = URLRequest(url: base.appendingPathComponent("render/\(задание)"))
    let (данные, код) = try await ответ(r)
    if код == 401 { throw RemixError.нуженВход }
    // 404 здесь означает не «нет такого адреса», а «задания больше нет»:
    // `renderJobs` — Map в памяти процесса, её чистит перезапуск и таймер
    // через час после старта (render-server.ts:1800-1808).
    if код == 404 { throw RemixError.заданиеПотеряно }
    guard (200...299).contains(код) else {
      throw RemixError.отказ(словаСервера(данные, код))
    }
    guard let о = (try? JSONSerialization.jsonObject(with: данные)) as? [String: Any],
          let статус = о["status"] as? String
    else { throw RemixError.рецептНеРазобран("в ответе о состоянии нет status") }

    return СостояниеРендера(
      статус: статус,
      процент: о["progress"] as? Int ?? 0,
      ссылка: готоваяСсылка(о),
      отказ: о["error"] as? String
    )
  }

  /**
   * Ссылка на готовый файл. Сначала `publicUrl`, потом `outputUrl`.
   *
   * `publicUrl` — подписанная ссылка хранилища, живёт семь суток
   * (`expiresIn: 604800`, render-server.ts:1305-1309) и появляется только если
   * заливка удалась. `outputUrl` — путь на самом рендер-сервере
   * (`/renders/<id>.mp4`); префикс `/renders/` публичен (auth.ts:185), поэтому
   * `AVPlayer` возьмёт его без заголовков — их он всё равно не умеет слать.
   *
   * `URL(string:relativeTo:)`, а не склейка: `appendingPathComponent` на пути,
   * который уже начинается со слэша, даёт двойной слэш.
   */
  private static func готоваяСсылка(_ о: [String: Any]) -> URL? {
    if let s = о["publicUrl"] as? String, !s.isEmpty, let u = URL(string: s) {
      return u
    }
    guard let s = о["outputUrl"] as? String, !s.isEmpty else { return nil }
    return URL(string: s, relativeTo: base)?.absoluteURL
  }
}
