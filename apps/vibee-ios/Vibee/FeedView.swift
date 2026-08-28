import AVFoundation
import AVKit
import SwiftUI

/// Лента: вертикальный пейджинг с настоящим AVPlayer.
///
/// Ради ЭТОГО экрана и стоит идти в нативность. В вебвью вертикальный
/// свайп по видео всегда чуть-чуть не тот: инерция чужая, видео тормозит на
/// переключении, звук не слушается аппаратных кнопок. Здесь всё это даёт
/// система бесплатно: TabView(.page) — родной свайп, AVPlayer — родное
/// декодирование и Picture-in-Picture.
struct FeedView: View {
  @State private var items: [API.Template] = []
  @State private var ошибка: String?
  @State private var грузим = true

  /**
   * Звук — ОДИН на всю ленту, а не на карточку.
   *
   * Так же устроен веб (`feedMutedAtom`, atoms/feed.ts:41) и так же — все
   * вертикальные ленты: человек решает про звук один раз, а не заново на
   * каждом ролике. Состояние живёт здесь, потому что переживает пролистывание;
   * в `ReelView` оно приходит связыванием и умирает вместе с карточкой.
   *
   * Начальное значение `false` (звук есть) взято из веба намеренно: два
   * клиента одного продукта не должны вести себя по-разному в первом же
   * жесте.
   */
  @State private var звукВыключен = false

  /**
   * Кто сейчас на экране. Играет РОВНО ОДИН ролик.
   *
   * `LazyVStack` создаёт карточки с запасом вперёд, и `onAppear` у соседних
   * срабатывает раньше, чем их видно. Пока каждая карточка играла по своему
   * `onAppear`, звучали два-три ролика разом — а с появлением кнопки звука
   * это выглядело бы поломкой именно кнопки: выключаешь, а слышно.
   *
   * `scrollPosition(id:)` (iOS 17) даёт настоящий текущий элемент от
   * системы. Пока прокрутки не было, он `nil` — тогда текущим считаем первый.
   */
  @State private var текущий: String?

  /// Короткое сообщение поверх ленты: единственный способ ответить на
  /// действие, которое не удалось. Пустой экран вместо ответа — та самая
  /// тишина, из-за которой человек жмёт кнопку второй и третий раз.
  @State private var подсказка: String?

