import XCTest
@testable import Vibee

/// A CARD'S CHAT ON THE PHONE (spec kanban-card-chat.t27).
///
/// A tap on a card in the native kanban opens the agent chat on the card's
/// task thread `task:<owner>/<repo>#<n>` -- the same conversation the web
/// sheet and A2A agents continue. The failure worth pinning is the quiet one:
/// a render that predates task threads ignores `task` and answers with the
/// person's own chat, and a turn written then lands in the wrong thread.
final class CardChatTaskTests: XCTestCase {

  // The app names its chat turn in Russian; the alias keeps the rest English.
  private typealias Turn = AgentChatView.Реплика  // cyrillic-ok: existing type

  // MARK: - taskRef

  func testTaskRefKeepsAFullRepository() {
    XCTAssertEqual(AgentChatView.taskRef(repo: "gHashTag/t27", number: 5382), "gHashTag/t27#5382")
  }

  func testABareRepositoryBelongsToTheBoardsOwner() {
    XCTAssertEqual(AgentChatView.taskRef(repo: "t27", number: 7), "gHashTag/t27#7")
  }

  // MARK: - historyQuery

  func testThePersonsChatAsksForNoTask() {
    let items = AgentChatView.historyQuery(task: nil)
    XCTAssertEqual(items.map(\.name), ["limit"])
  }

  func testACardAsksForItsThread() {
    let items = AgentChatView.historyQuery(task: "gHashTag/t27#5382")
    XCTAssertEqual(items.first { $0.name == "task" }?.value, "gHashTag/t27#5382")
  }

  // MARK: - threadAnswered

  func testThePersonsChatIsAlwaysWritable() {
    XCTAssertTrue(AgentChatView.threadAnswered(task: nil, thread: nil))
    XCTAssertTrue(AgentChatView.threadAnswered(task: nil, thread: "self"))
  }

  func testACardIsWritableOnlyOnItsOwnThread() {
    let task = "gHashTag/t27#5382"
    XCTAssertTrue(AgentChatView.threadAnswered(task: task, thread: "task:gHashTag/t27#5382"))
    // An old render answers the person's own chat.
    XCTAssertFalse(AgentChatView.threadAnswered(task: task, thread: "self"))
    // An older one says no thread at all.
    XCTAssertFalse(AgentChatView.threadAnswered(task: task, thread: nil))
    // Another card's thread is not this card's.
    XCTAssertFalse(AgentChatView.threadAnswered(task: task, thread: "task:gHashTag/t27#5383"))
  }

  // MARK: - chatBody

  func testACardTurnCarriesTheTask() {
    let body = AgentChatView.chatBody(
      history: [Turn(свой: true, текст: "earlier")], question: "what's left?",  // cyrillic-ok: existing labels
      task: "gHashTag/t27#5382")
    XCTAssertEqual(body["task"] as? String, "gHashTag/t27#5382")
    XCTAssertEqual(body["surface"] as? String, "ios")
    XCTAssertNotNil(body["messages"])
  }

  func testThePersonsTurnCarriesNoTask() {
    let body = AgentChatView.chatBody(history: [], question: "hi", task: nil)
    XCTAssertNil(body["task"])
  }

  // MARK: - OpenCard

  func testAnOpenedCardKeysTheSheetByItsTask() {
    let card = OpenCard(
      repo: "gHashTag/t27",
      card: HiveAPI.Card(id: 5382, title: "  Card chat  ", column: "running"))
    XCTAssertEqual(card.id, "gHashTag/t27#5382")
    XCTAssertEqual(card.title, "Card chat")
  }

  func testAnUntitledCardIsItsNumber() {
    let card = OpenCard(
      repo: "gHashTag/t27", card: HiveAPI.Card(id: 9, title: "", column: "backlog"))
    XCTAssertEqual(card.title, "#9")
  }
}
