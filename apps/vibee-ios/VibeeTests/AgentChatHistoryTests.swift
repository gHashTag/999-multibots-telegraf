import XCTest
@testable import Vibee

/// THE SHARED CONVERSATION ON THE PHONE.
///
/// This screen used to keep a private file and post one message per turn, so
/// the model answered every iOS question with no memory at all, and nothing
/// said in the bot or the mini app was ever visible here.
///
/// Two properties are worth pinning, and they fail in opposite directions:
/// losing the shared history, and losing something only this device holds.
final class AgentChatHistoryTests: XCTestCase {

  private typealias Turn = AgentChatView.Реплика
  private typealias ServerTurn = AgentChatView.ServerTurn

  private func mine(_ text: String) -> Turn { Turn(свой: true, текст: text) }
  private func agent(_ text: String) -> Turn { Turn(свой: false, текст: text) }

  // MARK: - mergeHistory

  func testServerHistoryReplacesTheLocalCopy() {
    let merged = AgentChatView.mergeHistory(
      server: [
        ServerTurn(role: "user", content: "sent from the bot", surface: nil),
        ServerTurn(role: "assistant", content: "good evening", surface: nil),
      ],
      local: [mine("stale local turn")])

    XCTAssertEqual(merged.count, 2)
    XCTAssertEqual(merged[0].текст, "sent from the bot")
    XCTAssertTrue(merged[0].свой)
    XCTAssertFalse(merged[1].свой)
  }

  /// An empty answer means "nothing shared yet", not "the conversation was
  /// cleared". Otherwise a dropped connection would wipe a visible chat.
  func testAnEmptyAnswerDoesNotWipeTheLocalCopy() {
    let local = [mine("do not lose me")]
    let merged = AgentChatView.mergeHistory(server: [], local: local)
    XCTAssertEqual(merged.map(\.текст), ["do not lose me"])
  }

  /**
   * THE MOST IMPORTANT ONE HERE.
   *
   * A proposal (`tg_send` and its siblings) arrives ONLY in the live stream --
   * it is not stored server-side and cannot be fetched back. Replacing a turn
   * whose proposal is still unanswered would erase the only window in which
   * the person can say yes or no, while the agent goes on waiting for an
   * answer that can no longer be given.
   */
  func testAnUnansweredProposalBlocksTheReplacement() {
    var withProposal = agent("send this to Anna?")
    withProposal.предложение = AgentChatView.Предложение(
      действие: "tg_send", куда: "Anna", что: "hello",
      пояснение: "draft", одобрено: nil)

    let merged = AgentChatView.mergeHistory(
      server: [ServerTurn(role: "user", content: "something else entirely", surface: nil)],
      local: [mine("a question"), withProposal])

    XCTAssertEqual(merged.count, 2)
    XCTAssertNotNil(merged[1].предложение)
    XCTAssertEqual(merged[1].текст, "send this to Anna?")
  }

  /// An answered one does not block it: the decision is made and the window is
  /// no longer needed.
  func testAnAnsweredProposalDoesNotBlockTheReplacement() {
    var decided = agent("send this to Anna?")
    decided.предложение = AgentChatView.Предложение(
      действие: "tg_send", куда: "Anna", что: "hello",
      пояснение: "draft", одобрено: true)

    let merged = AgentChatView.mergeHistory(
      server: [ServerTurn(role: "user", content: "from the mini app", surface: nil)],
      local: [decided])

    XCTAssertEqual(merged.map(\.текст), ["from the mini app"])
  }

  // MARK: - requestMessages

  /// Exactly one turn used to travel, so the model answered with no memory.
  func testTheQuestionTravelsWithTheConversation() {
    let body = AgentChatView.requestMessages(
      history: [mine("draw me a cat"), agent("done")],
      question: "now make it shorter")

    XCTAssertEqual(body.count, 3)
    XCTAssertEqual(body[0], ["role": "user", "content": "draw me a cat"])
    XCTAssertEqual(body[1], ["role": "assistant", "content": "done"])
    XCTAssertEqual(body[2], ["role": "user", "content": "now make it shorter"])
  }

  /**
   * An empty bubble is a placeholder for an answer that is still streaming,
   * and a failed turn leaves it empty forever. Sending `content: ""` would ask
   * the model to account for a silence it never produced.
   */
  func testEmptyPlaceholderBubblesAreNotSent() {
    let body = AgentChatView.requestMessages(
      history: [mine("a question"), agent("")],
      question: "more")

    XCTAssertEqual(body.count, 2)
    XCTAssertFalse(body.contains { $0["content"] == "" })
  }

  /// The limit matches the bot's. A different one would give the same person a
  /// different memory depending on which app they happened to open.
  func testTheTailIsTakenRatherThanTheStart() {
    let long = (1...60).map { mine("turn \($0)") }
    let body = AgentChatView.requestMessages(
      history: long, question: "the last one", limit: 40)

    XCTAssertEqual(body.count, 41)
    XCTAssertEqual(body[0]["content"], "turn 21")
    XCTAssertEqual(body.last?["content"], "the last one")
  }

  func testAnEmptyHistoryYieldsJustTheQuestion() {
    let body = AgentChatView.requestMessages(history: [], question: "hello")
    XCTAssertEqual(body, [["role": "user", "content": "hello"]])
  }

  // MARK: - surfaceLabel

  /*
   * One conversation spans the bot, the mini app and this phone. Without a
   * marker a reply can answer a question that was never typed on this screen,
   * and the transcript reads as the agent answering itself.
   *
   * The failure to avoid is the opposite one: a caption on every bubble. Noise
   * is what stops people reading the captions that matter.
   */
  func testOtherSurfacesAreNamed() {
    XCTAssertNotNil(AgentChatView.surfaceLabel("bot"))
    XCTAssertNotNil(AgentChatView.surfaceLabel("miniapp"))
    XCTAssertNotNil(AgentChatView.surfaceLabel("agent"))
  }

  func testThisSurfaceIsNotNamed() {
    XCTAssertNil(AgentChatView.surfaceLabel(AgentChatView.thisSurface))
    XCTAssertNil(AgentChatView.surfaceLabel("ios"))
  }

  /// A turn stored before this existed, or by a client that did not name
  /// itself, carries the column default. "From somewhere" would be a caption
  /// that looks like knowledge.
  func testUnknownAndMissingSayNothing() {
    XCTAssertNil(AgentChatView.surfaceLabel("unknown"))
    XCTAssertNil(AgentChatView.surfaceLabel(nil))
    XCTAssertNil(AgentChatView.surfaceLabel(""))
  }

  func testTheSurfaceSurvivesTheMerge() {
    let merged = AgentChatView.mergeHistory(
      server: [
        ServerTurn(role: "user", content: "asked in the bot", surface: "bot")
      ],
      local: [])
    XCTAssertEqual(merged.first?.surface, "bot")
  }
}
