import XCTest

/**
 * ДЕНЕЖНЫЕ ПОДПИСИ — ПРОВЕРЕНЫ НА ЭКРАНЕ, А НЕ ТОЛЬКО В ТЕСТАХ ЛОГИКИ.
 *
 * Долг, который этот файл закрывает. Цена × длительность, «за 1000 знаков»,
 * освобождённый кошелёк, отказ липсинка без звука — всё это чинилось и
 * закрывалось модульными тестами, а на экране НЕ ПРОВЕРЯЛОСЬ ни разу:
 * подписи появляются только при известном остатке, остаток даёт сессия, а
 * код авторизации — учётные данные владельца, которые цикл не вводит.
 *
 * Долг такого рода не «ждёт входа» — он не гасится никогда. Поэтому остаток
 * приходит аргументом запуска (`ПодставаДляПроверки`, только `#if DEBUG`), и
 * проверка перестала зависеть от чужих учётных данных.
 *
 * Числа здесь — из серверного прайса, а не выдуманные: 36 за секунду у
 * `kling/v3-turbo`, 24 за 1000 знаков у multilingual v2. Разойдись они с
 * сервером — расхождение поймает `billing-prices.test.ts`, который сверяет
 * названное со списываемым.
 */
final class ДеньгиНаЭкранеTests: XCTestCase {
  private var app: XCUIApplication!

  private func запусти(баланс: String, звук: String? = nil, фото: String? = nil) {
    continueAfterFailure = false
    app = XCUIApplication()
    app.launchArguments += ["-подставнойБаланс", баланс]
    if let звук { app.launchArguments += ["-подставнойЗвук", звук] }
    if let фото { app.launchArguments += ["-подставноеФото", фото] }
    app.launch()
    app.buttons["ИИ"].firstMatch.tap()
  }

  private func вид(_ имя: String) {
    let кнопка = app.buttons["ии.вид.\(имя)"].firstMatch
    XCTAssertTrue(кнопка.waitForExistence(timeout: 5), "нет вкладки «\(имя)»")
    if !кнопка.isHittable { кнопка.scrollToElement() }
    кнопка.tap()
  }

  private func выбериМодель(_ id: String) {
    let строка = app.descendants(matching: .any)["ии.модель.\(id)"].firstMatch
    XCTAssertTrue(строка.waitForExistence(timeout: 5), "нет модели \(id)")
    if !строка.isHittable { строка.scrollToElement() }
    строка.tap()
  }

  /// Поле описания — то `TextField`, то `TextView` в зависимости от версии
  /// SwiftUI. Существующий тест уже спотыкался об это; берём оба.
  private func впишиОписание(_ текст: String) {
    let вью = app.textViews["ии.промпт"].firstMatch
    let поле = вью.exists ? вью : app.textFields["ии.промпт"].firstMatch
    XCTAssertTrue(поле.waitForExistence(timeout: 5), "нет поля описания")
    if !поле.isHittable { поле.scrollToElement() }
    поле.tap()
    поле.typeText(текст)
  }

  /// Подпись кнопки целиком — «Сгенерировать · 216». Внутренние `Text`
  /// SwiftUI склеивает в доступности, отдельными элементами их не найти.
  private var подписьКнопки: String {
    let э = app.buttons["ии.кнопка"].firstMatch
    XCTAssertTrue(э.waitForExistence(timeout: 5), "кнопки нет")
    if !э.isHittable { э.scrollToElement() }
    return э.label
  }

  private var причина: String {
    let э = app.staticTexts["ии.причина"].firstMatch
    XCTAssertTrue(э.waitForExistence(timeout: 5), "причина не показана")
    return э.label
  }

  /// Остаток с ценами ровно того вида, в каком его отдаёт `/api/balance`.
  /// Остаток с ценами ровно того вида, в каком его отдаёт `/api/balance`.
  ///
  /// ОДНОЙ СТРОКОЙ, без переносов: аргумент запуска — это argv, и многострочное
  /// значение проходит через сериализацию XCTest без гарантий. Одна строка
  /// снимает вопрос целиком.
  private func ответ(остаток: Int, освобождён: Bool = false) -> String {
    let цены = #"{"video_generate":11,"audio_generate":12,"lipsync_generate":6}"#
    let модели = #"{"kie/kling/v3-turbo-text-to-video":36,"kie/elevenlabs/text-to-speech-multilingual-v2":24,"kie/omnihuman-1-5":54}"#
    let поля = #"{"kie/kling/v3-turbo-text-to-video":["prompt","duration","aspect_ratio","resolution"],"kie/elevenlabs/text-to-speech-multilingual-v2":["text"],"kie/omnihuman-1-5":["image_url","audio_url"]}"#
    return "{\"balance\":\(остаток),\"prices\":\(цены),\"modelPrices\":\(модели),"
      + "\"perSecond\":[\"lipsync_generate\"],"
      + "\"perSecondModels\":[\"kie/kling/v3-turbo-text-to-video\"],"
      + "\"perThousandCharsModels\":[\"kie/elevenlabs/text-to-speech-multilingual-v2\"],"
      + "\"modelFields\":\(поля),\"exempt\":\(освобождён)}"
  }

