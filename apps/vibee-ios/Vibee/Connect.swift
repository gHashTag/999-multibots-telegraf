import Foundation

/**
 * ЗАПРОСЫ ПОДКЛЮЧЕНИЯ TELEGRAM.
 *
 * Отдельным файлом от экрана: `ConnectTelegramView` тогда не знает про HTTP,
 * а этот слой — про SwiftUI. Ровно то же разделение, что у веба между
 * `ConnectTelegram.tsx` и его `запрос()`.
 *
 * ЛОВУШКА SWIFT, СТОИВШАЯ СБОРКИ: блочные комментарии здесь ВЛОЖЕННЫЕ.
 * Путь вида «api/tg/connect» со звёздочкой на конце открывает внутри
 * комментария ещё один блок, который никто не закрывает, и компилятор
 * сообщает «unterminated comment» в КОНЦЕ файла — далеко от причины.
 *
 * ── ЧЕМ ЗДЕСЬ ПРЕДСТАВЛЯЮТСЯ ───────────────────────────────────────────────
 *
 * Маршруты `/api/tg/connect/…` требуют ЛИЧНОСТЬ, и намеренно не принимают
 * серверный ключ: подключить чужой аккаунт может только сам человек.
 * `chatIdentity` на сервере принимает подпись мини-аппа ИЛИ сессию
 * приложения — значит с iPhone туда ходить можно и всегда было можно, просто
 * некому.
 *
 * Поэтому здесь `API.сЛичностью`: он ставит заголовки `Identity` и умеет
 * обновить протухшую сессию, а не отправить человека входить заново.
 */
enum Connect {
  /// Отказ сервера, у которого есть человеческая причина.
  struct Отказ: Error {
    let причина: String
  }

  private static func адрес(_ путь: String) -> URL {
    API.base.appendingPathComponent(путь)
  }

  /**
   * Разбор ответа: сервер отвечает `{ ok: false, error: "..." }` со СЛОВАМИ
   * человека («номер не принят Telegram», «код не подошёл»). Подменять их
   * общим «не удалось» — значит отнять единственную подсказку.
   */
  private static func разобрать(_ d: Data, _ http: HTTPURLResponse) throws -> [String: Any] {
    let тело = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] ?? [:]
    if http.statusCode != 200 || (тело["ok"] as? Bool) == false {
      throw Отказ(причина: (тело["error"] as? String) ?? "сервер ответил \(http.statusCode)")
    }
    return тело
  }

  private static func запрос(_ путь: String, _ метод: String, _ тело: [String: Any]?)
    async throws -> [String: Any]
  {
    var r = URLRequest(url: адрес(путь))
    r.httpMethod = метод
    if let тело {
      r.setValue("application/json", forHTTPHeaderField: "Content-Type")
      r.httpBody = try JSONSerialization.data(withJSONObject: тело)
    }
    let (d, http) = try await API.сЛичностью(r)
    return try разобрать(d, http)
  }

  /// Подключён ли Telegram у этого человека.
  static func подключено() async throws -> Bool {
    let о = try await запрос("api/tg/connect/status", "GET", nil)
    return (о["подключено"] as? Bool) ?? false
  }

  /// Шаг 1: телефон. Возвращает ручку разговора и номер в том виде, как его
  /// понял Telegram, — чтобы человек заметил опечатку СЕЙЧАС.
  static func начать(телефон: String) async throws -> (handle: String, phone: String) {
    let о = try await запрос("api/tg/connect/start", "POST", ["phone": телефон])
    return (
      handle: (о["handle"] as? String) ?? "",
      phone: (о["phone"] as? String) ?? телефон
    )
  }

  /// Шаг 2: код. `true` — Telegram просит ещё и пароль двухфакторной защиты.
  static func код(handle: String, код: String) async throws -> Bool {
    let о = try await запрос(
      "api/tg/connect/code", "POST", ["handle": handle, "code": код])
    return (о["нужен_пароль"] as? Bool) ?? false
  }

  /// Шаг 3: пароль двухфакторной защиты. Не сохраняется — уходит в Telegram.
  static func пароль(handle: String, пароль: String) async throws {
    _ = try await запрос(
      "api/tg/connect/password", "POST", ["handle": handle, "password": пароль])
  }

  /// Отключить. На сервере это выход из сессии MTProto, а затем удаление —
  /// в таком порядке, иначе строка исчезает, а сессия у Telegram остаётся.
  static func отключить() async throws {
    _ = try await запрос("api/tg/connect", "DELETE", nil)
  }
}
