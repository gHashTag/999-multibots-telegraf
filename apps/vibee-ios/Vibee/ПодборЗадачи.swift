import Foundation

/**
 * Выбор СВОЕЙ задачи среди чужих — вынесен из экрана, чтобы его можно было
 * проверить.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫМ ФАЙЛОМ. Эта логика жила приватной функцией внутри
 * `GenerateScreen` и содержала дефект: окно поиска начиналось за ТРИДЦАТЬ
 * секунд до запроса, а из подходящих бралась `.first` по списку, порядок
 * которого сервер не обещает. В такое окно попадает предыдущая генерация того
 * же вида — то есть код отдавал бы человеку чужой результат, ровно то, от чего
 * предостерегал комментарий рядом с ним.
 *
 * Ни сборка, ни UI-тест этого не видят: окно срабатывает только когда запусков
 * два подряд. Нашлось перечитыванием собственного кода на следующий день, то
 * есть случайно. Чистая функция без `URLSession` и без `View` — единственный
 * способ поймать такое до отправки.
 */
enum ПодборЗадачи {
  /// Минимум, что нужно знать о задаче для выбора. Соответствует полям
  /// `/api/generate/jobs`, измеренным живым запросом: `startedAt` приходит в
  /// МИЛЛИсекундах (1788590670206 как секунды — это 58648 год).
  struct Задача {
    let kind: String
    let startedAt: Double
    let state: String
    let url: String?
    let error: String?
    var code: String? = nil
  }

  /**
   * Наша задача — САМАЯ РАННЯЯ из начатых не раньше запроса.
   *
   * Сервер заводит задачу ПОСЛЕ того, как запрос ушёл, поэтому её `startedAt`
   * не может предшествовать нашему началу. `допуск` остаётся только на
   * расхождение часов устройства и сервера — не на «примерно тогда же».
   *
   * Из подходящих берём самую раннюю: наша создана первой после отправки,
   * всё, что позже, принадлежит другому запросу.
   */
  static func своя(
    среди задачи: [Задача],
    вид: String,
    началоЗапроса: Date,
    допускСекунд: TimeInterval = 5
  ) -> Задача? {
    let порог = началоЗапроса.addingTimeInterval(-допускСекунд)
    return задачи
      .filter { з in
        з.kind == вид
          && Date(timeIntervalSince1970: з.startedAt / 1000) >= порог
      }
      .min { $0.startedAt < $1.startedAt }
  }
}

/**
 A FAILED GENERATION, IN THE READER'S LANGUAGE.

 The screen showed the server's `error` as it came: a billing reason in
 Russian, a provider's English ("ElevenLabs TTS error: 401 - ..."), whatever
 the phone's language. Since 2026-10-02 the server names every failure with a
 `code` (render/generation-refusal.ts), and this turns the code into a
 sentence. The server's words still follow on a second line -- they are the
 diagnosis, and the screen's own comment explains why they matter. When they
 are Russian, the reader is Russian and the failure is the caller's to fix
 ("need 20, have 16"), they are the best sentence there is and stand alone.
 Only Russian: the server's English is a developer's line ("unauthorized:
 <reason>"), and passed alone it hid "sign in again" from English readers.

 Lives next to `ПодборЗадачи` because both read the same job record, and a
 file here costs a project-file edit. The same sentences are in the web's
 lib/generationRefusal.ts; generation-refusal-codes.test.ts in render checks
 both against the server's list.
 */
enum GenerationRefusal {
  static let codes: [String: (en: String, ru: String)] = [
    "bad_input": ("Something is missing in the request — check the fields", "В запросе чего-то не хватает — проверь поля"),  // ru-only-ok: the russian sentence
    "sign_in": ("Sign in again to generate", "Войди заново, чтобы генерировать"),  // ru-only-ok: the russian sentence
    "not_enough_tokens": ("Not enough tokens — top up to continue", "Не хватает токенов — пополни баланс"),  // ru-only-ok: the russian sentence
    "forbidden": ("This model isn't available to your account", "Эта модель недоступна для твоего аккаунта"),  // ru-only-ok: the russian sentence
    "unavailable": ("The service is busy — try again in a minute", "Сервис занят — попробуй через минуту"),  // ru-only-ok: the russian sentence
    "generation_failed": ("The generation didn't go through — try again or pick another model", "Генерация не получилась — попробуй ещё раз или другую модель"),  // ru-only-ok: the russian sentence
  ]

  /// Failures the caller can fix; their detail may stand alone.
  static let callersToFix: Set<String> = ["bad_input", "sign_in", "not_enough_tokens", "forbidden"]

  static func text(code: String?, detail: String?, russian: Bool = speaksRussian) -> String {
    let words = String((detail ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(200))
    let cyrillic = words.range(of: "\\p{Cyrillic}", options: .regularExpression) != nil
    if !words.isEmpty, russian, cyrillic, let code, callersToFix.contains(code) {
      return words
    }
    let headline: String
    if let code, let known = codes[code] {
      headline = russian ? known.ru : known.en
    } else {
      headline = russian ? "Не получилось — попробуй ещё раз" : "It didn't work — try again"  // ru-only-ok: the russian branch
    }
    return words.isEmpty ? headline : headline + "\n" + words
  }
}
