import SwiftUI
import UIKit

/// Нативный клиент Trinity S³AI.
///
/// ПОЧЕМУ ЭТО ВООБЩЕ ВОЗМОЖНО БЫСТРО. Сервер уже отдаёт чистый HTTP+JSON:
/// `/api/feed`, `/api/agent/chat`, `/mcp`. Веб-приложение — просто ОДИН из
/// клиентов, а не «то самое приложение». Значит нативный клиент не требует
/// ни строчки переделки на сервере: он берёт те же адреса.
///
/// ЧТО НАТИВНО, А ЧТО НЕТ. Нативным делаем то, где нативность реально
/// чувствуется пальцами: лента (вертикальный свайп с AVPlayer), таб-бар,
/// чат с агентом, профиль. Редактор — единственный экран с холстом,
/// таймлайном и перетаскиванием — остаётся в WKWebView: переписывать его
/// значит месяцы работы ради экрана, куда заходят раз в сессию.
@main
struct VibeeApp: App {
  var body: some Scene {
    WindowGroup { RootView() }
  }
}

struct RootView: View {
  /*
   * The bundled list draws the bar immediately; the served one replaces it
   * when it arrives. A server that is down, slow or older than this build
   * returns nil and the bundled list stays -- an empty bar is never a state
   * this app can be in.
   */
  @State private var destinations: [Destination] = Navigation.bundled
  /// The tab a person picked; the list's first until they pick one.
  @State private var picked: String?
  /// Tabs opened at least once. A screen is built on its first visit, as the
  /// system bar did, and then kept, so coming back finds it where it was left.
  @State private var opened: Set<String> = []
  /// The bar steps aside for the keyboard, as the system one did; otherwise
  /// it would ride up and sit between a text field and the keys.
  @State private var keyboardUp = false
  /// Taps on a tab's button while that tab was already open, per tab.
  @State private var reselects: [String: Int] = [:]

  /// The open tab: the picked one while the list still has it.
  private var current: String? {
    if let picked, destinations.contains(where: { $0.id == picked }) { return picked }
    return destinations.first?.id
  }

  /**
   * WHICH VIEW A DESTINATION OPENS. The list can only name screens this build
   * has: an id without a case here is dropped, and `everyDestinationHasAScreen`
   * fails if the bundled list names one. A list is permission to show a screen
   * that exists, not a promise that one does.
   */
  @ViewBuilder
  private func screen(for id: String) -> some View {
    switch id {
    case "feed": FeedView()
    case "chat": AgentChatView()
    case "ai": GenerateScreen()
    case "hive": HiveScreen()
    case "tasks": TasksScreen()
    case "profile": ProfileView()
    default: EmptyView()
    }
  }

