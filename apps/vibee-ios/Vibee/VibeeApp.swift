import SwiftUI

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
  var body: some View {
    /**
     * ПЯТЬ вкладок — ровно те же, что в вебе, и в том же порядке.
     *
     * Было четыре, и это создавало вторую проблему поверх двух полос:
     * набор не совпадал. Веб-полоса несёт «ИИ» — единую вкладку генерации,
     * под которой живут картинки, видео, звук и аватар. Пропустить её
     * значит отрезать в нативной оболочке половину продукта.
     *
     * Иконки взяты системные (SF Symbols) и намеренно совпадают по смыслу с
     * вебовскими: дом, искры, плюс, палочка, человек. Один стиль — это не
     * «похоже нарисовано», а один источник: система рисует их сама, поэтому
     * они сходятся по весу, оптическому размеру и поведению при Dynamic Type.
     */
    TabView {
      FeedView()
        .tabItem { Label("Лента", systemImage: "house.fill") }
      AgentChatView()
        .tabItem { Label("Агент", systemImage: "sparkles") }
      EditorScreen()
        .tabItem { Label("Редактор", systemImage: "plus.square") }
      WebScreen(path: "/generate")
        .tabItem { Label("ИИ", systemImage: "wand.and.stars") }
      ProfileView()
        .tabItem { Label("Профиль", systemImage: "person") }
    }
    .tint(.green)
    .preferredColorScheme(.dark)
  }
}

/**
 * Редактор на этапе А: таймлайн НАТИВНЫЙ, кадр — пока веб.
 *
 * Разделение не компромисс, а сознательный порядок. Таймлайн выигрывает от
 * нативности больше всего (жест по 120 Гц против пересчёта раскладки DOM), а
 * предпросмотр — меньше всего: его рисует Remotion, и второй движок рядом
 * означал бы риск показать одно, а собрать другое.
 *
 * Пока предпросмотр один, расхождения быть не может по построению. Заменим
 * его на этапе Б, когда `avComposition()` будет сверен по тайммингу.
 */
struct EditorScreen: View {
  @State private var composition = Composition.демо
  @State private var currentFrame = 0
  @State private var выбран: String?
  @State private var показатьСвойства = false

  var body: some View {
    VStack(spacing: 0) {
      WebScreen(path: "/editor")
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
    .sheet(isPresented: $показатьСвойства) {
      PropertiesView(composition: $composition, выбран: $выбран)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(.black)
    }
    .onChange(of: выбран) { _, новый in
      показатьСвойства = новый != nil
    }
  }
}

extension Composition {
  /// Демо-композиция: таймлайн должно быть видно до подключения проекта.
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
