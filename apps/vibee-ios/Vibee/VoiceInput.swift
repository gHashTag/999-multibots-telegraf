import AVFoundation
import Foundation

/**
 * VOICE IN THE CHAT: say the question, hear the answer (voice-mode weak
 * spot 19).
 *
 * The web and the mini app had voice mode for thirteen cycles; the phone had
 * none -- not even the microphone permission, which sat commented out in
 * project.yml. This is the smallest honest version of it: press the mic,
 * speak, press again. The words go through the SAME ears the web uses
 * (`POST /api/voice/transcribe`, GigaAM for Russian, Parakeet for English,
 * whisper behind both), arrive in the chat as an ordinary message -- so the
 * agent keeps every tool and the transcript keeps the turn -- and the answer
 * is read aloud by the same mouth (`POST /api/voice/speak`).
 *
 * Since cycle 19 it also knows by itself when a phrase ended -- the web's
 * level rule (`TurnJudge`) on the recorder's meter -- so a second press is
 * no longer needed, only still allowed; and the view can run a hands-free
 * conversation on top of it (listen, send, read the answer, listen again).
 * What it still does NOT do is hear the person over its own answer: the
 * speaker comes back into the mic, and telling the two apart needs echo
 * cancellation this recorder does not have. A tap interrupts instead.
 */
@MainActor
final class VoiceInput: NSObject, ObservableObject, AVAudioRecorderDelegate {
  enum Phase: Equatable { case idle, listening, hearing }

  /// What came back from one utterance.
  enum Heard: Equatable {
    case words(String)
    /// Audio arrived, the ears found no words in it.
    case nothing
    /// A sentence for the person, in the phone's language.
    case problem(String)
  }

  @Published private(set) var phase: Phase = .idle

  /// The recorder stopped itself at `maxSeconds`. The view answers it the
  /// way it answers a second press: hear what was said and send it. Before
  /// cycle 16 nothing did, and the button sat on "listening" over a closed
  /// file, with the sound still borrowed from the feed.
  @Published private(set) var timeUp = false

  /// The person finished (quiet after speech), or nobody spoke at all. The
  /// view answers it as it answers `timeUp`.
  @Published private(set) var turnEnded = false

  /// Either reason to finish without a press.
  var wantsFinish: Bool { timeUp || turnEnded }

  /// The judge said nobody spoke: `finish()` then sends nothing to the
  /// ears. Whisper makes a phrase out of silence, and a conversation would
  /// answer it, and listen again, in an empty room.
  private var heardNobody = false

  /// Whether the chat is on screen. A hidden tab stays alive in this app,
  /// so `onDisappear` alone does not say the person left.
  private var shown = true

  /// One utterance at most; the recorder stops itself here. 60 s of 16 kHz
  /// mono WAV is ~1.9 MB, well under the render's 8 MB cap per utterance.
  nonisolated static let maxSeconds: TimeInterval = 60

  /// 16 kHz mono 16-bit PCM: what the ears resample everything to anyway,
  /// so nothing is lost and the server decodes it without guessing.
  static let recordSettings: [String: Any] = [
    AVFormatIDKey: Int(kAudioFormatLinearPCM),
    AVSampleRateKey: 16_000,
    AVNumberOfChannelsKey: 1,
    AVLinearPCMBitDepthKey: 16,
    AVLinearPCMIsFloatKey: false,
    AVLinearPCMIsBigEndianKey: false,
  ]

  /// The language the ears are told. A named language takes the fast ears
  /// (GigaAM / Parakeet); without one the render falls back to whisper's
  /// detection, which is several times slower.
  nonisolated static var lang: String { speaksRussian ? "ru" : "en" }

  nonisolated static func transcribeURL(base: URL = API.base, lang: String = VoiceInput.lang) -> URL {
    var c = URLComponents(
      url: base.appendingPathComponent("api/voice/transcribe"), resolvingAgainstBaseURL: false)!
    c.queryItems = [URLQueryItem(name: "lang", value: lang)]
    return c.url!
  }

