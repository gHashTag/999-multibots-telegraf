import SwiftUI
import UIKit
import WebKit

/**
 THE WEB APP'S OWN PAGES, SIGNED IN, INSIDE THE NATIVE APP.

 Owner, 2026-10-01: "make the comb map the original one, JS inside Swift is
 fine", and "add the interface for everything the app lags the web on". The
 Hive tab, the CRM, Story, the agents marketplace and the rest are whole web
 screens that change weekly. A second implementation in Swift drifts from the
 first the day either changes, so these pages are shown as they are.

 WHY AN EARLIER ATTEMPT WAS REMOVED, AND WHAT IS DIFFERENT NOW

 ProfileScreen.swift records it: a `WebScreen("/profile")` that never showed
 the person, because the web recognised them only by a Telegram launch
 signature this app does not have. What the web reads today is its own
 session in `sessionStorage` (player/src/lib/appSession.ts), and the app can
 hold one of those legitimately: it asks the render for a pairing code with
 its own Bearer session (`pair/start`), and claims that code at once
 (`pair/claim`). The result is a SEPARATE session family, listed under its own
 device name, that the page refreshes and rotates by itself.

 The native refresh token is never handed to a page. Two holders of one
 rotating token is how the second of them presents a spent one, and the server
 answers that by revoking the whole family -- the native sign-in included.

 ONE FAMILY PER WEB VIEW

 A web view's `sessionStorage` is its own, so a family cannot be shared between
 two of them without the same rotation race. There are two: the Hive tab, and
 one host reused for every section opened from the profile. That is two
 sign-ins per launch at most, under the server's brake of about ten a minute.
 */

// MARK: - The session handed to a page

/// What a page needs to start signed in. Never persisted by the app.
struct WebGrant {
  let id: String
  let accessToken: String
  let refreshToken: String
  /// Milliseconds since 1970, the form `trinity.app.session.expires-at` uses.
  let expiresAtMs: Int64
  /// The `vibee-user` object the web keeps beside its token (atoms/user.ts).
  let person: [String: Any]?
}

enum WebSessionMint {
  static let appOrigin = "https://app.t27.ai"

  /// Seconds left on a JWT, read from its `exp`. nil when it cannot be read.
  static func secondsLeft(_ jwt: String) -> TimeInterval? {
    let parts = jwt.split(separator: ".")
    guard parts.count == 3 else { return nil }
    var body = String(parts[1])
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
    while body.count % 4 != 0 { body += "=" }
    guard let data = Data(base64Encoded: body),
      let claims = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
      let exp = claims["exp"] as? Double
    else { return nil }
    return exp - Date().timeIntervalSince1970
  }

  /// The native access token, renewed first when it is about to lapse.
  private static func freshAccessToken() async -> String? {
    if let t = Identity.accessToken, let left = secondsLeft(t), left > 30 { return t }
    guard await Identity.refreshSession() else { return nil }
    return Identity.accessToken
  }

  /**
   Mint a family for one web view. nil when the person is not signed in here,
   or the server refused: the page then opens as a guest, which is honest --
   it offers its own sign-in, and the native one is a tap away.
   */
  static func mint() async -> WebGrant? {
    guard Identity.hasSession, let bearer = await freshAccessToken() else { return nil }

    var start = URLRequest(url: API.base.appendingPathComponent("api/auth/pair/start"))
    start.httpMethod = "POST"
    start.setValue("application/json", forHTTPHeaderField: "Content-Type")
    start.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
    start.httpBody = Data("{}".utf8)
    guard let (startData, startResp) = try? await URLSession.shared.data(for: start),
      (startResp as? HTTPURLResponse)?.statusCode == 200,
      let started = (try? JSONSerialization.jsonObject(with: startData)) as? [String: Any],
      let code = started["code"] as? String
    else {
      print("🌐 [web-session] pair/start refused")
      return nil
    }

    let device = await MainActor.run { UIDevice.current.name }
    var claim = URLRequest(url: API.base.appendingPathComponent("api/auth/pair/claim"))
    claim.httpMethod = "POST"
    claim.setValue("application/json", forHTTPHeaderField: "Content-Type")
    // Its own name in the session list, so "sign out this device" there is
    // never a guess between the app and the pages inside it.
    claim.httpBody = try? JSONSerialization.data(withJSONObject: [
      "code": code, "device_name": "\(device) · web",
    ])
    guard let (claimData, claimResp) = try? await URLSession.shared.data(for: claim),
      (claimResp as? HTTPURLResponse)?.statusCode == 200,
      let body = (try? JSONSerialization.jsonObject(with: claimData)) as? [String: Any],
      let access = body["access_token"] as? String,
      let refresh = body["refresh_token"] as? String
    else {
      print("🌐 [web-session] pair/claim refused")
      return nil
    }
    let expiresIn = (body["expires_in"] as? Double) ?? 600
    let telegramId = (body["telegram_id"] as? String) ?? Identity.telegramId
    return WebGrant(
      id: UUID().uuidString,
      accessToken: access,
      refreshToken: refresh,
      expiresAtMs: Int64((Date().timeIntervalSince1970 + expiresIn) * 1000),
      person: await person(telegramId))
  }

