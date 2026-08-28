import SwiftUI

/**
 * ЭТАП А: нативный таймлайн поверх общей модели композиции.
 *
 * Почему именно он первым. Таймлайн — единственная часть редактора, где веб
 * проигрывает не по мелочи, а по существу: перетаскивание клипа в DOM
 * пересчитывает раскладку на каждом кадре, и на длинном проекте это видно
 * рукой. Жест на UIKit идёт по 120 Гц и не спрашивает раскладку ни у кого.
 *
 * Всё, что здесь рисуется, приходит из `Composition` — той же модели, что
 * кормит `avComposition()` (этап Б) и `remotionJSON()` (этапы А и В).
 * Второй копии данных нет, поэтому таймлайн не может показать одно, а
 * рендер собрать другое.
 */
struct TimelineView: View {
  @Binding var composition: Composition
  /// Текущий кадр — общий с предпросмотром, поэтому Binding, а не State.
  @Binding var currentFrame: Int
  /// Выбранный клип — его свойства редактируются рядом, нативно.
  @Binding var выбран: String?

  /// Пикселей на кадр. Меняется щипком; за пределами — каша или пустота.
  @State private var scale: Double = 4
  @State private var scaleПриНачалеЩипка: Double = 4
  @State private var тащим: (clip: String, откуда: Int)?

  private let высотаДорожки: CGFloat = 56
  private let ширинаЗаголовка: CGFloat = 92
  private static let пределыМасштаба: ClosedRange<Double> = 0.5...40

  var body: some View {
    VStack(spacing: 0) {
      панельИнструментов
      ScrollView([.horizontal, .vertical]) {
        ZStack(alignment: .topLeading) {
          дорожки
          указательКадра
        }
        .frame(minWidth: ширинаЗаголовка + ширинаЛинейки)
      }
      .background(Тема.Цвет.фон)
    }
    .gesture(щипок)
  }

  private var ширинаЛинейки: CGFloat {
    max(CGFloat(composition.durationInFrames) * scale, 320)
  }

  // MARK: - Панель

  private var панельИнструментов: some View {
    HStack(spacing: Тема.Отступ.пузырьЧата) {
      Text(таймкод(currentFrame))
        .font(Тема.Шрифт.моно(.footnote))
        // Моноширинные цифры: без них таймкод дёргается на каждом кадре,
        // потому что «1» уже «8», и глазу кажется, что прыгает вся панель.
        .monospacedDigit()
        .foregroundStyle(Тема.Цвет.текст)

      Spacer()

      Text("\(composition.tracks.count) дорожек · \(composition.durationInFrames) кадров")
        .font(Тема.Шрифт.стиль(.caption2))
        .foregroundStyle(Тема.Цвет.текстПриглушённый)
    }
    .padding(.horizontal, Тема.Отступ.пузырьЧата)
    .padding(.vertical, Тема.Отступ.карточкаЛенты)
    // Непрозрачная поверхность #1a1a1a, а не материал: в вебе панель
    // задана `--panel-bg: var(--bg-elevated)` (design-system.css:130),
    // то есть сплошным цветом. Размытие там объявлено, но бесполезно —
    // фон под ним непрозрачный (TelegramTabBar.css:24).
    .background(Тема.Цвет.поверхность)
  }

  private func таймкод(_ frame: Int) -> String {
    let fps = max(composition.fps, 1)
    let всего = Double(frame) / Double(fps)
    let м = Int(всего) / 60
    let с = Int(всего) % 60
    let к = frame % fps
    return String(format: "%02d:%02d.%02d", м, с, к)
  }

  // MARK: - Дорожки

  private var дорожки: some View {
    VStack(alignment: .leading, spacing: Тема.ТабБар.просветИконкаПодпись) {
      ForEach($composition.tracks) { $track in
        HStack(spacing: 0) {
          заголовок(track)
          ZStack(alignment: .leading) {
            Rectangle()
              .fill(Тема.Цвет.поверхность)
              .frame(width: ширинаЛинейки, height: высотаДорожки)
            ForEach($track.items) { $clip in
              клип($clip, дорожкаЗаперта: track.locked)
            }
          }
        }
      }
    }
  }

  private func заголовок(_ track: Track) -> some View {
    HStack(spacing: Тема.Отступ.вкладка) {
      Image(systemName: значок(track.type))
        .font(Тема.Шрифт.стиль(.caption))
        .foregroundStyle(цвет(track.type))
      Text(track.name)
        .font(Тема.Шрифт.стиль(.caption2))
        .lineLimit(1)
        .foregroundStyle(track.visible ? Тема.Цвет.текст : Тема.Цвет.текстПриглушённый)
    }
    .padding(.horizontal, Тема.Отступ.sm)
    .frame(width: ширинаЗаголовка, height: высотаДорожки, alignment: .leading)
    .background(Тема.Цвет.карточка)
  }

  private func значок(_ type: String) -> String {
    switch type {
    case "video": return "film"
    case "audio": return "waveform"
    case "image": return "photo"
    case "text": return "textformat"
    case "avatar": return "person.crop.square"
    default: return "square.on.square"
    }
  }