  var body: some View {
    /*
     * THE WHOLE BAR IS LOCALISED, NOT JUST THE NEW TAB.
     *
     * Adding the hive with `say()` while its four neighbours stayed hard-coded
     * Russian produced a bar reading "Лента · Агент · ИИ · Hive · Профиль" on an
     * English phone. One English word among four Russian ones does not read as
     * bilingual, it reads as a bug.
     *
     * The bar is the app's frame and is a coherent unit, so it is done whole.
     * The SCREENS are still hard-coded Russian -- there is no .strings file in
     * this project and not one NSLocalizedString. That is a separate piece of
     * work (issue #2136); until it lands, an English phone gets an English bar
     * over Russian screens, which is visibly "partly translated" rather than
     * visibly broken.
     */
    /*
     * SIX TABS, ALL OF THEM IN THE BAR -- THE BAR IS OURS, NOT `TabView`'s.
     *
     * Owner, 2026-10-01: a Tasks tab beside the Game, "synced everywhere".
     * That made six destinations, and on an iPhone `TabView` shows five: the
     * sixth slot becomes the system "More", and AI and Profile went behind
     * it. The web shows all of them in one row, so this app draws the same
     * row -- the web's measurements are already in `Тема.ТабБар` (56 pt,
     * 20 pt glyphs, 10 pt labels).
     *
     * What the system bar did for free is kept by hand: a screen is built on
     * its first visit and then kept alive (hidden, not destroyed), and a
     * hidden screen is told so through `\.tabIsShown` -- the feed pauses on
     * it, because a kept screen gets no `onDisappear`.
     *
     * The list is still the shared one (see `destinations`): this only
     * draws it.
     */
    ZStack {
      ForEach(destinations) { destination in
        if opened.contains(destination.id) || destination.id == current {
          screen(for: destination.id)
            .environment(\.tabIsShown, destination.id == current)
            .environment(\.tabReselects, reselects[destination.id, default: 0])
            .opacity(destination.id == current ? 1 : 0)
            .allowsHitTesting(destination.id == current)
            .accessibilityHidden(destination.id != current)
        }
      }
    }
    .safeAreaInset(edge: .bottom, spacing: 0) {
      if !keyboardUp {
        BottomTabBar(destinations: destinations, selected: current) { id in
          if id == current { reselects[id, default: 0] += 1 } else { picked = id }
        }
      }
    }
    .onChange(of: current, initial: true) { _, id in
      if let id { opened.insert(id) }
    }
    .onReceive(
      NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)
    ) { _ in keyboardUp = true }
    .onReceive(
      NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)
    ) { _ in keyboardUp = false }
    .tint(Тема.ТабБар.активная)
    .preferredColorScheme(.dark)
    /**
     * FLUSH QUEUED ERROR REPORTS -- ONCE PER LAUNCH.
     *
     * The same job `installGlobalClientErrorReporting()` does on the web at
     * tab start: reports that failed to send last time (usually because the
     * network was down exactly when its being down was worth reporting) sit
     * in UserDefaults and get resent here.
     */
    .task { ClientErrorBeacon.flushQueue() }
    .task {
      if let served = await Navigation.fetch() { destinations = served }
    }
  }
}

/// Whether the tab holding this screen is the open one. Kept screens stay
/// alive while hidden and get no `onDisappear`, so this is how they learn it.
private struct TabIsShownKey: EnvironmentKey {
  static let defaultValue = true
}

extension EnvironmentValues {
  var tabIsShown: Bool {
    get { self[TabIsShownKey.self] }
    set { self[TabIsShownKey.self] = newValue }
  }
}

/*
 * TAPPING THE OPEN TAB AGAIN MEANS "TAKE ME BACK TO THE START".
 *
 * On the web every tab is a link to its own root, so tapping the open one
 * leaves a deep page (/game/kanban/123 -> /game/kanban). Instagram, TikTok
 * and Threads do the same and scroll to the top once already at the root.
 * The own bar dropped it: a repeat tap did nothing.
 *
 * This counts such taps per tab; a screen watches the count with `onChange`
 * and decides what "the start" is for it. A counter rather than a flag, so
 * two taps in a row are two changes.
 */
private struct TabReselectsKey: EnvironmentKey {
  static let defaultValue = 0
}

extension EnvironmentValues {
  var tabReselects: Int {
    get { self[TabReselectsKey.self] }
    set { self[TabReselectsKey.self] = newValue }
  }
}

/*
 * WHAT `TabView` DID FOR FREE, AND THE OWN BAR HAS TO DO BY HAND.
 *
 * Under `TabView` a tab's `.task` and `.onAppear` ran again on every return
 * and were cancelled on leaving. Screens leaned on that without saying so:
 * the profile re-read the balance after a generation in the AI tab, the AI
 * tab re-read its saved templates, the chat pulled the history shared with
 * the web. The own bar keeps screens alive in a ZStack, so a plain `.task`
 * now runs ONCE per launch -- and each of those went quietly stale.
 *
 * `taskWhileShown` restores the old contract in one place: it runs when the
 * tab comes forward and is cancelled when it goes back. Outside the bar
 * (`tabIsShown` defaults to true) it is an ordinary `.task`.
 */
private struct ShownKey<ID: Equatable>: Equatable {
  let id: ID
  let shown: Bool
}

private struct TaskWhileShown<ID: Equatable>: ViewModifier {
  @Environment(\.tabIsShown) private var shown
  let id: ID
  let action: () async -> Void

  func body(content: Content) -> some View {
    content.task(id: ShownKey(id: id, shown: shown)) {
      if shown { await action() }
    }
  }
}

