import XCTest
@testable import Vibee

/// A failed agent turn reads in the phone's language. Every case passes
/// `russian:` explicitly, so the result does not depend on the test machine.
final class AgentChatFailureTests: XCTestCase {
  private func hasCyrillic(_ s: String) -> Bool {
    s.unicodeScalars.contains { (0x0400...0x04FF).contains($0.value) }
  }

  func testEveryServerCodeHasASentenceInBothLanguages() {
    let codes = [
      "sign_in", "forbidden", "bad_request", "agent_unavailable", "not_seller",
      "no_answer", "model_failed", "internal", "step_limit",
    ]
    for code in codes {
      let en = AgentChatView.failureSentence(
        code: code, words: nil, fallbackEN: "FALLBACK", fallbackRU: "ЗАПАСНОЙ", russian: false)
      let ru = AgentChatView.failureSentence(
        code: code, words: nil, fallbackEN: "FALLBACK", fallbackRU: "ЗАПАСНОЙ", russian: true)
      XCTAssertNotEqual(en, "FALLBACK", code)
      XCTAssertFalse(hasCyrillic(en), code)
      XCTAssertNotEqual(ru, "ЗАПАСНОЙ", code)
      XCTAssertTrue(hasCyrillic(ru), code)
    }
  }

  func testARefusalIsReadFromItsBody() {
    let body: [String: Any] = ["code": "not_seller", "error": "not a seller"]
    // The gate words its refusals in English: a Russian reader gets the sentence.
    XCTAssertTrue(hasCyrillic(AgentChatView.refusal(status: 403, body: body, russian: true)))
    XCTAssertEqual(
      AgentChatView.refusal(status: 403, body: body, russian: false),
      "Only a seller can talk to the agent about a client.")
    // No body at all still names the status, never an empty bubble.
    XCTAssertTrue(AgentChatView.refusal(status: 502, body: [:], russian: false).contains("502"))
  }

  func testARussianReaderKeepsTheProviderList() {
    let event: [String: Any] = [
      "тип": "ошибка", "code": "no_answer", "текст": "модель не ответила: groq empty",
    ]
    XCTAssertEqual(
      AgentChatView.streamFailure(event, russian: true), "модель не ответила: groq empty")
    XCTAssertEqual(
      AgentChatView.streamFailure(event, russian: false),
      "None of the models answered. Try again in a minute.")
  }

  func testTheStepLimitNamesTheCountInEnglish() {
    let reason = "достигнут предел 24 витков вызова инструментов"
    XCTAssertEqual(
      AgentChatView.stepLimitSentence(reason, russian: false),
      "Stopped after 24 tool steps — try a smaller task.")
    XCTAssertTrue(AgentChatView.stepLimitSentence(reason, russian: true).contains(reason))
  }
}
