import Foundation
#if canImport(UIKit)
import UIKit
#endif

/**
 * A failure the person saw must reach the owner.
 *
 * The web player has had this beacon since 08.09.2026
 * (`player/src/lib/clientErrorBeacon.ts`): the browser POSTs to
 * `/api/client-error`, the server dedups a storm into one Telegram alert per
 * error kind every ten minutes. iOS had none of this at all -- `grep -rn
 * 'client-error' apps/vibee-ios` returned nothing before this file existed.
 *
 * The cost of that gap was measured in this same session, not assumed. Three
 * real agent-chat sync defects on iOS -- the stale sign-in copy in
 * AgentChatView, a stream failure that discarded the partial answer instead
 * of keeping it, missing handling for the "ошибка"/"готово" stream events --
 * were found only because a person happened to complain in conversation. The
 * same class of defect on the web is already visible to the owner in
 * Telegram with zero complaints required: `formatClientErrorAlert` sends
 * "Mini app: user hit an error" naming the text, the screen and who. On the
 * phone the same stream failure would have been visible only to whoever was
 * looking at the exact moment it happened -- which is to say, almost never.
 *
 * The report shape matches the web byte for byte:
 * `kind/message/context/path/ua/build/ts`. The server
 * (`render/src/client-errors.ts`) already knows how to parse it and needed
 * no change for iOS. A second shape would have been a second place for the
 * client and server to drift apart.
 */
enum ClientErrorBeacon {
  private static let queueKey = "trinity.client-errors.queue"
  private static let queueLimit = 20
  /// Once per (kind, message) per process launch -- lives no longer than the
  /// process itself, matching the web's `SESSION_DEDUP` (a Set in the tab).
  /// The real storm protection is server-side (`ClientErrorGate`); this only
  /// stops one bad loop from hammering the network a thousand times.
  private static var seenThisLaunch = Set<String>()

  /// Send a report. Never throws, never blocks the caller: this is a side
  /// effect, not part of the main path. `context` is capped at 600 chars,
  /// same as the web -- the server clips further anyway (`LIMITS.context`).
  static func report(kind: String, message: String, context: String = "") {
    let key = "\(kind)|\(String(message.prefix(120)))"
    guard !seenThisLaunch.contains(key) else { return }
    seenThisLaunch.insert(key)
    let body = buildBody(kind: kind, message: message, context: context)
    Task.detached(priority: .background) {
      let delivered = await send(body)
      if !delivered { enqueue(body) }
    }
  }

  /**
   * Whatever failed to send last launch. Called once at app start -- the
   * same job `installGlobalClientErrorReporting()` does on the web, for the
   * same reason: a report about a network outage is written exactly when
   * the network is unavailable, so the first attempt almost always fails.
   * The queue lives in UserDefaults and survives the app being killed.
   */
  static func flushQueue() {
    let pending = readQueue()
    guard !pending.isEmpty else { return }
    writeQueue([])
    Task.detached(priority: .background) {
      var remaining: [[String: Any]] = []
      for body in pending {
        if await send(body) == false { remaining.append(body) }
      }
      if !remaining.isEmpty { enqueue(contentsOf: remaining) }
    }
  }

  // MARK: - Internals

  private static func buildBody(
    kind: String, message: String, context: String
  ) -> [String: Any] {
    [
      "kind": kind,
      "message": String(message.prefix(400)),
      "context": String(context.prefix(600)),
      // The web uses `location.pathname` here -- the browser's address bar.
      // The app has none, so this is a fixed marker instead of a screen name.
      "path": "ios",
      "ua": userAgent,
      "build": buildNumber,
      "ts": Int(Date().timeIntervalSince1970 * 1000),
    ]
  }

  private static var userAgent: String {
    #if canImport(UIKit)
    let device = UIDevice.current
    return "Vibee-iOS/\(buildNumber) (\(device.model); iOS \(device.systemVersion))"
    #else
    return "Vibee-iOS/\(buildNumber)"
    #endif
  }

  /// `CFBundleVersion` -- the same commit-count build number `run.sh` and
  /// fastlane already stamp on every build (see the README, "Build number is
  /// a commit count"). Matches what shows in TestFlight, so this number
  /// alone identifies exactly which build failed.
  private static var buildNumber: String {
    (Bundle.main.infoDictionary?["CFBundleVersion"] as? String) ?? "?"
  }

  private static func send(_ body: [String: Any]) async -> Bool {
    var r = URLRequest(url: API.base.appendingPathComponent("api/client-error"))
    r.httpMethod = "POST"
    r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    // Identity, the same way as everywhere else: the server names "who" in
    // the owner's alert from this same header (`verifiedTelegramId`).
    for (k, v) in Identity.headers() { r.setValue(v, forHTTPHeaderField: k) }
    r.httpBody = try? JSONSerialization.data(withJSONObject: body)
    r.timeoutInterval = 10
    do {
      let (_, resp) = try await URLSession.shared.data(for: r)
      return (200..<300).contains((resp as? HTTPURLResponse)?.statusCode ?? 0)
    } catch {
      return false
    }
  }

  private static func readQueue() -> [[String: Any]] {
    guard let data = UserDefaults.standard.data(forKey: queueKey),
          let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else { return [] }
    return list
  }

  private static func writeQueue(_ list: [[String: Any]]) {
    guard let data = try? JSONSerialization.data(withJSONObject: list) else { return }
    UserDefaults.standard.set(data, forKey: queueKey)
  }

  private static func enqueue(_ body: [String: Any]) {
    enqueue(contentsOf: [body])
  }

  private static func enqueue(contentsOf added: [[String: Any]]) {
    let merged = (readQueue() + added).suffix(queueLimit)
    writeQueue(Array(merged))
  }
}