extension View {
  /// `.task(id:)` that also re-runs each time the tab comes forward.
  func taskWhileShown<ID: Equatable>(id: ID, _ action: @escaping () async -> Void) -> some View {
    modifier(TaskWhileShown(id: id, action: action))
  }

  /// `.task` that re-runs each time the tab comes forward.
  func taskWhileShown(_ action: @escaping () async -> Void) -> some View {
    modifier(TaskWhileShown(id: 0, action: action))
  }
}

/// The row of tabs under every screen, measured from the web's
/// TelegramTabBar (`Тема.ТабБар`): opaque, full width, one row for all.
struct BottomTabBar: View {
  let destinations: [Destination]
  let selected: String?
  let pick: (String) -> Void
  /// Every tap, a repeat one included: the web bar calls
  /// `haptic.selection()` on each click, so the app gives the same tick.
  @State private var taps = 0

  var body: some View {
    HStack(spacing: 0) {
      ForEach(destinations) { destination in
        let on = destination.id == selected
        Button {
          taps += 1
          pick(destination.id)
        } label: {
          VStack(spacing: Тема.ТабБар.просветИконкаПодпись) { // cyrillic-ok
            // Outline glyphs, as the web draws them (Lucide is line-only).
            Image(systemName: destination.icon.sf)
              .font(Тема.Шрифт.значок(Тема.ТабБар.иконка)) // cyrillic-ok
              .symbolVariant(.none)
              .frame(height: Тема.ТабБар.иконка + 4) // cyrillic-ok
            Text(destination.title)
              .font(Тема.Шрифт.кегль(Тема.ТабБар.кегльПодписи, относительно: .caption2)) // cyrillic-ok
              .lineLimit(1)
              .minimumScaleFactor(0.8)
          }
          .foregroundStyle(on ? Тема.ТабБар.активная : Тема.ТабБар.неактивная)
          .frame(maxWidth: .infinity, minHeight: Тема.ТабБар.высота) // cyrillic-ok
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
      }
    }
    .background { Тема.ТабБар.фон.ignoresSafeArea(edges: .bottom) }
    .overlay(alignment: .top) {
      Тема.ТабБар.граница.frame(height: Тема.ТабБар.толщинаГраницы) // cyrillic-ok
    }
    // `TabView`'s bar told VoiceOver "tab bar" itself. SwiftUI has no such
    // trait (only UIKit's `.tabBar`), so the row is at least a named group:
    // "Tabs", then six buttons, rather than six buttons out of nowhere.
    .accessibilityElement(children: .contain)
    .accessibilityLabel(say("Tabs", "Вкладки"))
    .sensoryFeedback(.selection, trigger: taps)
  }
}

/**
 * Откуда взялся таймлайн на экране.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ ТИП, А НЕ ПАРА БУЛЕВЫХ ФЛАГОВ. Случаев четыре, и они
 * требуют РАЗНЫХ действий от человека: войти, создать первый проект, повторить
 * при отказе, работать. Флаги `загружено`/`ошибка` смешали бы «проектов нет» и
 * «не удалось спросить» в одно «пусто» — а это ровно та неразличимость, из-за
 * которой человек не понимает, чинится ли что-нибудь его действием.
 */
enum ИсточникТаймлайна: Equatable {
  case загрузка
  case проект(имя: String)
  case демоБезВхода
  case демоНетПроектов
  case демоОтказ(String)

  /// Демо надо ПОДПИСЫВАТЬ. Немаркированная выдумка на месте работы человека —
  /// это ложь интерфейса: правки уходят в никуда, а экран выглядит рабочим.
  var демо: Bool {
    if case .проект = self { return false }
    if case .загрузка = self { return false }
    return true
  }