  private func цвет(_ type: String) -> Color {
    switch type {
    case "video": return Тема.БезИсточника.дорожкаВидео
    case "audio": return Тема.БезИсточника.дорожкаЗвук
    case "image": return Тема.БезИсточника.дорожкаКартинка
    case "text": return Тема.БезИсточника.дорожкаТекст
    default: return Тема.БезИсточника.дорожкаПрочее
    }
  }

  // MARK: - Клип

  private func клип(_ clip: Binding<Clip>, дорожкаЗаперта: Bool) -> some View {
    let c = clip.wrappedValue
    let тип = composition.tracks.first { $0.id == c.trackId }?.type ?? "video"

    return RoundedRectangle(cornerRadius: Тема.Радиус.md)
      .fill(цвет(тип))
      .frame(width: max(CGFloat(c.durationInFrames) * scale, 12),
             height: высотаДорожки - Тема.Отступ.sm)
      .overlay(alignment: .leading) {
        Text(c.name ?? тип)
          .font(Тема.Шрифт.кегль(Тема.Кегль.xs, .semibold, относительно: .caption2))
          /**
           * Подпись ТЁМНАЯ. Заливка дорожек светлая и насыщенная — белый
           * текст на ней даёт около 1.8:1 при минимуме 4.5:1 по WCAG. Ровно
           * этот дефект только что чинился в веб-редакторе; переносить его
           * в нативный незачем.
           *
           * Не чистый чёрный, а почти-чёрный с тёплым уклоном: чистый на
           * насыщенной заливке выглядит дырой.
           */
          .foregroundStyle(Тема.БезИсточника.текстНаКлипе)
          .lineLimit(1)
          .padding(.horizontal, 7)
      }
      .overlay {
        // Обводка выбранного: белая, а не цветная — цвет уже занят типом
        // дорожки, и вторая цветная рамка спорила бы с ним за смысл.
        RoundedRectangle(cornerRadius: Тема.Радиус.md)
          .strokeBorder(Тема.Цвет.текст, lineWidth: выбран == c.id ? 2 : 0)
      }
      .opacity(дорожкаЗаперта ? 0.45 : 1)
      .offset(x: CGFloat(c.startFrame) * scale)
      .onTapGesture { выбран = c.id }
      .gesture(дорожкаЗаперта ? nil : перетаскивание(clip))
  }

  /**
   * Перетаскивание с прилипанием.
   *
   * Прилипаем к нулю, к границам соседних клипов и к текущему кадру —
   * то есть к тем местам, куда человек и целится. Порог задан в ПИКСЕЛЯХ, а
   * не в кадрах: при щипке масштаб меняется в 80 раз, и порог в кадрах на
   * мелком масштабе притягивал бы всё подряд, а на крупном — ничего.
   */
  private func перетаскивание(_ clip: Binding<Clip>) -> some Gesture {
    DragGesture(minimumDistance: 3)
      .onChanged { g in
        if тащим?.clip != clip.wrappedValue.id {
          тащим = (clip.wrappedValue.id, clip.wrappedValue.startFrame)
        }
        guard let начало = тащим?.откуда else { return }
        let сдвиг = Int((g.translation.width / scale).rounded())
        clip.wrappedValue.startFrame = max(0, прилипнуть(начало + сдвиг, себя: clip.wrappedValue.id))
      }
      .onEnded { _ in тащим = nil }
  }

  private func прилипнуть(_ frame: Int, себя: String) -> Int {
    let порогКадров = Int((10 / scale).rounded())
    guard порогКадров >= 0 else { return frame }

    var цели: [Int] = [0, currentFrame]
    for track in composition.tracks {
      for c in track.items where c.id != себя {
        цели.append(c.startFrame)
        цели.append(c.startFrame + c.durationInFrames)
      }
    }
    let ближайшая = цели.min { abs($0 - frame) < abs($1 - frame) }
    if let ближайшая, abs(ближайшая - frame) <= порогКадров { return ближайшая }
    return frame
  }

  // MARK: - Указатель кадра

  private var указательКадра: some View {
    Rectangle()
      .fill(Тема.Цвет.указательКадра)
      .frame(width: 2)
      .frame(maxHeight: .infinity)
      .offset(x: ширинаЗаголовка + CGFloat(currentFrame) * scale)
      .allowsHitTesting(false)
  }

  // MARK: - Масштаб

  private var щипок: some Gesture {
    MagnificationGesture()
      .onChanged { m in
        // Считаем от масштаба НА НАЧАЛО жеста, а не от текущего: иначе
        // множитель применяется к уже умноженному, и зум убегает по
        // экспоненте с каждым кадром жеста.
        scale = min(max(scaleПриНачалеЩипка * m, Self.пределыМасштаба.lowerBound),
                    Self.пределыМасштаба.upperBound)
      }
      .onEnded { _ in scaleПриНачалеЩипка = scale }
  }
}
