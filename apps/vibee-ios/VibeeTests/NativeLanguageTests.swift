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
}