  /**
   The web shows a person only beside a token (atoms/user.ts), and a refresh of
   an app-kind session does not send one. Without this the page would act as
   the person while its header still offered "Log in".
   */
  private static func person(_ telegramId: String?) async -> [String: Any]? {
    guard let telegramId, let id = Int(telegramId) else { return nil }
    var person: [String: Any] = ["id": id, "first_name": "", "auth_date": 0]
    if let p = try? await API.profile(telegramId: telegramId) {
      person["first_name"] = p.display_name ?? p.username
      person["username"] = p.username
      if let avatar = p.avatar_url { person["photo_url"] = avatar }
    }
    return person
  }
}

// MARK: - Scripts run inside the page

private enum PageScripts {
  /**
   The tab bar is the phone's; the web's own would be a second one. Hiding it
   is not enough: the pages still reserve its height (`--app-tabbar-total`),
   which left an empty band under the board above the phone's own bar.
   */
  static let hideWebTabBar = """
    (function () {
      var s = document.createElement('style');
      s.textContent = '.tma-tabbar{display:none!important}'
        + ':root{--app-tabbar-total:0px!important}'
        + '.hive-page{padding-bottom:0!important}';
      (document.head || document.documentElement).appendChild(s);
    })();
    """

  /**
   The board opens as the map alone -- its own fullscreen, which hides every
   panel -- owner, 2026-10-01: "fullscreen by default on mobile, it is too
   small". The board enters that mode through the Fullscreen API, which a web
   view on an iPhone does not have, so its button did nothing here. This gives
   the board's frame a Fullscreen API that keeps the page inside the web view
   (the phone's tab bar stays), and presses it once on the first load. The
   board's own button leaves it and comes back.

   The board's bare rules hide panels that are children of the page; on a
   phone the top bar and the view rail live inside the viewport instead, and
   the head keeps a margin for the bar. Measured at 402x780: the map was 235px
   tall with the board's rules alone and 583px with the four below.
   */
  static let boardFullscreen = """
    (function () {
      if (location.origin !== '\(WebSessionMint.appOrigin)') return;
      if (location.pathname.indexOf('/queen') !== 0) return;
      var held = null;
      var changed = function () { document.dispatchEvent(new Event('fullscreenchange')); };
      try {
        Object.defineProperty(Document.prototype, 'fullscreenElement', {
          configurable: true,
          get: function () { return held && held.isConnected ? held : null; }
        });
        Object.defineProperty(Document.prototype, 'fullscreenEnabled', {
          configurable: true, get: function () { return true; }
        });
      } catch (e) { return; }
      var bare = '.queen27-page.is-shell.is-bare ';
      var s = document.createElement('style');
      s.textContent = bare + '.queen27-hud-viewport>:is(.queen27-hud-top,.queen27-hud-bottom),'
        + bare + '.queen-catalog-toolbar{display:none!important}'
        + bare + '.queen27-hud-viewport>.queen27-hud-vp-head{margin-top:0!important}'
        + bare + ':is(.queen27-hud-vp-body,.queen-scene-holder){padding-bottom:8px!important}'
        // The frame runs under the phone's tab bar (HiveScreen), and WebKit
        // hands the frame that bar as env(safe-area-inset-bottom): 83px. The
        // board already lifts its page by it, so the full board stops above
        // the bar by itself. Its view rail adds the same 83px INSIDE its own
        // 84px, which left a 1px strip of buttons -- the rail sits above the
        // bar already, so it pads nothing. The map alone may run under it.
        + '.queen27-page.is-shell .queen27-hud-bottom{padding-bottom:0!important}'
        + '.queen-universe:has(.queen27-page.is-bare){padding-bottom:0!important}';
      document.documentElement.appendChild(s);
      Element.prototype.requestFullscreen = function () { held = this; changed(); return Promise.resolve(); };
      Document.prototype.exitFullscreen = function () { held = null; changed(); return Promise.resolve(); };
      var tries = 0;
      var timer = setInterval(function () {
        if (document.querySelector('.queen27-page.is-bare') || ++tries > 120) return clearInterval(timer);
        var view = document.querySelector('.queen27-page.is-shell .queen27-hud-viewport');
        if (view) view.requestFullscreen();
      }, 500);
    })();
    """

