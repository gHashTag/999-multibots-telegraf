import UIKit
import XCTest

@testable import Vibee

/// A web page on a tab that is not shown must be out of the window: that is
/// the only state WebKit reads as "hidden" and stops the page's frames for.
@MainActor
final class HiddenTabTests: XCTestCase {
  private func windowWithBox() -> (UIWindow, UIView) {
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    let box = UIView(frame: window.bounds)
    window.addSubview(box)
    return (window, box)
  }

  func testShownTabPutsThePageInTheWindowFilled() {
    let (window, box) = windowWithBox()
    let web = UIView()
    WebHostView.place(web, in: box, shown: true)
    XCTAssertTrue(web.superview === box)
    XCTAssertTrue(web.window === window)
    XCTAssertEqual(web.frame, box.bounds)
    XCTAssertEqual(web.autoresizingMask, [.flexibleWidth, .flexibleHeight])
  }

  func testHiddenTabTakesThePageOutOfTheWindow() {
    let (_, box) = windowWithBox()
    let web = UIView()
    WebHostView.place(web, in: box, shown: true)
    WebHostView.place(web, in: box, shown: false)
    XCTAssertNil(web.superview)
    XCTAssertNil(web.window, "a page left in the window keeps running as visible")
  }

  func testComingBackPutsTheSamePageBack() {
    let (_, box) = windowWithBox()
    let web = UIView()
    WebHostView.place(web, in: box, shown: true)
    WebHostView.place(web, in: box, shown: false)
    WebHostView.place(web, in: box, shown: true)
    XCTAssertTrue(web.superview === box)
    XCTAssertEqual(box.subviews.count, 1, "returning must not stack a second copy")
  }

  func testHidingOneBoxLeavesAPageAnotherBoxHolds() {
    // The host's page moves to whichever box was shown last (a sheet, a
    // re-created screen). An old box going hidden must not pull it out of
    // the box that is on screen now.
    let (_, old) = windowWithBox()
    let (_, current) = windowWithBox()
    let web = UIView()
    WebHostView.place(web, in: old, shown: true)
    WebHostView.place(web, in: current, shown: true)
    WebHostView.place(web, in: old, shown: false)
    XCTAssertTrue(web.superview === current)
  }
}
