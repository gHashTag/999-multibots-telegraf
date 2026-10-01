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
}