  /**
   Writes the grant once per grant: a reload after the page renewed its own
   session must keep the renewed one, not put back a spent refresh token.
   `since` follows the web's rule -- later than any sign-out this browser saw,
   or its own check would end the session on boot.
   */
  static func session(_ grant: WebGrant, language: String) -> String {
    var payload: [String: Any] = [
      "id": grant.id,
      "access": grant.accessToken,
      "refresh": grant.refreshToken,
      "expiresAt": grant.expiresAtMs,
      "lang": language,
    ]
    if let person = grant.person { payload["person"] = person }
    let json =
      (try? JSONSerialization.data(withJSONObject: payload))
      .flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    return """
      (function (g) {
        if (location.origin !== '\(WebSessionMint.appOrigin)') return;
        try {
          if (!localStorage.getItem('vibee-lang'))
            localStorage.setItem('vibee-lang', JSON.stringify(g.lang));
        } catch (e) {}
        if (!g.access) return;
        try {
          var s = sessionStorage;
          if (s.getItem('ios.web-grant') === g.id) return;
          var out = Number(localStorage.getItem('trinity.app.session.signed-out-at') || 0);
          s.setItem('trinity.app.session.since', String(Math.max(Date.now(), out + 1)));
          s.setItem('trinity.app.session.access', g.access);
          s.setItem('trinity.app.session.refresh', g.refresh);
          s.setItem('trinity.app.session.expires-at', String(g.expiresAt));
          if (g.person) s.setItem('vibee-user', JSON.stringify(g.person));
          s.setItem('ios.web-grant', g.id);
        } catch (e) {}
      })(\(json));
      """
  }

  /**
   The board asks its parent page for a sign-in with a `t27-app` message. In
   the app the native sign-in answers it; the web's own card would offer the
   Telegram Login Widget, which needs a popup a web view does not have. This
   listener is registered before the page's, so it can stop the message there.
   */
  static let signInBridge = """
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (!d || d.type !== 't27-app' || d.kind !== 'sign-in') return;
      e.stopImmediatePropagation();
      try { window.webkit.messageHandlers.vibee.postMessage({ kind: 'sign-in' }); } catch (x) {}
    }, true);
    """
}

// MARK: - The host

/**
 Owns one WKWebView and the session family inside it. A class, not view
 state: SwiftUI recreates views freely, and recreating this would mint a new
 family each time.
 */
@MainActor
final class WebHost: NSObject, ObservableObject {
  enum Phase: Equatable { case starting, loading, ready, failed(String) }

  @Published private(set) var phase: Phase = .starting
  /// The board or a page asked for a sign-in; the screen shows the native one.
  @Published var wantsSignIn = false
  @Published private(set) var signedIn = false

  let webView: WKWebView
  private var path: String
  private var started = false

  init(path: String) {
    self.path = path
    let config = WKWebViewConfiguration()
    config.allowsInlineMediaPlayback = true
    config.mediaTypesRequiringUserActionForPlayback = []
    webView = WKWebView(frame: .zero, configuration: config)
    super.init()
    webView.isOpaque = false
    webView.backgroundColor = .black
    webView.scrollView.backgroundColor = .black
    webView.allowsBackForwardNavigationGestures = true
    webView.navigationDelegate = self
    webView.uiDelegate = self
    config.userContentController.add(WeakHandler(self), name: "vibee")
  }

  private func url(_ path: String) -> URL {
    let lang = speaksRussian ? "ru" : "en"
    var c = URLComponents(string: WebSessionMint.appOrigin + path)!
    var items = c.queryItems ?? []
    if !items.contains(where: { $0.name == "lang" }) {
      items.append(URLQueryItem(name: "lang", value: lang))
    }
    c.queryItems = items
    return c.url!
  }

  /// First appearance: mint, install, load. Later calls do nothing.
  func start() async {
    guard !started else { return }
    started = true
    await install(grant: await WebSessionMint.mint())
    webView.load(URLRequest(url: url(path)))
  }

