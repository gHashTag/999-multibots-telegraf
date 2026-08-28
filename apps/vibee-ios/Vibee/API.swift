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
  }

  private struct FeedResponse: Decodable { let templates: [Template] }

  static func feed(page: Int = 0, limit: Int = 20) async throws -> [Template] {
    var c = URLComponents(url: base.appendingPathComponent("api/feed"),
                          resolvingAgainstBaseURL: false)!
    c.queryItems = [.init(name: "page", value: "\(page)"),
                    .init(name: "limit", value: "\(limit)"),
                    .init(name: "sort", value: "recent")]
    let (data, _) = try await URLSession.shared.data(from: c.url!)
    return try JSONDecoder().decode(FeedResponse.self, from: data).templates
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
    var r = URLRequest(url: base.appendingPathComponent("api/feed/\(templateId)/view"))
    r.httpMethod = "POST"
    r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    for (k, v) in Identity.headers() { r.setValue(v, forHTTPHeaderField: k) }
    do {
      let (_, resp) = try await URLSession.shared.data(for: r)
      if let http = resp as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
        NSLog("[Feed] просмотр не засчитан: HTTP \(http.statusCode)")
      }
    } catch {
      NSLog("[Feed] просмотр не засчитан: \(error.localizedDescription)")
    }
  }

}
