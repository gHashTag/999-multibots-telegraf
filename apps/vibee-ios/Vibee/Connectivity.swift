import Network
import SwiftUI

/**
 WHETHER THE PHONE HAS A NETWORK, AND THE MOMENT IT GETS ONE BACK.

 Before this a screen that failed offline stayed failed after the network
 returned: the feed kept "did not load", a web tab kept its error, until the
 person found the retry button. Telegram, Instagram and TikTok watch the
 path instead -- they say "no connection" while it is gone and reload by
 themselves when it is back. Here a screen that FAILED reloads on `returns`;
 a screen that loaded is left alone, so nothing jumps under the person's
 finger.
 */
@MainActor
final class Connectivity: ObservableObject {
  static let shared = Connectivity()

  @Published private(set) var online = true
  /// Bumped once per return of the path after a loss.
  @Published private(set) var returns = 0

  private let monitor = NWPathMonitor()

  private init() {
    monitor.pathUpdateHandler = { [weak self] path in
      let now = path.status == .satisfied
      Task { @MainActor in self?.update(online: now) }
    }
    monitor.start(queue: DispatchQueue(label: "ai.t27.vibee.connectivity"))
  }

  func update(online now: Bool) {
    if Self.cameBack(was: online, now: now) { returns += 1 }
    if online != now { online = now }
  }

  /// Only a loss followed by a return counts. The monitor's first report is
  /// "online" while `online` already starts true, so a cold start reloads
  /// nothing.
  nonisolated static func cameBack(was: Bool, now: Bool) -> Bool { !was && now }
}

/// The line above the tab bar while there is no network. It says what will
/// happen, so the person does not have to keep tapping retry.
struct OfflineBanner: View {
  var body: some View {
    Label(
      say("No connection -- the app will reload when it is back",
          "Нет сети — приложение обновится само, когда она появится"),
      systemImage: "wifi.slash"
    )
    .font(Typeface.style(.footnote))
    .foregroundStyle(Palette.warning)
    .frame(maxWidth: .infinity)
    .padding(.vertical, Space.sm)
    .background(Palette.surface)
    .accessibilityAddTraits(.updatesFrequently)
  }
}
