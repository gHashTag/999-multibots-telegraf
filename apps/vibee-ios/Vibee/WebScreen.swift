import SwiftUI
import WebKit

/// Экран, который пока остаётся вебом.
///
/// НАМЕРЕННО, а не по лени. Редактор — это холст, таймлайн, перетаскивание
/// слоёв и предпросмотр рендера. Переписать его на SwiftUI — месяцы, и это
/// экран, куда заходят раз за сессию. Лента и чат, куда заходят каждый раз,
/// уже нативные.
struct WebScreen: View {
  let path: String
  var body: some View {
    WebViewContainer(url: URL(string: "https://app.t27.ai\(path)")!)
      .ignoresSafeArea(edges: .bottom)
  }
}

struct WebViewContainer: UIViewRepresentable {
  let url: URL

  /**
   * ПОЛОСА ВКЛАДОК ДОЛЖНА БЫТЬ ОДНА.
   *
   * Внутри WebView живёт собственная нижняя полоса мини-аппа, и вместе с
   * нативной их получалось ДВЕ: одна над другой, разной высоты, с разным
   * набором вкладок (в веб-версии пять, в нативной было четыре). Человек
   * видит две панели и не понимает, какая настоящая.
   *
   * Прячем ВЕБОВУЮ, а не нативную: нативная даёт системное поведение —
   * тап по активной вкладке прокручивает наверх, размытие фона, отклик на
   * шрифт и цвета системы. Ради этого всё и затевалось.
   *
   * Правка стилем, а не перевыпуском мини-аппа. Это важно: тот же адрес
   * открывается внутри Telegram, где веб-полоса — единственная и нужная.
   * Сервер про наш контейнер знать не должен, поэтому прячем на стороне
   * контейнера и только у себя.
   *
   * Ищем полосы ПО ГЕОМЕТРИИ (см. ниже), а не по именам классов, и заодно
   * обнуляем `--app-tabbar-total` — переменную, которую плеер публикует сам:
   * иначе страницы оставят снизу пустой отступ под уже спрятанную полосу.
   */
  private static let скрытьВебПолосу = #"""
  (function () {
    // Отступ снизу под полосу, которой уже нет.
    var s = document.createElement('style');
    s.textContent = ':root{--app-tabbar-total:0px !important}' +
                    'body{padding-bottom:0 !important}';
    (document.head || document.documentElement).appendChild(s);

    /**
     * Ищем полосы ПО ГЕОМЕТРИИ, а не по именам классов.
     *
     * Первая версия перечисляла селекторы (.telegram-tab-bar, nav[class*=…])
     * и поймала полосу на ленте, но пропустила вторую — в редакторе, у неё
     * другие классы. Перечислять дальше значит проигрывать гонку: полос
     * несколько, имена у них разные, и каждая новая версия мини-аппа может
     * добавить ещё.
     *
     * Признак у всех один и не зависит от разметки: элемент ПРИКЛЕЕН к низу
     * окна (fixed или sticky), невысокий и во всю ширину. Это и есть
     * определение нижней панели — по нему и прячем.
     */
    function прятать() {
      var H = window.innerHeight, W = window.innerWidth;
      var все = document.body ? document.body.querySelectorAll('*') : [];
      for (var i = 0; i < все.length; i++) {
        var el = все[i];
        if (el.dataset.nativeShellHidden) continue;
        var cs = getComputedStyle(el);
        if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
        var r = el.getBoundingClientRect();
        var приклеенКНизу = Math.abs(r.bottom - H) <= 4;
        var невысокая = r.height > 0 && r.height <= 120;
        var воВсюШирину = r.width >= W * 0.8;
        if (приклеенКНизу && невысокая && воВсюШирину) {
          el.dataset.nativeShellHidden = '1';
          el.style.setProperty('display', 'none', 'important');
        }
      }
    }

    /**
     * ТАЙМЛАЙН — по ТОЧНОМУ ИМЕНИ, а не по геометрии.
     *
     * Правило «приклеена к низу, невысокая, во всю ширину» ловит панели
     * вкладок, но таймлайн под него не подходит: он высокий и не приклеен.
     * Расширять правило нельзя — оно тут же заденет нужное.
     *
     * Имя взято из ЗАДЕПЛОЕННОГО чанка Editor-*.js, а не из локального
     * исходника и не из главного бандла: в главном этого класса нет вовсе,
     * редактор грузится лениво. Три промаха подряд были именно об это.
     *
     * Прячем ТОЛЬКО дорожки. .timeline-transport с кнопкой «Экспорт»
     * остаётся: это работающая функция, которой в нативной части ещё нет, и
     * менять двойной таймлайн на пропавший экспорт нельзя.
     */
    function прятатьТаймлайн() {
      var цели = document.querySelectorAll('.timeline-content');
      for (var i = 0; i < цели.length; i++) {
        var el = цели[i];
        if (el.dataset.nativeShellHidden) continue;
        el.dataset.nativeShellHidden = '1';
        el.style.setProperty('display', 'none', 'important');
      }
    }

    function всё() { прятать(); прятатьТаймлайн(); }

    всё();
    // Мини-апп — одностраничное приложение: панель на другом экране
    // появится позже и другой. Поэтому смотрим за деревом, а не один раз.
    new MutationObserver(всё).observe(document.documentElement, {
      childList: true, subtree: true
    });
    window.addEventListener('resize', всё);
  })();
  """#

  func makeUIView(context: Context) -> WKWebView {
    let cfg = WKWebViewConfiguration()
    // atDocumentEnd, а не Start: в Start ещё нет ни head, ни body, и стиль
    // пришлось бы вешать на documentElement с риском, что React затрёт.
    cfg.userContentController.addUserScript(
      WKUserScript(
        source: Self.скрытьВебПолосу,
        injectionTime: .atDocumentEnd,
        forMainFrameOnly: true
      )
    )

    let v = WKWebView(frame: .zero, configuration: cfg)
    v.isOpaque = false
    v.backgroundColor = .black
    v.scrollView.backgroundColor = .black
    v.load(URLRequest(url: url))
    return v
  }

  func updateUIView(_ uiView: WKWebView, context: Context) {}
}
