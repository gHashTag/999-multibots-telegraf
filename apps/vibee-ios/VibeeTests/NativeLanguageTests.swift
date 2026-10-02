import XCTest
@testable import Vibee

/// Native screens follow the phone's language through say(en, ru), like the
/// tab bar. These pin the pieces that carry numbers, where a translation goes
/// wrong in grammar rather than in words.
final class NativeLanguageTests: XCTestCase {
  func testPackLabelAgreesInBothLanguages() {
    XCTAssertEqual(packLabel(tokens: 1, stars: 1, russian: false), "1 token for 1 Star")
    XCTAssertEqual(packLabel(tokens: 100, stars: 50, russian: false), "100 tokens for 50 Stars")
    XCTAssertEqual(packLabel(tokens: 1, stars: 1, russian: true), "1 токен за 1 звезду")
    XCTAssertEqual(packLabel(tokens: 22, stars: 25, russian: true), "22 токена за 25 звёзд")
  }

  func testServerAnsweredCarriesTheStatusInThePhonesLanguage() {
    let text = serverAnswered(502)
    XCTAssertTrue(text.contains("502"))
    XCTAssertEqual(text, say("the server answered 502", "сервер ответил 502"))
  }

  /// The confirm button said "Send" for every action, so marking a chat as
  /// read meant pressing "Send". The verb now names what happens.
  func testConfirmationButtonsNameTheAction() {
    let window = ОкноПодтверждения.self  // cyrillic-ok: pre-existing type name
    XCTAssertEqual(window.labels(for: "send", russian: false).confirm, "Send")
    XCTAssertEqual(window.labels(for: "read", russian: false).confirm, "Mark as read")
    XCTAssertEqual(window.labels(for: "forward", russian: false).confirm, "Forward")
    XCTAssertEqual(window.labels(for: "something new", russian: false).confirm, "Confirm")
    for action in ["read", "forward", "something new"] {
      for russian in [false, true] {
        let send = window.labels(for: "send", russian: russian).confirm
        XCTAssertNotEqual(window.labels(for: action, russian: russian).confirm, send, action)
      }
    }
  }

  /// A niche or style added later without an English label would show
  /// Russian on an English phone. The value itself must not change: saved
  /// templates and the server keys are built on it.
  func testEveryScriptChipHasAnEnglishLabel() {
    let catalog = КаталогСценария.self  // cyrillic-ok: pre-existing type name
    for name in catalog.ниши + catalog.стили {  // cyrillic-ok: pre-existing names
      let english = catalog.label(name, russian: false)
      XCTAssertNil(english.range(of: "\\p{Cyrillic}", options: .regularExpression), name)
      XCTAssertEqual(catalog.label(name, russian: true), name)
    }
    XCTAssertEqual(catalog.label("Другое", russian: false), "Other")
  }

  /// The run button's reason is the first thing an English phone reads when
  /// generation is not possible. Each reason keeps its numbers in both
  /// languages, and per-second models name the unit, not a total.
  func testRunButtonReasonsFollowTheLanguage() {
    XCTAssertEqual(GenerateText.sourceMissing(video: true, uploading: false, russian: false), "A video is needed")
    XCTAssertEqual(GenerateText.sourceMissing(video: false, uploading: false, russian: false), "A photo is needed")
    XCTAssertEqual(GenerateText.sourceMissing(video: true, uploading: true, russian: false), "The file is uploading")
    XCTAssertEqual(
      GenerateText.shortfall(price: 20, balance: 16, perSecond: false, russian: false),
      "not enough tokens: 20 needed, you have 16")
    let perSecond = GenerateText.shortfall(price: 3, balance: 2, perSecond: true, russian: false)
    XCTAssertTrue(perSecond.contains("per second"), perSecond)
    for russian in [false, true] {
      for perSecond in [false, true] {
        let text = GenerateText.shortfall(price: 20, balance: 16, perSecond: perSecond, russian: russian)
        XCTAssertTrue(text.contains("20") && text.contains("16"), text)
        let cyrillic = text.range(of: "\\p{Cyrillic}", options: .regularExpression) != nil
        XCTAssertEqual(cyrillic, russian, text)
      }
    }
  }

  /// Errors reach every screen that talks to the server, so an English phone
  /// must not get a Russian sentence around an English system reason.
  func testServerErrorsFollowTheLanguage() {
    let offline = NSError(domain: "net", code: -1009)
    let action: [API.ActionError] = [.нуженВход, .отказ(500), .странныйОтвет, .сеть(offline)]  // cyrillic-ok: pre-existing case names
    let project: [API.ProjectError] = [.нетВхода, .отказ(502, ""), .сеть(offline), .разбор("x")]  // cyrillic-ok: pre-existing case names
    let texts = action.map { ($0.text(russian: false), $0.text(russian: true)) }
      + project.map { ($0.text(russian: false), $0.text(russian: true)) }
    for (en, ru) in texts {
      XCTAssertNil(en.range(of: "\\p{Cyrillic}", options: .regularExpression), en)
      XCTAssertNotNil(ru.range(of: "\\p{Cyrillic}", options: .regularExpression), ru)
    }
    XCTAssertTrue(API.ActionError.отказ(500).text(russian: false).contains("500"))  // cyrillic-ok: pre-existing case names
    // A server's own message is passed through as is, in either language.
    XCTAssertEqual(API.ProjectError.отказ(400, "bad prompt").text(russian: false), "bad prompt")  // cyrillic-ok: pre-existing case names
  }

  func testFramesLabelAgrees() {
    XCTAssertEqual(framesLabel(1, russian: false), "1 frame")
    XCTAssertEqual(framesLabel(120, russian: false), "120 frames")
    XCTAssertEqual(framesLabel(2, russian: true), "2 кадра")
    XCTAssertEqual(framesLabel(25, russian: true), "25 кадров")
  }
}
