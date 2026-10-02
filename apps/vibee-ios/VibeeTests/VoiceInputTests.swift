import AVFoundation
import XCTest
@testable import Vibee

/// VOICE IN THE CHAT. The recording itself needs a microphone and a person;
/// what can go wrong without either is pinned here: which ears are asked,
/// how the answer is read, and what the person is told when it fails.
final class VoiceInputTests: XCTestCase {

  /// A named language takes the fast ears; without one the render falls back
  /// to whisper's detection, several times slower.
  func testTheEarsAreToldTheLanguage() {
    let url = VoiceInput.transcribeURL(base: URL(string: "https://r.example")!, lang: "ru")
    XCTAssertEqual(url.absoluteString, "https://r.example/api/voice/transcribe?lang=ru")
    XCTAssertEqual(VoiceInput.lang, speaksRussian ? "ru" : "en")
  }

  func testWordsAreTrimmedAndBlankIsNothing() {
    XCTAssertEqual(VoiceInput.heard(from: Data(#"{"text":"  hello there \n"}"#.utf8)), .words("hello there"))
    XCTAssertEqual(VoiceInput.heard(from: Data(#"{"text":"   "}"#.utf8)), .nothing)
    XCTAssertEqual(VoiceInput.heard(from: Data(#"{"done":0.9}"#.utf8)), .nothing)
  }

  /// An unreadable answer is a problem to show, not silence.
  func testUnreadableAnswerIsAProblem() {
    guard case .problem = VoiceInput.heard(from: Data("<html>".utf8)) else {
      return XCTFail("garbage from the server must be said, not swallowed")
    }
  }

  /// A failed status names who has to act; 401 sends the person to sign in.
  func testFailuresSayWhatToDo() {
    XCTAssertEqual(VoiceInput.problem(status: 401),
                   say("The server does not know who is speaking. Sign in under Profile first.",
                       "Сервер не знает, кто говорит. Сначала войдите в Профиле."))
    XCTAssertNotEqual(VoiceInput.problem(status: 429), VoiceInput.problem(status: 401))
    XCTAssertTrue(VoiceInput.problem(status: 502).contains("502"))
  }

  /// 16 kHz mono 16-bit PCM, and short enough to fit the render's 8 MB cap.
  @MainActor
  func testTheRecordingFitsTheEars() {
    let s = VoiceInput.recordSettings
    XCTAssertEqual(s[AVFormatIDKey] as? Int, Int(kAudioFormatLinearPCM))
    XCTAssertEqual(s[AVSampleRateKey] as? Int, 16_000)
    XCTAssertEqual(s[AVNumberOfChannelsKey] as? Int, 1)
    let bytes = VoiceInput.maxSeconds * 16_000 * 2
    XCTAssertLessThan(bytes, 8 * 1024 * 1024)
  }

  /// Leaving the chat while idle changes nothing: no phase jump, no send.
  @MainActor
  func testLeavingWhileIdleStaysIdle() {
    let v = VoiceInput()
    v.setShown(false)
    XCTAssertEqual(v.phase, .idle)
    XCTAssertFalse(v.timeUp)
  }

  /// The 60-second cap fires the recorder's own delegate; a stop from any
  /// other recorder (an earlier take finishing late) must not send.
  @MainActor
  func testOnlyTheCurrentRecorderCanCallTimeUp() throws {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("foreign.wav")
    let foreign = try AVAudioRecorder(url: url, settings: VoiceInput.recordSettings)
    let v = VoiceInput()
    v.recorderStopped(ObjectIdentifier(foreign))
    XCTAssertFalse(v.timeUp)
  }
}