  /// The render answers `{"text": "..."}`; blank words are no words.
  nonisolated static func heard(from data: Data) -> Heard {
    guard let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return .problem(say("The ears answered something unreadable.", "Сервер распознавания ответил непонятно."))
    }
    let text = (o["text"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    return text.isEmpty ? .nothing : .words(text)
  }

  /// A failed status in words: who has to act, not just a number.
  nonisolated static func problem(status: Int) -> String {
    switch status {
    case 401:
      return say("The server does not know who is speaking. Sign in under Profile first.",
                 "Сервер не знает, кто говорит. Сначала войдите в Профиле.")
    case 429:
      return say("Too many voice messages in a row. Wait a minute.",
                 "Слишком много голосовых подряд. Подождите минуту.")
    default:
      return say("Could not hear you: \(serverAnswered(status)).",
                 "Не расслышал: \(serverAnswered(status)).")
    }
  }

  private var recorder: AVAudioRecorder?
  private var meter: Timer?
  private var judge = TurnJudge(at: 0)
  private var player: AVAudioPlayer?
  private let file = FileManager.default.temporaryDirectory
    .appendingPathComponent("vibee-voice-turn.wav")

  /// Start listening. Returns a sentence for the person when it cannot.
  func start() async -> String? {
    guard phase == .idle else { return nil }
    // A new question silences the previous answer, as interrupting does on
    // the web.
    player?.stop()
    player = nil
    guard await AVAudioApplication.requestRecordPermission() else {
      return say("Microphone access is off. Turn it on in Settings → Vibee → Microphone.",
                 "Доступ к микрофону выключен. Включите: Настройки → Vibee → Микрофон.")
    }
    // The permission prompt can take a while: if the person left the chat
    // (or another start won the race) meanwhile, do not record in a tab
    // nobody is looking at.
    guard shown, phase == .idle else { return nil }
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
      try session.setActive(true)
      let r = try AVAudioRecorder(url: file, settings: Self.recordSettings)
      r.delegate = self
      r.isMeteringEnabled = true
      timeUp = false
      turnEnded = false
      guard r.record(forDuration: Self.maxSeconds) else {
        restoreSession()
        return say("The microphone did not start.", "Микрофон не включился.")
      }
      recorder = r
      phase = .listening
      startMeter(r)
      return nil
    } catch {
      restoreSession()
      return say("The microphone did not start: \(error.localizedDescription)",
                 "Микрофон не включился: \(error.localizedDescription)")
    }
  }

  /// Stop listening and hear what was said.
  func finish() async -> Heard {
    guard phase == .listening, let r = recorder else { return .nothing }
    // Forget the recorder BEFORE stopping it: its delegate then sees a
    // stop that is ours, not one at the time limit.
    recorder = nil
    let silent = heardNobody
    stopMeter()
    r.stop()
    restoreSession()
    phase = .hearing
    defer {
      phase = .idle
      try? FileManager.default.removeItem(at: file)
    }
    guard let audio = try? Data(contentsOf: file),
          Self.uploads(heardNobody: silent, bytes: audio.count) else { return .nothing }
    var req = URLRequest(url: Self.transcribeURL())
    req.httpMethod = "POST"
    req.setValue("audio/wav", forHTTPHeaderField: "Content-Type")
    for (k, v) in Identity.headers() { req.setValue(v, forHTTPHeaderField: k) }
    req.timeoutInterval = 60
    do {
      let (data, response) = try await URLSession.shared.upload(for: req, from: audio)
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      guard status == 200 else { return .problem(Self.problem(status: status)) }
      return Self.heard(from: data)
    } catch {
      return .problem(say("Did not reach the server: \(error.localizedDescription)",
                          "Не дошло до сервера: \(error.localizedDescription)"))
    }
  }

  /// Read an answer aloud. Silent on failure: the text is on screen anyway,
  /// and a spoken error about the voice would be a second interruption.
  func speak(_ text: String) async {
    let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !words.isEmpty, phase == .idle, shown else { return }
    var req = URLRequest(url: API.base.appendingPathComponent("api/voice/speak"))
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    for (k, v) in Identity.headers() { req.setValue(v, forHTTPHeaderField: k) }
    // The render cleans the text for speech (links, markdown, emoji) and
    // cuts it at 600 characters, so the whole answer can go as it is.
    req.httpBody = try? JSONSerialization.data(withJSONObject: ["text": words, "lang": Self.lang])
    guard let reply = try? await URLSession.shared.data(for: req),
          (reply.1 as? HTTPURLResponse)?.statusCode == 200,
          // The person may have pressed the mic, or left the chat, while
          // the answer was being made.
          phase == .idle, shown,
          let p = try? AVAudioPlayer(data: reply.0)
    else { return }
    player = p
    guard p.play() else { return }
    // Return when the reading is over, so a conversation listens again
    // only after the agent stopped talking. A press, a new question or
    // leaving the chat lets go of the player, which ends the wait as well.
    while player === p, p.isPlaying {
      try? await Task.sleep(nanoseconds: 100_000_000)
    }
  }

  /// Stop reading the answer, for a tap that interrupts it.
  func hush() {
    player?.stop()
    player = nil
  }

  /// Whether an answer is being read right now.
  var isSpeaking: Bool { player?.isPlaying ?? false }