  var body: some View {
    ZStack {
      Тема.Цвет.фон.ignoresSafeArea()

      if грузим {
        ProgressView().tint(Тема.Цвет.акцент)
      } else if let ошибка {
        // Отказ показываем словами. Пустой экран вместо объяснения —
        // ровно та ошибка, которую весь вчерашний день чинил в вебе.
        VStack(spacing: 10) {
          Image(systemName: "wifi.exclamationmark").font(.largeTitle)
          Text("Лента не загрузилась").font(.headline)
          Text(ошибка).font(.footnote).foregroundStyle(Тема.Цвет.текстПриглушённый)
            .multilineTextAlignment(.center)
          Button { Task { await загрузить() } } label: {
            // Высота ВНУТРИ label. Снаружи `.frame` растягивает только
            // контейнер, а заливку рисует стиль по своему содержимому —
            // замерено 34.3 pt при формальных 44.
            Text("Ещё раз")
              .frame(minHeight: Тема.Кнопка.высота)
              .padding(.horizontal, Тема.Кнопка.отступПоГоризонтали)
          }
          .buttonStyle(.borderedProminent)
          .tint(Тема.Кнопка.основнаяФон)
          .foregroundStyle(Тема.Кнопка.основнаяТекст)
        }
        .padding(Тема.Отступ.xl)
      } else if items.isEmpty {
        Text("В ленте пока пусто").foregroundStyle(Тема.Цвет.текстПриглушённый)
      } else {
        /// Вертикальный пейджинг БЕЗ хака с поворотом.
        ///
        /// Классический приём «TabView + rotationEffect(90°)» до сих пор
        /// кочует по статьям, но он ломает раскладку: повёрнутая полоса
        /// вкладок вылезает поверх статус-бара, а размеры считаются от
        /// UIScreen, то есть неверны на сплит-скрине и при повороте.
        ///
        /// С iOS 17 то же самое делается родным способом — и это ровно тот
        /// случай, ради которого затевалась нативность: инерция, отскок и
        /// докрутка достаются от системы, а не эмулируются.
        GeometryReader { geo in
          ScrollView(.vertical) {
            LazyVStack(spacing: 0) {
              ForEach(items) { t in
                ReelView(
                  template: t,
                  звукВыключен: $звукВыключен,
                  активен: активен(t),
                  сообщить: показать
                )
                .frame(width: geo.size.width, height: geo.size.height)
              }
            }
            .scrollTargetLayout()
          }
          .scrollTargetBehavior(.paging)
          .scrollPosition(id: $текущий)
          .scrollIndicators(.hidden)
        }
        /**
         * `ignoresSafeArea` — НА GeometryReader, а не на ScrollView внутри.
         *
         * Когда он стоял внутри, geo.size считался БЕЗ безопасных зон, а
         * прокрутка занимала весь экран: страница выходила короче шага, и
         * снизу подглядывала следующая карточка, а по краям оставались
         * поля. Рилс, который не во весь экран, — это уже не рилс.
         *
         * Здесь порядок решает: сначала снимаем безопасные зоны, потом
         * меряем. Полоса вкладок остаётся сверху как оверлей — это её
         * штатное поведение в TabView.
         */
        .ignoresSafeArea()
      }

      if let подсказка {
        Text(подсказка)
          .font(.footnote.weight(.medium))
          .foregroundStyle(Тема.Цвет.текст)
          .multilineTextAlignment(.center)
          .padding(.horizontal, Тема.Отступ.md).padding(.vertical, Тема.Отступ.карточкаЛенты)
          .background(Тема.Цвет.фон.opacity(0.92), in: Capsule())
          .padding(.horizontal, Тема.Отступ.lg)
          /**
           * СВЕРХУ, а не над полосой вкладок.
           *
           * Внизу подсказка ложилась ровно на название ролика и автора:
           * читаемо, но поверх чужого текста — а сообщение об отказе обязано
           * читаться с первого взгляда, не разбираясь, где кончается оно и
           * начинается подпись. Сверху кадр почти всегда пуст, и ни один
           * элемент туда не попадает.
           */
          .padding(.top, 64)
          .frame(maxHeight: .infinity, alignment: .top)
          .transition(.opacity)
          .allowsHitTesting(false)
      }
    }
    .task {
      настроитьЗвук()
      await загрузить()
    }
  }

  /// Текущий по версии системы; до первой прокрутки — первый в списке.
  private func активен(_ t: API.Template) -> Bool {
    текущий == nil ? t.id == items.first?.id : текущий == t.id
  }

  /**
   * Категория аудио-сессии — `playback`, и ставит её ИМЕННО лента.
   *
   * По умолчанию процесс живёт в `soloAmbient`: беззвучный переключатель на
   * корпусе глушит звук полностью. Тогда кнопка «звук» переключала бы
   * иконку и НИЧЕГО не меняла — ровно та мёртвая кнопка, ради отсутствия
   * которой всё и делается.
   *
   * `PreviewView` в своём комментарии честно отказался это трогать: менять
   * состояние всего процесса из предпросмотра значило бы ударить по ленте.
   * Обратное направление верно — звук в этом приложении принадлежит ленте,
   * и владелец настройки должен быть один.
   */
  private func настроитьЗвук() {
    do {
      try AVAudioSession.sharedInstance().setCategory(.playback, mode: .moviePlayback)
      try AVAudioSession.sharedInstance().setActive(true)
    } catch {
      NSLog("[Feed] аудио-сессия не настроена: \(error.localizedDescription)")
    }
  }

  private func показать(_ текст: String) {
    withAnimation(.easeOut(duration: 0.2)) { подсказка = текст }
    Task {
      try? await Task.sleep(for: .seconds(3))
      withAnimation(.easeIn(duration: 0.3)) { подсказка = nil }
    }
  }

  private func загрузить() async {
    грузим = true; ошибка = nil
    do { items = try await API.feed() } catch { ошибка = error.localizedDescription }
    грузим = false
  }
}