  var подпись: String {
    switch self {
    case .загрузка: return "Загружаю проект…"
    case .проект(let имя): return имя.isEmpty ? "Без названия" : имя
    case .демоБезВхода: return "Демо — войдите, чтобы открыть свой проект"
    case .демоНетПроектов: return "Демо — проектов пока нет, сохраните первый"
    case .демоОтказ(let почему): return "Демо — проект не загрузился: \(почему)"
    }
  }
}

/**
 * Редактор: нативный предпросмотр, нативный таймлайн, проект с сервера.
 *
 * Прежний заголовок этого экрана обещал «таймлайн НАТИВНЫЙ, кадр — пока веб»
 * и объяснял, почему предпросмотр остаётся на Remotion. Оба утверждения давно
 * неверны: `PreviewView` рисует кадр сам, а композиция теперь приходит из
 * `/api/projects`, а не из зашитой демки. Комментарий, описывающий
 * несуществующую архитектуру, читается как проверенное знание — поэтому он
 * заменён, а не оставлен рядом.
 */
/**
 * URL сам по себе не `Identifiable`, а `.sheet(item:)` требует именно его.
 * Обёртка вместо `.sheet(isPresented:)` + отдельного `@State` под адрес: два
 * состояния вместо одного — это разъезд, при котором лист успевает открыться
 * раньше, чем в него положили файл.
 */
private struct ФайлНаОтдачу: Identifiable {
  let url: URL
  var id: String { url.path }
}

/// Системный лист «Поделиться»: сохранить в Файлы, отправить, положить в плёнку.
private struct ЛистОтдачи: UIViewControllerRepresentable {
  let url: URL
  func makeUIViewController(context: Context) -> UIActivityViewController {
    UIActivityViewController(activityItems: [url], applicationActivities: nil)
  }
  func updateUIViewController(_ c: UIActivityViewController, context: Context) {}
}

struct EditorScreen: View {
  @State private var composition = Composition.демо
  /**
   * Сборка из вкладки «ИИ» ПЕРЕБИВАЕТ демо и загрузку проекта.
   *
   * Человек только что нажал «Открыть в редакторе», собрав слои своими
   * руками. Показать ему вместо этого демо-композицию или чужой проект
   * значило бы потерять его работу на последнем шаге — там, где он ждёт
   * её больше всего.
   *
   * Забирается ОДИН раз: `готоваяКомпозиция` обнуляется при чтении, иначе
   * следующий заход в редактор затирал бы уже сделанные правки старой
   * сборкой.
   */
  @ObservedObject private var слои = Слои.общие
  @State private var currentFrame = 0
  @State private var выбран: String?
  @State private var показатьСвойства = false

  @State private var источник: ИсточникТаймлайна = .загрузка
  @State private var идПроекта: String?
  @State private var сохраняется = false
  @State private var экспортируется = false
  @State private var готовыйФайл: ФайлНаОтдачу?
  @State private var сообщение: String?

  var body: some View {
    VStack(spacing: 0) {
      шапка
      /**
       * НАТИВНЫЙ предпросмотр, а не вебвью.
       *
       * Здесь стоял `WebScreen(path: "/editor")`, и это давало ДВА документа
       * стопкой: вебвью показывал настоящий проект человека, а таймлайн под
       * ним правил захардкоженную демку. Правки в таймлайне не меняли
       * ничего из показанного сверху.
       *
       * Прошлый комментарий обещал заменить предпросмотр «на этапе Б, когда
       * avComposition() будет сверен по таймингу», и опасение было верным:
       * показать одно, а собрать другое — худший из отказов. Но расхождение
       * УЖЕ было, причём худшего вида: два экрана про разные вещи, и никакой
       * сверкой это не лечится.
       *
       * Теперь предпросмотр и таймлайн держат ОДНУ композицию через общее
       * связывание. Разойтись им нечем — не потому что мы сверили, а потому
       * что источник один.
       *
       * Это включает 3 943 строки уже написанного движка (PreviewView →
       * LayerBuilder → Animation → NativeRenderer), которые до сих пор не
       * вызывались ниоткуда.
       */
      PreviewView(composition: $composition, currentFrame: $currentFrame)
      TimelineView(
        composition: $composition, currentFrame: $currentFrame, выбран: $выбран
      )
      .frame(height: 210)
    }
    /**
     * Свойства — листом снизу, а не третьей панелью в столбце.
     *
     * На 402 pt по ширине три панели одновременно означают, что каждой
     * достаётся треть, и ни одна не годится. Лист появляется по выбору
     * клипа, живёт на среднем упоре и убирается смахиванием — то есть
     * занимает место ровно тогда, когда в нём есть нужда.
     */
    // Готовый файл отдаём сразу листом: экспорт, после которого надо ещё
    // куда-то идти за результатом, человек считает несработавшим.
    .sheet(item: $готовыйФайл) { ф in
      ЛистОтдачи(url: ф.url)
    }
    .sheet(isPresented: $показатьСвойства) {
      PropertiesView(composition: $composition, выбран: $выбран)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Тема.Цвет.фон)
    }
    .onChange(of: выбран) { _, новый in
      показатьСвойства = новый != nil
    }
    .task {
      // Сборка из «ИИ» проверяется ПЕРВОЙ и отменяет загрузку проекта:
      // человек только что нажал «Открыть в редакторе», и подменить его
      // работу чужим проектом — худшее, что можно сделать на этом шаге.
      if let собранная = слои.готоваяКомпозиция {
        composition = собранная
        слои.готоваяКомпозиция = nil
        источник = .проект(имя: "Сборка из «ИИ»")
        return
      }
      await загрузить()
    }
  }

