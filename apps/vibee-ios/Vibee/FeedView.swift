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

  var body: some View {
    ZStack {
      Color.black.ignoresSafeArea()

      if грузим {
        ProgressView().tint(.green)
      } else if let ошибка {
        // Отказ показываем словами. Пустой экран вместо объяснения —
        // ровно та ошибка, которую весь вчерашний день чинил в вебе.
        VStack(spacing: 10) {
          Image(systemName: "wifi.exclamationmark").font(.largeTitle)
          Text("Лента не загрузилась").font(.headline)
          Text(ошибка).font(.footnote).foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
          Button("Ещё раз") { Task { await загрузить() } }
            .buttonStyle(.borderedProminent).tint(.green)
        }
        .padding(32)
      } else if items.isEmpty {
        Text("В ленте пока пусто").foregroundStyle(.secondary)
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
                ReelView(template: t)
                  .frame(width: geo.size.width, height: geo.size.height)
              }
            }
            .scrollTargetLayout()
          }
          .scrollTargetBehavior(.paging)
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
    }
    .task { await загрузить() }
  }

  private func загрузить() async {
    грузим = true; ошибка = nil
    do { items = try await API.feed() } catch { ошибка = error.localizedDescription }
    грузим = false
  }
}

/// Один ролик: видео на весь экран, поверх — автор, заголовок и счётчики.
struct ReelView: View {
  let template: API.Template
  @State private var player: AVPlayer?

  var body: some View {
    ZStack(alignment: .bottomLeading) {
      if let player {
        PlayerLayerView(player: player)
          .ignoresSafeArea()
          .onAppear {
            player.play()
            // Просмотр засчитывается при ПОКАЗЕ, как в вебе, а не при
            // досмотре до конца: иначе цифры двух клиентов означали бы
            // разное и сравнивать их было бы нельзя.
            Task { await API.trackView(templateId: template.id) }
          }
          .onDisappear { player.pause() }
      } else {
        Color.black
      }

      LinearGradient(colors: [.clear, .black.opacity(0.75)],
                     startPoint: .center, endPoint: .bottom)
        .ignoresSafeArea()

      VStack(alignment: .leading, spacing: 6) {
        Text(template.name)
          .font(.title3.weight(.semibold))
        Text("@\(template.creatorUsername)")
          .font(.subheadline).foregroundStyle(.green)
        Text(template.description)
          .font(.footnote).foregroundStyle(.white.opacity(0.75))
          .lineLimit(2)
        HStack(spacing: 16) {
          Label("\(template.viewsCount)", systemImage: "eye")
          Label("\(template.starsCount)", systemImage: "star")
        }
        .font(.caption).foregroundStyle(.white.opacity(0.6))
      }
      .foregroundStyle(.white)
      .padding(20)
      // Полоса вкладок перекрывает низ: лента идёт под неё во весь экран.
      // 96 pt — высота полосы плюс домашний индикатор с запасом.
      .padding(.bottom, 96)
    }
    .onAppear {
      guard player == nil, let url = URL(string: template.videoUrl) else { return }
      let p = AVPlayer(url: url)
      p.actionAtItemEnd = .none
      // Ролики короткие — зацикливаем, как во всех вертикальных лентах.
      NotificationCenter.default.addObserver(
        forName: .AVPlayerItemDidPlayToEndTime,
        object: p.currentItem, queue: .main
      ) { _ in p.seek(to: .zero); p.play() }
      player = p
    }
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
    v.backgroundColor = .black
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
