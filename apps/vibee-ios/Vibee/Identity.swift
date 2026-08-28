import Foundation
import Security

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

  /// Access-токен сессии. Появится, когда заработает вход через Telegram.
  static var accessToken: String? {
    get { прочитать("access-token") }
    set { записать("access-token", newValue) }
  }

  /// Есть ли чем представиться. Экраны спрашивают это, а не разбирают ключи.
  static var known: Bool { accessToken != nil || agentKey != nil }

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
  private static func записать(_ ключ: String, _ значение: String?) {
    let base: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: сервис,
      kSecAttrAccount as String: ключ,
    ]
    SecItemDelete(base as CFDictionary)
    guard let значение, let data = значение.data(using: .utf8) else { return }
    var add = base
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    SecItemAdd(add as CFDictionary, nil)
  }

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
    else { return nil }
    return s
  }
}
