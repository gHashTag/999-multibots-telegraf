import Foundation

/**
 * WHEN THE PERSON FINISHED, judged from the mic's level alone (voice-mode
 * weak spot 19b: the phone needed a second press to end every question).
 *
 * The web's rule, not a new one (player `lib/voice/vad.ts`, `LevelGate` and
 * `TurnClock`, measured with `tri vad` on real recordings):
 *
 * - The level is compared against a NOISE FLOOR, what the room sounds like
 *   when nobody talks. The floor follows quiet slowly and loud never.
 * - Loud for longer than `onset` is someone talking; after that, quiet for
 *   longer than `endOfTurn` is the end of the turn.
 * - A level that stays loud AND flat for `steady` is a fan or an engine, not
 *   a voice (speech swings several times over within a second): it becomes
 *   the new floor, and whatever it started is dropped.
 * - Nobody spoke for `nobodySpoke`: the mic gives up instead of listening
 *   to the room until the 60 s limit. If someone DID speak and a hum then
 *   took over, that is the end of their turn, not silence.
 *
 * Pure, no clock and no audio of its own, so a test (and a `swift` script,
 * without a simulator) drives it with made-up levels.
 */
struct TurnJudge {
  static let onset: TimeInterval = 0.16
  static let endOfTurn: TimeInterval = 0.85
  static let steady: TimeInterval = 2.0
  static let steadySpread = 2.5
  static let nobodySpoke: TimeInterval = 8
  /// How often the recorder's meter is read; the web ticks every 40 ms.
  static let tick: TimeInterval = 0.05
  static let quietFloor = 0.014

  enum Verdict: Equatable { case going, ended, nobodySpoke }

  /// What the room sounds like when nobody talks (amplitude, 0..1).
  private(set) var floor = 0.01
  private(set) var spoke = false
  /// Someone spoke at some point in this recording. Unlike `spoke`, a fan
  /// learned as the room never clears it: speech followed by a steady hum
  /// is still speech, and must reach the ears (reviewer bee on #3360).
  private(set) var everSpoke = false
  private var spokeAt: TimeInterval?
  private var window: [(at: TimeInterval, level: Double)] = []
  private var loudSince: TimeInterval?
  private var quietSince: TimeInterval?
  private let started: TimeInterval

  init(at start: TimeInterval) { started = start }

  /// `AVAudioRecorder.averagePower` (dBFS) as the web's 0..1 level.
  static func level(dB: Float) -> Double {
    pow(10, Double(max(dB, -160)) / 20)
  }

  /// One reading of the meter.
  mutating func feed(at now: TimeInterval, level: Double) -> Verdict {
    let loud = isLoud(now, level)
    if loud {
      if loudSince == nil { loudSince = now }
      quietSince = nil
    } else {
      loudSince = nil
      if quietSince == nil { quietSince = now }
    }
    if !spoke, let l = loudSince, now - l > Self.onset {
      spoke = true
      everSpoke = true
      spokeAt = now
    }
    if spoke, let q = quietSince, now - q > Self.endOfTurn { return .ended }
    // A hum swallowed the end of a turn that was spoken: the turn is over.
    if !spoke, now - started > Self.nobodySpoke { return everSpoke ? .ended : .nobodySpoke }
    return .going
  }

  private mutating func isLoud(_ now: TimeInterval, _ level: Double) -> Bool {
    // The floor learns only between phrases (the web passes `!turn.spoke`):
    // the quiet between a phrase's words must not raise it.
    if !spoke, level < floor * 2.5 {
      floor = floor * 0.97 + level * 0.03
    }
    let threshold = max(Self.quietFloor, floor * 3.2)
    window.append((now, level))
    while let first = window.first, now - first.at > Self.steady { window.removeFirst() }
    guard level > threshold else { return false }
    guard let first = window.first, now - first.at >= Self.steady - Self.tick / 2 else {
      return true
    }
    let levels = window.map(\.level)
    if levels.max()! > levels.min()! * Self.steadySpread { return true }
    // Loud and flat for two seconds: the room. Learn it, forget what it began.
    floor = levels.reduce(0, +) / Double(levels.count)
    // If the hum itself is what counted as speaking, nobody spoke; words
    // that came before the hum (outside its two flat seconds) still count.
    if let s = spokeAt, s >= first.at - Self.onset { everSpoke = false }
    window = []
    spoke = false
    return false
  }
}