/// Один ролик: видео на весь экран, поверх — автор, заголовок и действия.
struct ReelView: View {
  let template: API.Template
  @Binding var звукВыключен: Bool
  /// Виден ли ролик прямо сейчас. Играет только активный — см. `текущий`.
  let активен: Bool
  /// Чем ответить, когда действие не удалось.
  let сообщить: (String) -> Void

  @State private var player: AVPlayer?

  /// Лайк держим ЛОКАЛЬНО, чтобы палец получал ответ мгновенно, а сервер
  /// потом либо подтверждает, либо возвращает как было.
  @State private var лайкнут = false
  @State private var лайков = 0
  @State private var лайкВПути = false
  /// Просмотр засчитывается ОДИН раз на карточку, а не на каждое возвращение
  /// в кадр: иначе прокрутка туда-сюда накручивала бы автору цифры.
  @State private var просмотрЗасчитан = false

  var body: some View {
    ZStack {
      if let player {
        PlayerLayerView(player: player).ignoresSafeArea()
      } else {
        Тема.Цвет.фон
      }

      LinearGradient(colors: [.clear, Тема.Цвет.фон.opacity(0.75)],
                     startPoint: .center, endPoint: .bottom)
        .ignoresSafeArea()

      VStack {
        Spacer()
        HStack(alignment: .bottom, spacing: 12) {
          подписьРолика
          Spacer(minLength: 0)
          столбецДействий
        }
        .padding(.horizontal, Тема.Отступ.md)
        // Полоса вкладок перекрывает низ: лента идёт под неё во весь экран.
        // 96 pt — высота полосы плюс домашний индикатор с запасом.
        .padding(.bottom, 96)
      }
    }
    .onAppear {
      лайкнут = template.isLiked ?? false
      лайков = template.likesCount ?? 0
      guard player == nil, let url = URL(string: template.videoUrl) else { return }
      let p = AVPlayer(url: url)
      p.actionAtItemEnd = .none
      p.isMuted = звукВыключен
      // Ролики короткие — зацикливаем, как во всех вертикальных лентах.
      NotificationCenter.default.addObserver(
        forName: .AVPlayerItemDidPlayToEndTime,
        object: p.currentItem, queue: .main
      ) { _ in p.seek(to: .zero); p.play() }
      player = p
      if активен { начатьПоказ(p) }
    }
    .onDisappear { player?.pause() }
    .onChange(of: активен) { _, теперь in
      guard let p = player else { return }
      if теперь { начатьПоказ(p) } else { p.pause() }
    }
    .onChange(of: звукВыключен) { _, теперь in
      player?.isMuted = теперь
      /**
       * Пишем СОСТОЯНИЕ ПЛЕЕРА, а не то, что нажали.
       *
       * С экрана «тихо» и «выключено» неразличимы: иконка показывает
       * намерение, а не факт. Строка ниже — единственное место, где видно,
       * дошло ли намерение до `AVPlayer`; без неё жалобу «нажал, а звука
       * нет» пришлось бы проверять на чужом устройстве наугад.
       */
      NSLog("[Feed] звук: намерение выключить=\(теперь), плеер isMuted=\(player?.isMuted.description ?? "нет плеера")")
    }
  }

  private func начатьПоказ(_ p: AVPlayer) {
    p.isMuted = звукВыключен
    p.play()
    // Просмотр засчитывается при ПОКАЗЕ, как в вебе, а не при досмотре до
    // конца: иначе цифры двух клиентов означали бы разное и сравнивать их
    // было бы нельзя.
    guard !просмотрЗасчитан else { return }
    просмотрЗасчитан = true
    Task { await API.trackView(templateId: template.id) }
  }

