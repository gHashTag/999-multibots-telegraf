import XCTest
@testable import Vibee

/// WHEN THE PERSON FINISHED. The same scenes `swift` drove without a
/// simulator while the rule was written (cycle 19): levels made up tick by
/// tick, the verdict and its moment checked.
final class TurnJudgeTests: XCTestCase {
  private let room = 0.004

  private func run(_ levels: (Double) -> Double, upTo: Double = 20) -> (TurnJudge.Verdict, Double) {
    var j = TurnJudge(at: 0)
    var t = 0.0
    while t < upTo {
      let v = j.feed(at: t, level: levels(t))
      if v != .going { return (v, t) }
      t += TurnJudge.tick
    }
    return (.going, t)
  }

  /// Syllables, loud and softer every 150 ms, then the room again.
  func testQuietAfterSpeechEndsTheTurn() {
    let (v, t) = run { t in
      if t < 1 || t >= 3 { return self.room }
      return Int((t - 1) / 0.15) % 2 == 0 ? 0.2 : 0.05
    }
    XCTAssertEqual(v, .ended)
    XCTAssertEqual(t, 3.9, accuracy: 0.1)  // 850 ms after the last word
  }

  func testAShortPauseKeepsTheTurn() {
    let (v, t) = run { t in (t >= 1 && t < 2) || (t >= 2.5 && t < 3.5) ? 0.2 : self.room }
    XCTAssertEqual(v, .ended)
    XCTAssertGreaterThan(t, 4.3)
  }

  func testAClickIsNotSpeech() {
    XCTAssertEqual(run { t in t >= 1 && t < 1.1 ? 0.5 : self.room }.0, .nobodySpoke)
  }

  func testSilenceGivesUp() {
    let (v, t) = run { _ in self.room }
    XCTAssertEqual(v, .nobodySpoke)
    XCTAssertEqual(t, TurnJudge.nobodySpoke, accuracy: 0.1)
  }

  /// A fan that starts loud and stays flat is learned as the room.
  func testASteadyFanIsTheRoom() {
    XCTAssertEqual(run { t in t < 1 ? self.room : 0.1 + 0.005 * sin(t * 7) }.0, .nobodySpoke)
  }

  func testSpeechOverALearnedFanStillEnds() {
    let (v, t) = run { t in
      if t >= 4 && t < 6 { return Int((t - 4) / 0.15) % 2 == 0 ? 0.9 : 0.4 }
      return t < 1 ? self.room : 0.1 + 0.005 * sin(t * 7)
    }
    XCTAssertEqual(v, .ended)
    XCTAssertEqual(t, 6.9, accuracy: 0.1)
  }

  /// Words, then a kettle that never stops: the hum is learned as the room,
  /// which clears `spoke`, but the words were said and must be sent, so the
  /// verdict is the end of a turn, never "nobody spoke" (reviewer bee, #3360).
  func testSpeechThenAHumIsStillATurn() {
    let (v, _) = run { t in
      if t < 1 { return self.room }
      if t < 4 { return Int((t - 1) / 0.15) % 2 == 0 ? 0.9 : 0.2 }
      return 0.1 + 0.005 * sin(t * 7)
    }
    XCTAssertEqual(v, .ended)
  }

  /// The same, and then the kettle nears the boil: the louder hum counts
  /// as speaking again and is learned again, which must give back the
  /// words said before it, not erase them (reviewer bee, second pass).
  func testAHumThatStepsUpKeepsTheWords() {
    let (v, _) = run { t in
      if t < 1 { return self.room }
      if t < 3 { return Int((t - 1) / 0.15) % 2 == 0 ? 0.9 : 0.2 }
      if t < 6 { return 0.1 + 0.005 * sin(t * 7) }
      return 0.4 + 0.02 * sin(t * 7)
    }
    XCTAssertEqual(v, .ended)
  }

  /// A fan that steps up with nobody talking is still nobody talking.
  func testAFanThatStepsUpIsStillTheRoom() {
    let (v, _) = run { t in
      if t < 1 { return self.room }
      if t < 4 { return 0.1 + 0.005 * sin(t * 7) }
      return 0.4 + 0.02 * sin(t * 7)
    }
    XCTAssertEqual(v, .nobodySpoke)
  }

  /// The floor learns only between phrases, as the web's does: hushed gaps
  /// between words must not raise it, or soft last words count as silence.
  /// (The first port learned between words; this is what caught it.)
  func testHushedGapsDoNotTeachTheFloor() {
    let (v, t) = run { t in
      if t < 1 { return self.room }
      if t < 7 { return Int((t - 1) / 0.25) % 2 == 0 ? 0.2 : 0.0099 }
      if t < 9 { return 0.025 }
      return self.room
    }
    XCTAssertEqual(v, .ended)
    XCTAssertEqual(t, 9.9, accuracy: 0.1)
  }

  func testDecibelsBecomeTheWebsLevel() {
    XCTAssertEqual(TurnJudge.level(dB: 0), 1, accuracy: 1e-9)
    XCTAssertEqual(TurnJudge.level(dB: -40), 0.01, accuracy: 1e-9)
  }
}
