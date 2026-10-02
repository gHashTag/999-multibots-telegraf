import XCTest

@testable import Vibee

/// What the app says about money must be true and readable: a failed credit
/// is not "coming shortly", and a refusal is not Russian on an English phone.
final class TokenPurchaseTests: XCTestCase {
  func testAFailedCreditIsNotReadAsNothingYet() {
    let failed = API.TokenVerify(body: [
      "ok": false, "зачисление_провалено": true, "баланс": 40,
    ])
    XCTAssertTrue(failed.creditFailed)
    XCTAssertNil(failed.credited)
    XCTAssertEqual(failed.balance, 40)

    let notYet = API.TokenVerify(body: ["ok": false, "баланс": 40])
    XCTAssertFalse(notYet.creditFailed, "plain ok:false is 'not visible yet'")
  }

  func testACreditIsBelievedOnlyOnOkTrue() {
    let credited = API.TokenVerify(body: ["ok": true, "зачислено_токенов": 100, "баланс": 140])
    XCTAssertEqual(credited.credited, 100)
    XCTAssertFalse(credited.creditFailed)
    // Fails closed: a missing ok is not a yes.
    XCTAssertNil(API.TokenVerify(body: ["зачислено_токенов": 100]).credited)
  }

  func testTheFailedCreditSentenceSaysSoInBothLanguages() {
    let en = TokenPurchase.creditFailedText(russian: false)
    XCTAssertTrue(en.contains("the tokens were not added"))
    XCTAssertNil(en.range(of: "\\p{Cyrillic}", options: .regularExpression))
    XCTAssertTrue(TokenPurchase.creditFailedText(russian: true).contains("токены не зачислены"))
  }

  func testRefusalsAreTranslatedByCode() {
    let signIn = API.TokenPurchaseError.refused(
      code: "sign_in", text: "нужна подпись или ключ агента")
    XCTAssertEqual(signIn.text(russian: false), "Open the app from Telegram to pay")
    XCTAssertEqual(signIn.text(russian: true), "нужна подпись или ключ агента")

    for (code, sentence) in API.TokenPurchaseError.codes {
      let text = API.TokenPurchaseError.refused(code: code, text: "x").text(russian: false)
      XCTAssertEqual(text, sentence, code)
      XCTAssertNil(text.range(of: "\\p{Cyrillic}", options: .regularExpression), code)
    }
  }

  func testAnUnknownRefusalIsHonestNotRussian() {
    let old = API.TokenPurchaseError.refused(code: nil, text: "касса не настроена")
    XCTAssertEqual(old.text(russian: false), "Couldn't start the payment")
    let newer = API.TokenPurchaseError.refused(code: "from_the_future", text: "что-то")
    XCTAssertEqual(newer.text(russian: false), "Couldn't start the payment")
    XCTAssertEqual(
      API.TokenPurchaseError.refused(code: nil, text: "").text(russian: true), "не получилось")
  }
}
