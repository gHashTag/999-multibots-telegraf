import XCTest
@testable import Vibee

/// A screen that failed offline reloads when the network returns; nothing
/// else moves. The path itself needs a real network change (not scriptable
/// on the simulator), so these pin the decisions.
@MainActor
final class ConnectivityTests: XCTestCase {
  func testOnlyALossThenAReturnCounts() {
    XCTAssertTrue(Connectivity.cameBack(was: false, now: true))
    XCTAssertFalse(Connectivity.cameBack(was: true, now: true))  // cold start
    XCTAssertFalse(Connectivity.cameBack(was: true, now: false))
    XCTAssertFalse(Connectivity.cameBack(was: false, now: false))
  }

  func testOnlyAFailedPageReloads() {
    XCTAssertTrue(WebHost.reloadsOnReturn(.failed("offline")))
    XCTAssertFalse(WebHost.reloadsOnReturn(.ready))
    XCTAssertFalse(WebHost.reloadsOnReturn(.loading))
    XCTAssertFalse(WebHost.reloadsOnReturn(.starting))
  }

  func testReturnsCountsEachReturnOnce() {
    let net = Connectivity.shared
    let before = net.returns
    net.update(online: false)
    XCTAssertFalse(net.online)
    net.update(online: true)
    net.update(online: true)
    XCTAssertEqual(net.returns, before + 1)
    XCTAssertTrue(net.online)
  }
}