  private var подписьРолика: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(template.name)
        .font(.title3.weight(.semibold))
      Text("@\(template.creatorUsername)")
        .font(.subheadline).foregroundStyle(Тема.Цвет.акцент)
      Text(template.description)
        .font(.footnote).foregroundStyle(Тема.Цвет.текстПриглушённый)
        .lineLimit(2)
      HStack(spacing: 16) {
        Label("\(template.viewsCount)", systemImage: "eye")
        Label("\(template.starsCount)", systemImage: "star")
      }
      .font(.caption).foregroundStyle(Тема.Цвет.текстПриглушённый)
    }
    .foregroundStyle(Тема.Цвет.текст)
  }

  /**
   * Правый столбец действий.
   *
   * ЗДЕСЬ РОВНО ТРИ КНОПКИ, И ЭТО НЕ НЕДОДЕЛКА. В вебе их семь, но четыре из
   * них никуда не ведут — проверено живыми запросами к тому же серверу:
   *
   *   • комментарии — `GET/POST /api/feed/1/comments` отвечает 404, слова
   *     «comment» в render-server.ts нет вовсе; в вебе счётчик под иконкой
   *     захардкожен нулём;
   *   • закладка   — `POST /api/feed/1/bookmark` → 404; в вебе это
   *     `atomWithStorage` без единого запроса, то есть список живёт до
   *     первой переустановки и никому, кроме этого браузера, не виден;
   *   • подписка   — `POST /api/users/1/follow` → 404; у самой веб-кнопки
   *     нет даже обработчика, а `followers_count` в ответе профиля —
   *     константа 0 (render-server.ts:6612);
   *   • вкладки «Для вас»/«Подписки» — следствие подписки, и без неё вторая
   *     вкладка может показать только то же самое, что первая.
   *
   * Нарисовать их значило бы соврать пальцу: человек жмёт, ничего не
   * происходит, и он решает, что сломалось приложение. Мёртвая кнопка хуже
   * её отсутствия — она отнимает доверие ко всем остальным.
   *
   * Звезда (⭐) осталась счётчиком слева, а не кнопкой: маршрут
   * `POST /api/feed/:id/star` жив, но отдаёт инвойс Telegram Stars, а платёж
   * закрывается внутри Telegram и подтверждается ботом. Пока этой половины
   * в приложении нет, кнопка открывала бы платёж, который некому завершить.
   */
  private var столбецДействий: some View {
    VStack(spacing: Тема.Отступ.xs) {
      КнопкаДействия(
        значок: лайкнут ? "heart.fill" : "heart",
        подпись: "\(лайков)",
        активна: лайкнут,
        // #e30b5c — FeedPanel.css:495 (`.like-btn.liked`).
        цветАктивной: Тема.Цвет.лайк,
        доступность: лайкнут ? "Убрать лайк" : "Нравится"
      ) {
        Task { await переключитьЛайк() }
      }

      /**
       * Репост — системный лист «Поделиться».
       *
       * `ShareLink` — это и есть `UIActivityViewController`: SwiftUI не рисует
       * свой лист, а показывает системный, со всеми установленными у человека
       * приложениями и с «Скопировать». Делать обёртку над контроллером руками
       * значило бы завести второй путь к тому же самому — и потерять то, что
       * система обновляет сама.
       *
       * Делимся ССЫЛКОЙ НА ВИДЕО, как и веб (`shareVideo(videoUrl…)`,
       * hooks/useShare.ts:44): страницы отдельного ролика в вебе не
       * существует — маршрут `/feed/:id` там не заведён, и такая ссылка вела
       * бы в пустоту.
       */
      if let url = URL(string: template.videoUrl) {
        ShareLink(
          item: url,
          subject: Text(template.name),
          message: Text("«\(template.name)» — @\(template.creatorUsername)")
        ) {
          СодержимоеКнопки(значок: "square.and.arrow.up", подпись: nil,
                           активна: false, цветАктивной: Тема.Цвет.текст)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Поделиться роликом")
      }

      КнопкаДействия(
        значок: звукВыключен ? "speaker.slash.fill" : "speaker.wave.2.fill",
        подпись: nil,
        активна: false,
        цветАктивной: Тема.Цвет.текст,
        доступность: звукВыключен ? "Включить звук" : "Выключить звук"
      ) {
        звукВыключен.toggle()
      }
    }
    // Ширина столбца задана явно: без неё длинное название ролика слева
    // сжимало бы кнопки, и тач-цель уезжала бы ниже 44 pt при первом же
    // длинном заголовке.
    .frame(width: 56)
  }

  @MainActor
  private func переключитьЛайк() async {
    // Двойной тап не должен слать два запроса: сервер — переключатель, и
    // вторая отправка вернула бы лайк обратно.
    guard !лайкВПути else { return }
    лайкВПути = true
    defer { лайкВПути = false }

    let было = (лайкнут, лайков)
    // Оптимистично: палец получает ответ сразу, как в вебе.
    лайкнут.toggle()
    лайков = max(0, лайков + (лайкнут ? 1 : -1))
    do {
      let итог = try await API.like(templateId: template.id)
      // Верим СЕРВЕРУ, а не своей догадке: он считает лайки по таблице.
      лайкнут = итог.liked
      лайков = итог.count
    } catch {
      (лайкнут, лайков) = было
      сообщить(error.localizedDescription)
    }
  }
}

