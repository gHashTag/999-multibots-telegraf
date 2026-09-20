import Foundation
#if canImport(UIKit)
import UIKit
#endif

/**
 * ОШИБКА, УВИДЕННАЯ ЧЕЛОВЕКОМ, ОБЯЗАНА ДОЙТИ ДО ВЛАДЕЛЬЦА.
 *
 * У веба (`player/src/lib/clientErrorBeacon.ts`) этот маяк есть с 08.09.2026:
 * браузер шлёт `/api/client-error`, сервер гасит шторм повторов и присылает
 * владельцу ОДНО сообщение в Telegram на вид ошибки за десять минут. У iOS
 * такого маяка не было НИ ОДНОГО — весь этот файл на 07.09.2026 не существовал,
 * и `grep -rn 'client-error' apps/vibee-ios` возвращал пусто.
 *
 * ЦЕНА ОТСУТСТВИЯ ИЗМЕРЕНА ЭТОЙ ЖЕ СЕССИЕЙ, А НЕ ПРЕДПОЛОЖЕНА. Три реальных
 * дефекта синхронизации чата агента — устаревший текст входа в
 * AgentChatView, обрыв потока без сохранения частичного ответа, отсутствие
 * разбора событий «ошибка»/«готово» — были найдены только потому, что
 * человек лично пожаловался в разговоре. Одинаковый класс дефектов на вебе
 * УЖЕ виден владельцу в Telegram без единой жалобы: `formatClientErrorAlert`
 * шлёт «🟥 Мини-апп: ошибка у пользователя» с текстом, экраном и кем именно.
 * На телефоне тот же обрыв потока был бы виден только тому, кто на него
 * смотрит в момент обрыва, — то есть почти никогда.
 *
 * ФОРМА ОТЧЁТА ПОВТОРЯЕТ ВЕБ БУКВАЛЬНО: `kind/message/context/path/ua/build/ts`
 * — сервер (`render/src/client-errors.ts`) уже умеет её разбирать и не менялся
 * ради iOS ни строкой. Заводить второй формат значило бы завести второе место,
 * где сервер и клиент могут разойтись.
 */
enum ClientErrorBeacon {
  private static let очередьКлюч = "trinity.client-errors.queue"
  private static let лимитОчереди = 20
  /// Раз за запуск процесса на (kind, message) — переживает не дольше, чем
  /// сам процесс: то же поведение, что `SESSION_DEDUP` у веба (Set в памяти
  /// вкладки). Настоящую защиту от шторма даёт сервер (`ClientErrorGate`);
  /// это — только чтобы один и тот же цикл повторов не долбил сеть тысячу раз.
  private static var замеченоЗаЗапуск = Set<String>()

  /// Отправить отчёт. Никогда не бросает и не блокирует вызывающего — это
  /// сторонний эффект, а не часть основного пути. `context` — до 600 симв.,
  /// как у веба; больше сервер всё равно обрежет (`LIMITS.context`).
  static func отправить(kind: String, message: String, context: String = "") {
    let ключ = "\(kind)|\(String(message.prefix(120)))"
    guard !замеченоЗаЗапуск.contains(ключ) else { return }
    замеченоЗаЗапуск.insert(ключ)
    let тело = собратьТело(kind: kind, message: message, context: context)
    Task.detached(priority: .background) {
      let доставлено = await послать(тело)
      if !доставлено { добавитьВОчередь(тело) }
    }
  }

  /**
   * Хвост из прошлого запуска. Зовётся один раз при старте приложения —
   * ровно как `flushClientErrorQueue()` у веба, и по той же причине: отчёт
   * об обрыве сети написан именно тогда, когда сеть недоступна, и первая
   * попытка почти всегда проваливается. Очередь переживает выход из
   * приложения, потому что лежит в UserDefaults, а не в памяти.
   */
  static func отправитьОтложенные() {
    let ожидающие = прочитатьОчередь()
    guard !ожидающие.isEmpty else { return }
    записатьОчередь([])
    Task.detached(priority: .background) {
      var осталось: [[String: Any]] = []
      for тело in ожидающие {
        if await послать(тело) == false { осталось.append(тело) }
      }
      if !осталось.isEmpty { добавитьВОчередь(contentsOf: осталось) }
    }
  }

  // MARK: - Внутреннее

  private static func собратьТело(
    kind: String, message: String, context: String
  ) -> [String: Any] {
    [
      "kind": kind,
      "message": String(message.prefix(400)),
      "context": String(context.prefix(600)),
      // У веба здесь `location.pathname` — экран браузера. У приложения нет
      // адресной строки, поэтому путь — имя SwiftUI-экрана, откуда позвали.
      "path": "ios",
      "ua": юзерАгент,
      "build": сборка,
      "ts": Int(Date().timeIntervalSince1970 * 1000),
    ]
  }

  private static var юзерАгент: String {
    #if canImport(UIKit)
    let устройство = UIDevice.current
    return "Vibee-iOS/\(сборка) (\(устройство.model); iOS \(устройство.systemVersion))"
    #else
    return "Vibee-iOS/\(сборка)"
    #endif
  }

  /// `CFBundleVersion` — тот же счётчик коммитов, что `run.sh`/fastlane
  /// подставляют при сборке (см. README «Номер сборки — счёт коммитов»).
  /// Совпадает с тем, что видно в TestFlight, поэтому по этому числу можно
  /// сразу понять, какая именно сборка упала.
  private static var сборка: String {
    (Bundle.main.infoDictionary?["CFBundleVersion"] as? String) ?? "?"
  }

  private static func послать(_ тело: [String: Any]) async -> Bool {
    var r = URLRequest(url: API.base.appendingPathComponent("api/client-error"))
    r.httpMethod = "POST"
    r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    // Личность — ТЕМ ЖЕ способом, что и everywhere: сервер называет «кем»
    // в алерте владельцу по этому же заголовку (`verifiedTelegramId`).
    for (k, v) in Identity.headers() { r.setValue(v, forHTTPHeaderField: k) }
    r.httpBody = try? JSONSerialization.data(withJSONObject: тело)
    r.timeoutInterval = 10
    do {
      let (_, resp) = try await URLSession.shared.data(for: r)
      return (200..<300).contains((resp as? HTTPURLResponse)?.statusCode ?? 0)
    } catch {
      return false
    }
  }

  private static func прочитатьОчередь() -> [[String: Any]] {
    guard let data = UserDefaults.standard.data(forKey: очередьКлюч),
          let список = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else { return [] }
    return список
  }

  private static func записатьОчередь(_ список: [[String: Any]]) {
    guard let data = try? JSONSerialization.data(withJSONObject: список) else { return }
    UserDefaults.standard.set(data, forKey: очередьКлюч)
  }

  private static func добавитьВОчередь(_ тело: [String: Any]) {
    добавитьВОчередь(contentsOf: [тело])
  }

  private static func добавитьВОчередь(contentsOf новые: [[String: Any]]) {
    let итог = (прочитатьОчередь() + новые).suffix(лимитОчереди)
    записатьОчередь(Array(итог))
  }
}
