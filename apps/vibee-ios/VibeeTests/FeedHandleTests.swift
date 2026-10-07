import XCTest
@testable import Vibee

/// An author with no username gets no handle, not a bare "@" (web parity).
final class FeedHandleTests: XCTestCase {
  private func template(username: String) throws -> API.Template {
    let json = """
      {"id":"t","creatorName":"Anonymous","creatorUsername":"\(username)","name":"n",
       "description":"d","videoUrl":"https://x/v.mp4","viewsCount":1,"starsCount":0,
       "createdAt":"2026-10-02T00:00:00Z"}
      """
    return try JSONDecoder().decode(API.Template.self, from: Data(json.utf8))
  }

  func testUsernameBecomesHandle() throws {
    XCTAssertEqual(try template(username: "Ryabinika_Perm").handle, "@Ryabinika_Perm")
  }

  func testEmptyUsernameHasNoHandle() throws {
    XCTAssertNil(try template(username: "").handle)
    XCTAssertNil(try template(username: "  ").handle)
  }
}