/**
 * Кнопка правого столбца.
 *
 * ТАЧ-ЦЕЛЬ ЗАДАНА ЯВНО, И ЭТО ГЛАВНОЕ ЗДЕСЬ. В этом репозитории девять
 * контролов уже измерили 28 pt: высоту им задавали одним `padding` вокруг
 * иконки, а иконка при мелком шрифте оказывалась меньше, чем думал автор.
 * Отступ — не размер: он зависит от того, что внутри. `frame` — размер.
 *
 * 52 pt на сторону против минимума Apple в 44 pt: запас на то, что палец
 * попадает по краю движущегося списка.
 */
private struct КнопкаДействия: View {
  let значок: String
  let подпись: String?
  let активна: Bool
  let цветАктивной: Color
  let доступность: String
  let действие: () -> Void

  var body: some View {
    Button(action: действие) {
      СодержимоеКнопки(значок: значок, подпись: подпись,
                       активна: активна, цветАктивной: цветАктивной)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(доступность)
  }
}

/// Внутренность кнопки отдельно от неё: `ShareLink` — сам себе кнопка, и
/// вложить его в `Button` нельзя, а выглядеть он обязан так же.
private struct СодержимоеКнопки: View {
  let значок: String
  let подпись: String?
  let активна: Bool
  let цветАктивной: Color

  var body: some View {
    VStack(spacing: Тема.ТабБар.просветИконкаПодпись) {
      Image(systemName: значок)
        .font(.system(size: Тема.БезИсточника.кегльИконокЛенты, weight: .semibold))
        .foregroundStyle(активна ? цветАктивной : Тема.Цвет.текст)
        // Тень — не украшение: белая иконка на светлом кадре иначе исчезает.
        .shadow(color: Тема.Цвет.фон.opacity(0.5), radius: 3, y: 1)
        .frame(width: 52, height: 52)
      if let подпись {
        Text(подпись)
          .font(.caption2.weight(.semibold))
          .foregroundStyle(Тема.Цвет.текст)
          .shadow(color: Тема.Цвет.фон.opacity(0.5), radius: 3, y: 1)
      }
    }
    // Без этого нажатие ловится только по самим пикселям глифа, а не по
    // отведённому под кнопку прямоугольнику: цель снова оказывается меньше
    // заявленной.
    .contentShape(Rectangle())
  }
}

/// Видео во весь экран, без контролов.
///
/// `VideoPlayer` из SwiftUI показывает системные контролы и вписывает кадр
/// целиком — по краям остаются поля. В вертикальной ленте нужно обратное:
/// кадр заполняет экран, обрезаясь по длинной стороне, и ничего не мешает
/// смотреть. Это ровно то, ради чего слой берётся напрямую: `resizeAspectFill`
/// у `AVPlayerLayer` — то самое поведение, которое в вебе изображают через
/// `object-fit: cover`, только без промежуточного слоя.
struct PlayerLayerView: UIViewRepresentable {
  let player: AVPlayer

  func makeUIView(context: Context) -> PlayerHostView {
    let v = PlayerHostView()
    v.playerLayer.player = player
    v.playerLayer.videoGravity = .resizeAspectFill
    v.backgroundColor = UIColor(Тема.Цвет.фон)
    return v
  }

  func updateUIView(_ v: PlayerHostView, context: Context) {
    if v.playerLayer.player !== player { v.playerLayer.player = player }
  }
}

/// Слой обязан быть слоем самого view: иначе он не растягивается за ним и
/// при повороте или смене размера остаётся прежнего размера.
final class PlayerHostView: UIView {
  override static var layerClass: AnyClass { AVPlayerLayer.self }
  var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}
