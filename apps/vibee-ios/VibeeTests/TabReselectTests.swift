import XCTest
@testable import Vibee

/// A repeat tap on an open web tab: back to the tab's page, then to the top.
@MainActor
final class TabReselectTests: XCTestCase {
  private func at(_ s: String) -> URL? { URL(string: WebSessionMint.appOrigin + s) }

  func testDeepPageGoesBackToTheTabsPage() {
    XCTAssertEqual(WebHost.reselect(at: at("/game/kanban/42"), root: "/game/kanban"), .goToRoot)
    XCTAssertEqual(WebHost.reselect(at: at("/game/kanban"), root: "/game"), .goToRoot)
  }

  func testOnTheTabsPageScrollsToTheTop() {
    XCTAssertEqual(WebHost.reselect(at: at("/game/kanban"), root: "/game/kanban"), .scrollToTop)
  }

  func testQueryAndTrailingSlashDoNotMakeAnotherPage() {
    XCTAssertEqual(WebHost.reselect(at: at("/game?lang=ru&tab=x"), root: "/game"), .scrollToTop)
    XCTAssertEqual(WebHost.reselect(at: at("/game/"), root: "/game"), .scrollToTop)
  }

  func testNoPageOrAnotherSiteIsAway() {
    XCTAssertEqual(WebHost.reselect(at: nil, root: "/game"), .goToRoot)
    XCTAssertEqual(
      WebHost.reselect(at: URL(string: "https://example.com/game"), root: "/game"), .goToRoot)
  }
}
