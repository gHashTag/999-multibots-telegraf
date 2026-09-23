import XCTest

@testable import Vibee

/// ONE LIST OF DESTINATIONS, AND THIS APP'S HALF OF IT.
///
/// The tabs used to exist only as five `.tabItem` literals in the body of a
/// `TabView`, while the web declared six in a file of its own. They drifted --
/// the web gained `browser` and nothing could tell Swift -- and a comment
/// above the TabView went on claiming the two were the same list.
///
/// Now both read apps/vibee-editor/render/src/navigation.json, served at
/// GET /api/navigation. What can still go wrong is on this side: the bundled
/// copy dropping out of the target, and the list naming a screen this build
/// does not have. Both fail here.
final class NavigationListTests: XCTestCase {

  private func decode(_ json: String) -> NavigationList? {
    guard let data = json.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(NavigationList.self, from: data)
  }

  func testBundledListIsReadable() {
    // An empty bar is not a state this app can be in: if this fails, the
    // resource was dropped from the target, and the app would open with no
    // way to go anywhere.
    XCTAssertFalse(
      Navigation.bundled.isEmpty,
      "navigation.json is missing from the app bundle"
    )
  }

  func testBundledListIsThisPlatformOnly() {
    // The file carries every client's destinations; this app takes its own.
    // `browser` is the web's today, and that is written down rather than
    // silently absent.
    XCTAssertTrue(Navigation.bundled.allSatisfy { $0.platforms.contains("ios") })
    XCTAssertFalse(Navigation.bundled.contains { $0.id == "browser" })
  }

  func testEveryDestinationHasAScreen() {
    // The screens this build can open, mirrored from `screen(for:)` in
    // VibeeApp.swift. A destination the list names and this app cannot draw
    // would be a tab that opens nothing.
    let known: Set<String> = ["feed", "chat", "ai", "hive", "profile"]
    for destination in Navigation.bundled {
      XCTAssertTrue(
        known.contains(destination.id),
        "no screen for destination \(destination.id)"
      )
    }
  }

  func testTheOrderIsTheListsOrder() {
    // The order is a product decision recorded in the shared file: the hive
    // comes BEFORE the profile, because the last place in the row is the one
    // a thumb reaches without looking.
    XCTAssertEqual(
      Navigation.bundled.map(\.id),
      ["feed", "chat", "ai", "hive", "profile"]
    )
  }

  func testForThisAppKeepsOnlyOurs() {
    let list = decode(
      """
      {"version":1,"destinations":[
        {"id":"one","route":"/one","platforms":["web"],"labelKey":"k",
         "label":{"en":"One","ru":"Один"},"icon":{"lucide":"A","sf":"a"}},
        {"id":"two","route":"/two","platforms":["web","ios"],"labelKey":"k",
         "label":{"en":"Two","ru":"Два"},"icon":{"lucide":"B","sf":"b"}}
      ]}
      """
    )
    XCTAssertNotNil(list)
    XCTAssertEqual(Navigation.forThisApp(list?.destinations ?? []).map(\.id), ["two"])
  }

  func testLabelFollowsThePhonesLanguage() {
    // The web has a dictionary; this app has the two strings in the list.
    let list = decode(
      """
      {"version":1,"destinations":[
        {"id":"feed","route":"/feed","platforms":["ios"],"labelKey":"nav.feed",
         "label":{"en":"Feed","ru":"Лента"},"icon":{"lucide":"Globe","sf":"house"}}
      ]}
      """
    )
    let feed = list?.destinations.first
    XCTAssertEqual(feed?.title, say("Feed", "Лента"))
  }
}
