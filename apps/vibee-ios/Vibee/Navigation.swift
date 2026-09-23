import Foundation

/**
 * WHERE A PERSON CAN GO — THE SAME LIST THE WEB USES.
 *
 * Owner, 2026-09-23: "the same in the desktop app and in the mobile Swift
 * one, synchronised, reusing the backend on .t27".
 *
 * What it was before: this app's tabs existed only as the body of a `TabView`
 * in VibeeApp.swift — five `.tabItem` literals, no list, no ids — and the web
 * declared six in its own TypeScript file. They had already drifted: the web
 * gained `browser` on 2026-09-20 and nothing told Swift, while the comment
 * above the TabView still said "FIVE tabs, exactly the ones the web has, in
 * the same order".
 *
 * Now there is one list: apps/vibee-editor/render/src/navigation.json, served
 * at GET /api/navigation?platform=ios. This app ships the same bytes
 * (Vibee/navigation.json, written by scripts/sync-navigation.cjs and gated by
 * a test) so the bar is drawn before the first answer arrives, and replaces
 * them with the server's list when it comes.
 *
 * THE SERVER CANNOT INVENT A SCREEN. `screen(for:)` in VibeeApp.swift maps an
 * id to a view; a destination this build has no screen for is dropped, and a
 * test fails if the bundled list names one. A list is permission to show a
 * screen that exists, never a promise that one does.
 */

struct Destination: Codable, Identifiable, Equatable {
  struct Label: Codable, Equatable {
    let en: String
    let ru: String
  }

  struct Icon: Codable, Equatable {
    /// The web's Lucide name. Kept so the two lists stay one file.
    let lucide: String
    /// The SF Symbol this app draws.
    let sf: String
  }

  let id: String
  let route: String
  let platforms: [String]
  let labelKey: String
  let label: Label
  let icon: Icon

  /// What this phone shows, in the language it is set to.
  var title: String { say(label.en, label.ru) }
}

struct NavigationList: Codable, Equatable {
  let version: Int
  let destinations: [Destination]
}

enum Navigation {
  static let platform = "ios"

  /// The copy that ships inside the app, so a cold start has a tab bar.
  static let bundled: [Destination] = {
    guard
      let url = Bundle.main.url(forResource: "navigation", withExtension: "json"),
      let data = try? Data(contentsOf: url),
      let list = try? JSONDecoder().decode(NavigationList.self, from: data)
    else {
      /*
       * An empty bar is worse than a wrong one, and this can only happen if
       * the resource was dropped from the target — a build mistake, not a
       * runtime state. The test `bundledListIsReadable` fails first.
       */
      return []
    }
    return forThisApp(list.destinations)
  }()

  static func forThisApp(_ destinations: [Destination]) -> [Destination] {
    destinations.filter { $0.platforms.contains(platform) }
  }

  /**
   * The served list. Nil means "keep what we have": a server that is down,
   * slow or older than this build must never empty the bar.
   */
  static func fetch() async -> [Destination]? {
    let url = API.base.appendingPathComponent("api/navigation")
    guard
      var parts = URLComponents(url: url, resolvingAgainstBaseURL: false)
    else { return nil }
    parts.queryItems = [URLQueryItem(name: "platform", value: platform)]
    guard let asked = parts.url else { return nil }
    var request = URLRequest(url: asked)
    request.timeoutInterval = 6
    guard
      let (data, response) = try? await URLSession.shared.data(for: request),
      let http = response as? HTTPURLResponse,
      http.statusCode == 200,
      let list = try? JSONDecoder().decode(NavigationList.self, from: data)
    else { return nil }
    let mine = forThisApp(list.destinations)
    return mine.isEmpty ? nil : mine
  }
}