  /**
   * Шапка: чей это таймлайн и что с ним можно сделать.
   *
   * Одна строка, а не панель: место на 402 pt по ширине принадлежит кадру и
   * дорожкам. Но строка обязательная — без неё демо неотличимо от проекта.
   */
  /**
   * Собрать файл и отдать его системному листу «Поделиться».
   *
   * Дерево слоёв строим ТЕМ ЖЕ `LayerBuilder`, которым рисует предпросмотр.
   * Это не совпадение и не договорённость: предпросмотр и файл получаются из
   * одного объекта, собранного одним кодом из одной `Composition`, поэтому
   * разойтись им нечем. Ровно ради этой гарантии предпросмотр в своё время и
   * увели с `WKWebView` на нативный.
   *
   * Дерево строится ЗАНОВО на каждый экспорт. `CALayer` не может находиться
   * в двух иерархиях сразу, а `AVVideoCompositionCoreAnimationTool` прямо
   * требует дерево, не привязанное ни к какому окну; переиспользование одного
   * экземпляра дало бы пустой кадр вместо титров — молча.
   */
  private func экспортировать() async {
    экспортируется = true
    defer { экспортируется = false }
    do {
      let дерево = try await LayerBuilder(composition: composition).build()
      let рендер = NativeRenderer(
        composition: composition,
        overlayBuilder: ClosureOverlayBuilder { _ in дерево })
      let адрес = FileManager.default.temporaryDirectory
        .appendingPathComponent("vibee-\(UUID().uuidString.prefix(8)).mp4")
      try await рендер.export(to: адрес)
      готовыйФайл = ФайлНаОтдачу(url: адрес)
    } catch {
      сообщение = "Экспорт не удался: \(error.localizedDescription)"
    }
  }

  private var шапка: some View {
    HStack(spacing: Тема.Отступ.sm) {
      Image(systemName: источник.демо ? "exclamationmark.triangle.fill" : "square.stack.3d.up.fill")
        .font(Тема.Шрифт.стиль(.caption))
        .foregroundStyle(источник.демо ? Тема.Цвет.предупреждение : Тема.Цвет.акцент)

      Text(сообщение ?? источник.подпись)
        .font(Тема.Шрифт.стиль(.caption))
        .foregroundStyle(источник.демо ? Тема.Цвет.предупреждение : Тема.Цвет.текстПриглушённый)
        .lineLimit(2)
        .frame(maxWidth: .infinity, alignment: .leading)

      if Identity.known {
        Button {
          Task { await сохранить() }
        } label: {
          Group {
            if сохраняется {
              ProgressView().controlSize(.mini)
            } else {
              Text(идПроекта == nil ? "Создать" : "Сохранить").font(Тема.Шрифт.стиль(.caption, .bold))
            }
          }
          // Высота ЯВНО и ВНУТРИ label. `.controlSize(.small)` давал около
          // 28 — тот самый размер, из-за которого в вебе поштучно чинили
          // восемь селекторов (index.css:224-281). Снаружи `.frame` не помог
          // бы: подложку рисует стиль кнопки по своему содержимому.
          .frame(minHeight: Тема.Кнопка.высота)
        }
        .disabled(сохраняется)
        .buttonStyle(.borderedProminent)
        .tint(Тема.Кнопка.основнаяФон)
        .foregroundStyle(Тема.Кнопка.основнаяТекст)

        /**
         * ЭКСПОРТ. Кнопка есть в мобильном вебе на этом же месте, а здесь её
         * не было вовсе — при том, что движок экспорта (`NativeRenderer`)
         * написан целиком и не вызывался НИОТКУДА. Редактор доводил человека
         * до собранного проекта и на этом заканчивался: отдать готовый ролик
         * было нечем.
         */
        Button {
          Task { await экспортировать() }
        } label: {
          Group {
            if экспортируется {
              ProgressView().controlSize(.mini)
            } else {
              Label("Экспорт", systemImage: "square.and.arrow.down")
                .font(Тема.Шрифт.стиль(.caption, .bold))
            }
          }
          .frame(minHeight: Тема.Кнопка.высота)
        }
        .disabled(экспортируется || сохраняется)
        .buttonStyle(.bordered)
        .tint(Тема.Цвет.акцент)
      }
    }
    .padding(.horizontal, Тема.Отступ.списокЛенты)
    .padding(.vertical, Тема.Отступ.sm)
    .background(Тема.Цвет.фон)
  }