  /// Show another page in the same web view, and the same family.
  func open(_ newPath: String) async {
    path = newPath
    if !started {
      await start()
      return
    }
    phase = .loading
    webView.load(URLRequest(url: url(newPath)))
  }

  /// After a native sign-in or sign-out: a new family, or none, then reload.
  func renew() async {
    phase = .loading
    await install(grant: await WebSessionMint.mint())
    await clearPageSession()
    webView.load(URLRequest(url: url(path)))
  }

  func reload() {
    phase = .loading
    webView.load(URLRequest(url: url(path)))
  }

  private func install(grant: WebGrant?) async {
    let controller = webView.configuration.userContentController
    controller.removeAllUserScripts()
    let language = speaksRussian ? "ru" : "en"
    let session = grant.map { PageScripts.session($0, language: language) }
      ?? PageScripts.session(
        WebGrant(id: "", accessToken: "", refreshToken: "", expiresAtMs: 0, person: nil),
        language: language)
    controller.addUserScript(
      WKUserScript(source: session, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    controller.addUserScript(
      WKUserScript(
        source: PageScripts.signInBridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    controller.addUserScript(
      WKUserScript(
        source: PageScripts.hideWebTabBar, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
    controller.addUserScript(
      WKUserScript(
        source: PageScripts.boardFullscreen, injectionTime: .atDocumentStart, forMainFrameOnly: false))
    signedIn = grant != nil
  }

  /**
   Ends the page's family on the server, then forgets it in the page. Called
   when the person signs out natively: the app's "Sign out" has to mean the
   pages inside it too, not leave a second, invisible session behind.
   */
  private func clearPageSession() async {
    let token = try? await webView.evaluateJavaScript(
      "sessionStorage.getItem('trinity.app.session.access')") as? String
    if let token, !token.isEmpty {
      var r = URLRequest(url: API.base.appendingPathComponent("api/auth/logout"))
      r.httpMethod = "POST"
      r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
      _ = try? await URLSession.shared.data(for: r)
    }
    _ = try? await webView.evaluateJavaScript(
      """
      ['trinity.app.session.access','trinity.app.session.refresh',
       'trinity.app.session.expires-at','trinity.app.session.since',
       'vibee-user','ios.web-grant'].forEach(function (k) { sessionStorage.removeItem(k) });
      true
      """)
  }
}

extension WebHost: WKNavigationDelegate, WKUIDelegate {
  /**
   The app's own pages stay here; everything else -- Telegram links, a
   payment, an article -- opens where it belongs. Frames are never redirected:
   the board itself is a frame, and its host is the web app's.
   */
  func webView(
    _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
    decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
  ) {
    guard let target = action.request.url else { return decisionHandler(.cancel) }
    let mainFrame = action.targetFrame?.isMainFrame ?? true
    let ours = target.host == "app.t27.ai" || target.host == "auth.t27.ai"
    if !mainFrame || ours || target.scheme == "about" || target.scheme == "blob" {
      return decisionHandler(.allow)
    }
    if ["http", "https", "tg", "mailto"].contains(target.scheme ?? "") {
      UIApplication.shared.open(target)
    }
    decisionHandler(.cancel)
  }

  func webView(
    _ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
    decisionHandler: @escaping @MainActor (WKNavigationResponsePolicy) -> Void
  ) {
    if response.isForMainFrame, let http = response.response as? HTTPURLResponse,
      http.statusCode >= 500
    {
      phase = .failed("HTTP \(http.statusCode)")
    }
    decisionHandler(.allow)
  }

  /// Shown from the first paint, not after the last frame: the board's own
  /// scene loads for many seconds and draws its own progress meanwhile.
  func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
    if case .failed = phase { return }
    phase = .ready
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    if case .failed = phase { return }
    phase = .ready
  }

  func webView(
    _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
    withError error: Error
  ) {
    fail(error)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    fail(error)
  }

  private func fail(_ error: Error) {
    // A navigation replaced by the next one is not a failure of the page.
    if (error as NSError).code == NSURLErrorCancelled { return }
    phase = .failed(error.localizedDescription)
  }

  /// `window.open` and `target=_blank`: one page at a time, in this view.
  func webView(
    _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
    for action: WKNavigationAction, windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    if let target = action.request.url {
      if target.host == "app.t27.ai" { webView.load(action.request) }
      else { UIApplication.shared.open(target) }
    }
    return nil
  }

  /// A page that crashed its process comes back instead of staying blank.
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    webView.reload()
  }
}

extension WebHost {
  fileprivate func received(_ message: WKScriptMessage) {
    guard let body = message.body as? [String: Any], body["kind"] as? String == "sign-in"
    else { return }
    wantsSignIn = true
  }
}

/// WKUserContentController holds its handlers strongly; this breaks the cycle.
private final class WeakHandler: NSObject, WKScriptMessageHandler {
  weak var host: WebHost?
  init(_ host: WebHost) { self.host = host }
  func userContentController(
    _ controller: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    MainActor.assumeIsolated { host?.received(message) }
  }
}

// MARK: - SwiftUI

/// The host's web view, placed. The view is the host's, so it survives redraws.
struct WebHostView: UIViewRepresentable {
  let host: WebHost
  func makeUIView(context: Context) -> WKWebView { host.webView }
  func updateUIView(_ view: WKWebView, context: Context) {}
}

/**
 A web page with the states around it: a loader while it comes, a plain
 reason and a retry when it does not, and the native sign-in when it asks.
 `fallback` replaces the page when it cannot load at all.
 */
struct WebPage<Fallback: View>: View {
  @ObservedObject var host: WebHost
  /// The page runs to the bottom edge, under the floating tab bar, and keeps
  /// its own controls clear of it (the hive: its map is the background).
  var runsUnderTabBar = false
  @ViewBuilder var fallback: () -> Fallback

  var body: some View {
    ZStack {
      WebHostView(host: host)
        .ignoresSafeArea(.container, edges: runsUnderTabBar ? .bottom : [])
        .opacity(host.phase == .ready ? 1 : 0)
      switch host.phase {
      case .starting, .loading:
        ProgressView().tint(Palette.accent)
      case .failed(let why):
        // No ScrollView around the fallback: it may scroll itself, and a
        // scroll view inside another collapses to nothing.
        VStack(alignment: .leading, spacing: Space.sm) {
          HStack {
            Text(say("The page did not load: \(why)", "Страница не загрузилась: \(why)"))
              .font(Typeface.style(.footnote))
              .foregroundStyle(Palette.warning)
            Spacer()
            Button(say("Try again", "Повторить")) { host.reload() }
              .frame(minHeight: Touch.minimum)
              .foregroundStyle(Palette.accent)
          }
          .padding(.horizontal, Space.md)
          fallback()
          Spacer(minLength: 0)
        }
      case .ready:
        EmptyView()
      }
    }
    .background(Palette.background.ignoresSafeArea())
    .task { await host.start() }
    .sheet(isPresented: $host.wantsSignIn) {
      ScrollView {
        VStack(alignment: .leading, spacing: Space.md) {
          Text(say("Sign in", "Вход"))
            .font(Typeface.style(.title3, .semibold))
            .foregroundStyle(Palette.text)
          SignInView {
            host.wantsSignIn = false
            Task { await host.renew() }
          }
        }
        .padding(Space.md)
      }
      .background(Palette.background.ignoresSafeArea())
      .presentationDetents([.medium, .large])
    }
  }
}

extension WebPage where Fallback == EmptyView {
  init(host: WebHost) {
    self.init(host: host) { EmptyView() }
  }
}

// MARK: - Sections opened from the profile

/// The web screens the app has no native counterpart for. Paths are the web's
/// own routes (player/src/App.tsx), not copies of their content.
struct WebSection: Identifiable, Hashable {
  let id: String
  let path: String
  let title: String
  let subtitle: String
  let icon: String

  static func all(username: String?) -> [WebSection] {
    var list: [WebSection] = [
      WebSection(
        id: "agents", path: "/agents", title: say("Agents", "Агенты"),
        subtitle: say("the marketplace, and each agent's dashboard", "маркетплейс и кабинет каждого агента"),
        icon: "person.3.sequence"),
      WebSection(
        id: "connect", path: "/agents/connect", title: say("Connect an agent", "Подключить агента"),
        subtitle: say("keys and the harness for your own agent", "ключи и обвязка для своего агента"),
        icon: "key"),
      WebSection(
        id: "crm", path: "/crm", title: "CRM",
        subtitle: say("clients, the map, events and leads", "клиенты, карта, события и лиды"),
        icon: "person.crop.rectangle.stack"),
      WebSection(
        id: "story", path: "/story", title: say("Story", "История"),
        subtitle: say("a reel from your story", "ролик из вашей истории"),
        icon: "film.stack"),
      WebSection(
        id: "browser", path: "/browser", title: say("Browser", "Браузер"),
        subtitle: say("the agent's browser, and your hand on it", "браузер агента и ваша рука на нём"),
        icon: "globe"),
      WebSection(
        id: "templates", path: "/templates", title: say("Templates", "Шаблоны"),
        subtitle: say("start from somebody's reel", "начать с чужого ролика"),
        icon: "square.grid.2x2"),
      WebSection(
        id: "blog", path: "/blog", title: say("Blog", "Блог"),
        subtitle: say("what is new, in long form", "что нового, подробно"),
        icon: "text.book.closed"),
      WebSection(
        id: "learn", path: "/learn", title: say("Learn", "Обучение"),
        subtitle: say("how to make the most of it", "как пользоваться с толком"),
        icon: "graduationcap"),
    ]
    if let username, !username.isEmpty {
      list.insert(
        WebSection(
          id: "profile-web", path: "/\(username)", title: say("Full profile", "Профиль целиком"),
          subtitle: say("skills, SOUL.md, followers and the rest of the tabs", "навыки, SOUL.md, подписчики и остальные вкладки"),
          icon: "person.text.rectangle"),
        at: 0)
    }
    return list
  }
}

/// One host for every section: one session family, however many are opened.
@MainActor
enum SectionHost {
  static let shared = WebHost(path: "/agents")
}

/// The list in the profile. Each row opens its page in a sheet.
struct WebSectionsList: View {
  let username: String?
  @State private var open: WebSection?

  var body: some View {
    VStack(alignment: .leading, spacing: Space.sm) {
      Text(say("More", "Ещё"))
        .font(Typeface.style(.subheadline, .semibold))
        .foregroundStyle(Palette.text)
      ForEach(WebSection.all(username: username)) { section in
        Button {
          open = section
        } label: {
          HStack(spacing: Space.md) {
            Image(systemName: section.icon)
              .frame(width: 24)
              .foregroundStyle(Palette.accent)
            VStack(alignment: .leading, spacing: 2) {
              Text(section.title)
                .font(Typeface.style(.subheadline, .medium))
                .foregroundStyle(Palette.text)
              Text(section.subtitle)
                .font(Typeface.style(.caption))
                .foregroundStyle(Palette.textMuted)
            }
            Spacer()
            Image(systemName: "chevron.right")
              .foregroundStyle(Palette.textInactive)
          }
          .frame(minHeight: Touch.minimum)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("profile.section.\(section.id)")
      }
    }
    .sheet(item: $open) { section in
      WebSectionScreen(section: section)
    }
  }
}

private struct WebSectionScreen: View {
  let section: WebSection
  @Environment(\.dismiss) private var dismiss
  @ObservedObject private var host = SectionHost.shared

  var body: some View {
    NavigationStack {
      WebPage(host: host)
        .navigationTitle(section.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .topBarLeading) {
            Button(say("Done", "Готово")) { dismiss() }
          }
          ToolbarItem(placement: .topBarTrailing) {
            Button {
              if host.webView.canGoBack { host.webView.goBack() }
            } label: {
              Image(systemName: "chevron.backward")
            }
            .disabled(!host.webView.canGoBack)
          }
        }
    }
    .task { await host.open(section.path) }
    .preferredColorScheme(.dark)
  }
}

/// Every live host, so a native sign-in or sign-out reaches the pages too.
@MainActor
enum WebHosts {
  static func renewAll() async {
    await SectionHost.shared.renewIfStarted()
    await HiveHost.shared.renewIfStarted()
    await HiveHost.tasks.renewIfStarted()
  }
}

extension WebHost {
  func renewIfStarted() async {
    guard started else { return }
    await renew()
  }
}

/// The Hive tab's own host, kept for the life of the app like the tab itself.
@MainActor
enum HiveHost {
  static let shared: WebHost = {
    // The board's address is the list's (it moved /hive -> /game on
    // 2026-10-01); the old one only redirects, and a redirect is a second load.
    board(id: "hive", fallback: "/game")
  }()

  /// The Tasks tab: the same board opened on its kanban (owner, 2026-10-01:
  /// "make a tab with the tasks"). A host of its own, so switching tabs does
  /// not drag the other one's view along with it.
  static let tasks: WebHost = board(id: "tasks", fallback: "/game/kanban")

  private static func board(id: String, fallback: String) -> WebHost {
    let host = WebHost(path: Navigation.bundled.first { $0.id == id }?.route ?? fallback)
    // It runs under the tab bar on purpose; an automatic inset there would
    // let the whole board scroll up by the home indicator's height.
    host.webView.scrollView.contentInsetAdjustmentBehavior = .never
    return host
  }
}
