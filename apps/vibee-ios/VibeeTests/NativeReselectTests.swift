import XCTest
@testable import Vibee

/// The native tabs' repeat-tap behaviour. The scroll itself needs a live
/// ScrollView (checked on the simulator); these pin the parts that decide it.
final class NativeReselectTests: XCTestCase {
  func testScrollsByDefault() {
    XCTAssertFalse(ScrollsToTopOnReselect().unless)
  }

  func testScreenWithPushedViewSkipsTheScroll() {
    XCTAssertTrue(ScrollsToTopOnReselect(unless: true).unless)
  }

  func testAnchorIsStable() {
    // Screens never pass their own id: one anchor per scroll view is enough,
    // and a second `.id` on the same view would replace the first silently.
    XCTAssertEqual(ScrollsToTopOnReselect.anchor, "tab-top")
  }
}