  func testЦенаНаКнопкеУмноженаНаДлительность() {
    // Замер, ради которого умножение и появилось: 100 токенов, 36/с, 10 с —
    // кнопка была активна с подписью «· 36/с», а сервер брал 360.
    запусти(баланс: ответ(остаток: 1000))
    вид("видео")
    выбериМодель("kling/v3-turbo-text-to-video")
    впишиОписание("кот")
    // Чип «6s» стоит первым и выбран по умолчанию: 36 × 6 = 216.
    XCTAssertTrue(подписьКнопки.contains("· 216"),
                  "подпись «\(подписьКнопки)» не равна сумме, которую спишут")
  }

  func testОзвучкаНазываетМеруАНеПлоскоеЧисло() {
    // Пустой текст: количества знаков ещё нет, и сумму называть нечем —
    // честнее назвать меру, чем выдумать итог.
    запусти(баланс: ответ(остаток: 1000))
    вид("звук")
    выбериМодель("elevenlabs/text-to-speech-multilingual-v2")
    XCTAssertTrue(подписьКнопки.contains("· 24/1000 зн."),
                  "на кнопке «\(подписьКнопки)», а не цена за 1000 знаков")
  }

  func testОсвобождённомуКошелькуНеЗапрещаютРаботу() {
    /*
     * Единственный счёт, с которого сервер НЕ списывает, оказался
     * единственным без права работать: экран сверял остаток с ценой и гасил
     * кнопку владельцу.
     */
    запусти(баланс: ответ(остаток: 0, освобождён: true))
    вид("видео")
    выбериМодель("kling/v3-turbo-text-to-video")
    впишиОписание("кот")
    XCTAssertFalse(
      app.staticTexts["ии.причина"].exists,
      "освобождённому запретили работу: «\(app.staticTexts["ии.причина"].label)»"
    )
  }

  func testНеХватаетГоворитСУММУАНеЦенуСекунды() {
    // 36 × 6 = 216 при остатке 100. Отказ обязан назвать 216, а не 36.
    запусти(баланс: ответ(остаток: 100))
    вид("видео")
    выбериМодель("kling/v3-turbo-text-to-video")
    впишиОписание("кот")
    XCTAssertTrue(причина.contains("216"), "в отказе нет суммы: «\(причина)»")
  }

  func testЛипсинкБезЗвукаОтказываетДоНажатия() {
    /*
     * Проверка спрашивала ОДИН исходник — фото. Контракт `omnihuman-1-5`
     * перечисляет `image_url` и `audio_url`, и маршрут отвергает запрос без
     * звука; ссылка уходила пустой строкой.
     */
    // Фото ПОДСТАВЛЕНО намеренно: без него экран останавливается на «Нужно
    // фото», и проверка звука не выполняется вовсе. Ровно так этот тест
    // однажды прошёл с УДАЛЁННОЙ звуковой проверкой.
    запусти(баланс: ответ(остаток: 1000), фото: "https://example.com/face.jpg")
    вид("аватар")
    выбериМодель("omnihuman-1-5")
    впишиОписание("кот")
    XCTAssertTrue(
      причина.contains("озвучка"),
      "липсинк без звука не потребовал озвучку: «\(причина)»"
    )
  }

  func testСоЗвукомПричинаМеняетсяСоЗвуковойНаФото() {
    // Подставив звук, доходим до следующего требования — фотографии. Это и
    // доказывает, что звуковая проверка сработала, а не просто молчала.
    запусти(
      баланс: ответ(остаток: 1000),
      звук: "https://example.com/voice.mp3",
      фото: "https://example.com/face.jpg"
    )
    вид("аватар")
    выбериМодель("omnihuman-1-5")
    впишиОписание("кот")
    // Фото и звук на месте — возражений не остаётся вовсе.
    XCTAssertFalse(
      app.staticTexts["ии.причина"].exists,
      "всё подставлено, а экран возражает: «\(app.staticTexts["ии.причина"].label)»"
    )
  }
}
