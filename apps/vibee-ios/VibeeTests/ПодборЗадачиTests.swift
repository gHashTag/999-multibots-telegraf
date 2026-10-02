import XCTest
@testable import Vibee

/**
 * Проверяет ровно тот дефект, который был отправлен в работу и найден
 * случайно: окно поиска «30 секунд назад» подхватывало ПРЕДЫДУЩУЮ генерацию.
 *
 * Тесты называют не «работает ли», а что обязано НЕ произойти: чужая задача не
 * должна стать нашей. Ошибка здесь стоит человеку чужого ролика вместо своего.
 */
final class ПодборЗадачиTests: XCTestCase {
  private let начало = Date(timeIntervalSince1970: 1_000_000)

  private func задача(
    _ вид: String, сдвигСекунд: TimeInterval, состояние: String = "done",
    url: String? = "u"
  ) -> ПодборЗадачи.Задача {
    ПодборЗадачи.Задача(
      kind: вид,
      startedAt: (начало.timeIntervalSince1970 + сдвигСекунд) * 1000,
      state: состояние, url: url, error: nil)
  }

  func testПредыдущаяГенерацияНеСтановитсяНашей() {
    // Ровно прежний дефект: задача за 20 секунд ДО запроса попадала в окно −30.
    let чужая = задача("video", сдвигСекунд: -20)
    XCTAssertNil(
      ПодборЗадачи.своя(среди: [чужая], вид: "video", началоЗапроса: начало),
      "задача, начатая до нашего запроса, не может быть нашей")
  }

  func testДопускНаЧасыОставленНебольшой() {
    // Секунда назад — это расхождение часов, а не чужой запуск.
    let наша = задача("video", сдвигСекунд: -1)
    XCTAssertNotNil(
      ПодборЗадачи.своя(среди: [наша], вид: "video", началоЗапроса: начало))
  }

  func testБерётСамуюРаннююИзПодходящих() {
    // Порядок списка сервер не обещает — намеренно кладём позднюю первой.
    let поздняя = задача("video", сдвигСекунд: 30, url: "поздняя")
    let наша = задача("video", сдвигСекунд: 2, url: "наша")
    let выбрана = ПодборЗадачи.своя(
      среди: [поздняя, наша], вид: "video", началоЗапроса: начало)
    XCTAssertEqual(выбрана?.url, "наша")
  }

  func testЧужойВидНеПодходит() {
    let липсинк = задача("lipsync", сдвигСекунд: 2)
    XCTAssertNil(
      ПодборЗадачи.своя(среди: [липсинк], вид: "video", началоЗапроса: начало))
  }

  func testПустойСписокНеПадает() {
    XCTAssertNil(
      ПодборЗадачи.своя(среди: [], вид: "video", началоЗапроса: начало))
  }
}

/// The sentence a failed generation shows; the same rules as the web's
/// lib/generationRefusal.test.ts.
final class GenerationRefusalTests: XCTestCase {
  func testProviderFailureLeadsWithTheReadersLanguage() {
    let ru = GenerationRefusal.text(
      code: "generation_failed", detail: "ElevenLabs TTS error: 401", russian: true)
    XCTAssertEqual(ru.components(separatedBy: "\n").first, GenerationRefusal.codes["generation_failed"]?.ru)
    XCTAssertTrue(ru.contains("ElevenLabs TTS error: 401"), "the diagnosis is kept")
    let en = GenerationRefusal.text(
      code: "generation_failed", detail: "ElevenLabs TTS error: 401", russian: false)
    XCTAssertEqual(en.components(separatedBy: "\n").first, GenerationRefusal.codes["generation_failed"]?.en)
  }

  func testCallersOwnFixInTheReadersScriptStandsAlone() {
    let words = "не хватает токенов: нужно 20, есть 16"  // ru-only-ok: the server's own refusal text
    XCTAssertEqual(GenerationRefusal.text(code: "not_enough_tokens", detail: words, russian: true), words)
    let en = GenerationRefusal.text(code: "not_enough_tokens", detail: words, russian: false)
    XCTAssertEqual(en.components(separatedBy: "\n").first, GenerationRefusal.codes["not_enough_tokens"]?.en)
  }

  func testServersEnglishIsADevelopersLineNeverTheSentence() {
    for detail in ["unauthorized: token expired", "verified owner required"] {
      let en = GenerationRefusal.text(code: "sign_in", detail: detail, russian: false)
      XCTAssertEqual(en.components(separatedBy: "\n").first, GenerationRefusal.codes["sign_in"]?.en)
      XCTAssertTrue(en.contains(detail), "the diagnosis is kept")
    }
  }

  func testClipOverTheCeilingSaysTooLongWithTheLimitAfter() {
    let detail = "lipsync audio must be 10 seconds or shorter"
    let en = GenerationRefusal.text(code: "too_long", detail: detail, russian: false)
    XCTAssertEqual(en.components(separatedBy: "\n").first, GenerationRefusal.codes["too_long"]?.en)
    XCTAssertTrue(en.contains("10 seconds"), "the limit is kept")
    let ru = GenerationRefusal.text(code: "too_long", detail: detail, russian: true)
    XCTAssertEqual(ru.components(separatedBy: "\n").first, GenerationRefusal.codes["too_long"]?.ru)
  }

  func testEverySentenceIsInItsOwnScript() {
    for (code, s) in GenerationRefusal.codes {
      XCTAssertNotNil(s.ru.range(of: "\\p{Cyrillic}", options: .regularExpression), code)
      XCTAssertNil(s.en.range(of: "\\p{Cyrillic}", options: .regularExpression), code)
    }
  }

  func testUnknownOrMissingIsAnHonestDidNotWork() {
    XCTAssertEqual(GenerationRefusal.text(code: nil, detail: nil, russian: false), "It didn't work — try again")
    XCTAssertEqual(GenerationRefusal.text(code: "newer", detail: "", russian: false), "It didn't work — try again")
  }

  func testLongDumpIsCut() {
    let shown = GenerationRefusal.text(
      code: "generation_failed", detail: String(repeating: "x", count: 5000), russian: false)
    XCTAssertLessThan(shown.count, 300)
  }
}