  /// Read the recorder's level every tick and let the judge decide.
  private func startMeter(_ r: AVAudioRecorder) {
    judge = TurnJudge(at: 0)
    let began = Date()
    meter?.invalidate()
    meter = Timer.scheduledTimer(withTimeInterval: TurnJudge.tick, repeats: true) { [weak self] _ in
      MainActor.assumeIsolated {
        guard let self, self.recorder === r, self.phase == .listening else { return }
        r.updateMeters()
        let level = TurnJudge.level(dB: r.averagePower(forChannel: 0))
        let verdict = self.judge.feed(at: Date().timeIntervalSince(began), level: level)
        if verdict != .going {
          self.stopMeter()
          self.heardNobody = verdict == .nobodySpoke
          self.turnEnded = true
        }
      }
    }
  }

  /// The recording is over: no meter, and no finish left to ask for.
  private func stopMeter() {
    meter?.invalidate()
    meter = nil
    timeUp = false
    turnEnded = false
    heardNobody = false
  }

  /**
   * The chat came forward or went away.
   *
   * Going away stops everything that would otherwise outlive the screen: a
   * recording nobody will press to finish (the sound would stay borrowed
   * from the feed, whose videos would then follow the rules of a call) and
   * an answer still being read. What was recorded is dropped, not sent: the
   * person did not say "send", they left. An upload already under way
   * finishes by itself.
   */
  func setShown(_ on: Bool) {
    shown = on
    guard !on else { return }
    player?.stop()
    player = nil
    guard phase == .listening, let r = recorder else { return }
    recorder = nil
    stopMeter()
    r.stop()
    restoreSession()
    phase = .idle
    try? FileManager.default.removeItem(at: file)
  }

  nonisolated func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
    let id = ObjectIdentifier(recorder)
    Task { @MainActor in self.recorderStopped(id) }
  }

  /// Only the CURRENT recording reaching its limit is a time-up; a stop we
  /// made ourselves has already let go of the recorder.
  func recorderStopped(_ id: ObjectIdentifier) {
    if Self.isTimeUp(listening: phase == .listening, stopped: id,
                     current: recorder.map(ObjectIdentifier.init)) { timeUp = true }
  }

  /// Whether a finished recording goes to the ears: not when the judge
  /// heard nobody, and not a file too short to hold a word.
  nonisolated static func uploads(heardNobody: Bool, bytes: Int) -> Bool {
    !heardNobody && bytes > 512
  }

  /// What a turn does once its answer was read.
  enum AfterAnswer: Equatable {
    /// Listen for the next question.
    case listen
    /// The conversation is over (or there was none).
    case end
    /// A newer conversation owns the mic now: a long press while this
    /// answer played. Ending "the" conversation here would end that one.
    case leave
  }

  /// `turnOf` is the conversation the turn was asked in, `current` the
  /// one running now.
  nonisolated static func afterAnswer(conversing: Bool, shown: Bool, sent: Bool, phase: Phase,
                                      turnOf: Int, current: Int) -> AfterAnswer {
    guard turnOf == current else { return .leave }
    return listensAgain(conversing: conversing, shown: shown, sent: sent, phase: phase)
      ? .listen : .end
  }

  /// After an answer was read, a conversation listens again -- only if the
  /// question really went out (a declined send would loop on nothing), the
  /// chat is still on screen, and nothing else took the mic meanwhile.
  nonisolated static func listensAgain(conversing: Bool, shown: Bool, sent: Bool,
                                       phase: Phase) -> Bool {
    conversing && shown && sent && phase == .idle
  }

  /// Whether a touch on the mic does anything: hearing never; a recording
  /// or a conversation can always be stopped; a new question waits while
  /// the agent answers or the thread is not ready.
  nonisolated static func micTakes(phase: Phase, resting: Bool, conversing: Bool) -> Bool {
    switch phase {
    case .hearing: return false
    case .listening: return true
    case .idle: return conversing || !resting
    }
  }

  /// The rule on its own, so a test can reach the listening case without a
  /// microphone.
  nonisolated static func isTimeUp(listening: Bool, stopped: ObjectIdentifier,
                                   current: ObjectIdentifier?) -> Bool {
    listening && current == stopped
  }

  /**
   * Put the sound back the way the feed set it.
   *
   * Sound in this app belongs to the feed (FeedView's sound set-up, which
   * explains why there must be one owner): `.playback` / `.moviePlayback`.
   * Recording needs `.playAndRecord`, and leaving it there would route the
   * feed's videos through the earpiece rules of a call. So the category is
   * borrowed for one utterance and returned.
   */
  private func restoreSession() {
    try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
  }
}
