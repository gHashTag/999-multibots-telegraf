import XCTest

@testable import Vibee

/// The model list is the most-read text on the Photo, Video, Lip-sync and
/// Voice tabs, and its words come from a generator that writes Russian.
/// Every catalogue entry must read in English on an English phone -- a new
/// generated suffix fails here, not on a screenshot.
final class KieModelLabelTests: XCTestCase {
  private func cyrillic(_ s: String) -> Bool {
    s.range(of: "\\p{Cyrillic}", options: .regularExpression) != nil
  }

  func testEveryCatalogueModelReadsInEnglish() {
    for model in КаталогKie.все {  // cyrillic-ok: generated catalogue
      let name = KieModelLabels.name(model.название, russian: false)  // cyrillic-ok: generated field
      XCTAssertFalse(cyrillic(name), "\(model.id): \(name)")
      let needs = KieModelLabels.needs(model.требует, russian: false)  // cyrillic-ok: generated field
      XCTAssertFalse(cyrillic(needs), "\(model.id): \(needs)")
    }
    XCTAssertFalse(cyrillic(KieModelLabels.paused(russian: false)))
  }

  func testRussianKeepsTheGeneratedWords() {
    for model in КаталогKie.все {  // cyrillic-ok: generated catalogue
      XCTAssertEqual(KieModelLabels.name(model.название, russian: true), model.название)  // cyrillic-ok: generated field
    }
    XCTAssertEqual(KieModelLabels.paused(russian: true), "Приостановлена у провайдера — не в вашем аккаунте. Появится сама.")
  }

  func testShapes() {
    XCTAssertEqual(KieModelLabels.name("Seedream 5 Lite — картинка", russian: false), "Seedream 5 Lite — image")
    XCTAssertEqual(KieModelLabels.needs("описание + фото", russian: false), "Needs: prompt + photo")
    XCTAssertEqual(KieModelLabels.price(1, perSecond: false, russian: false), "1 token")
    XCTAssertEqual(KieModelLabels.price(11, perSecond: true, russian: false), "11 tokens/s")
    XCTAssertEqual(KieModelLabels.price(11, perSecond: true, russian: true), "11 токенов/с")
  }
}