  /**
   * Открыть ПЕРВЫЙ проект человека.
   *
   * Порядок отказов важнее самой загрузки. Демка тут запасной вариант и
   * ничего не обещает: она подписана, и в каждом случае сказано, ПОЧЕМУ она
   * здесь. Молча показать выдумку вместо чужой работы — худший из исходов,
   * потому что человек начнёт её править.
   */
  private func загрузить() async {
    guard Identity.known else {
      composition = .демо
      источник = .демоБезВхода
      return
    }
    do {
      let список = try await API.projects()
      guard let первый = список.first else {
        composition = .демо
        источник = .демоНетПроектов
        return
      }
      let проект = try await API.project(id: первый.id)
      composition = проект.composition
      идПроекта = проект.id
      источник = .проект(имя: проект.name)
    } catch {
      composition = .демо
      источник = .демоОтказ(error.localizedDescription)
    }
  }

  /**
   * Сохранить то, что на экране.
   *
   * Идентификатор выбирает КЛИЕНТ, поэтому «создать» и «сохранить» — один и
   * тот же PUT: отдельный способ завести проект был бы вторым местом, где
   * две формы одного действия разойдутся.
   */
  private func сохранить() async {
    сохраняется = true
    defer { сохраняется = false }

    let id = идПроекта ?? UUID().uuidString
    let имя: String
    if case .проект(let текущее) = источник, !текущее.isEmpty {
      имя = текущее
    } else {
      имя = "Мой проект"
    }

    do {
      let итог = try await API.saveProject(id: id, name: имя, composition: composition)
      идПроекта = итог.id
      источник = .проект(имя: итог.name)
      сообщение = "Сохранено"
    } catch {
      // Отказ НЕ прячем за общим словом: текст приходит из тела ответа
      // сервера, и в нём сказано, что именно не так.
      сообщение = error.localizedDescription
    }
    try? await Task.sleep(nanoseconds: 2_000_000_000)
    сообщение = nil
  }
}

extension Composition {
  /**
   * Демо-композиция: ЗАПАСНОЙ вариант, а не содержимое редактора.
   *
   * Показывается только когда своего проекта нет или он не открылся, и всегда
   * подписана на экране как демо — см. `ИсточникТаймлайна`. Пока она стояла
   * здесь молча, редактор правил выдумку и выглядел рабочим.
   */
  static var демо: Composition {
    Composition(
      fps: 30, width: 1080, height: 1920,
      tracks: [
        Track(id: "t1", type: "video", name: "Видео", items: [
          Clip(id: "c1", trackId: "t1", name: "Видео с губами",
               startFrame: 0, durationInFrames: 150),
        ]),
        Track(id: "t2", type: "image", name: "Фон", items: [
          Clip(id: "c2", trackId: "t2", name: "Фон 1",
               startFrame: 45, durationInFrames: 105),
        ]),
        Track(id: "t3", type: "audio", name: "Звук", items: [
          Clip(id: "c3", trackId: "t3", name: "Озвучка",
               startFrame: 0, durationInFrames: 150),
        ]),
      ])
  }
}
