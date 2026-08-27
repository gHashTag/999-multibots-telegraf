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
      .background(Color.black)
    }
    .gesture(щипок)
  }

  private var ширинаЛинейки: CGFloat {
    max(CGFloat(composition.durationInFrames) * scale, 320)
  }

  // MARK: - Панель

  private var панельИнструментов: some View {
    HStack(spacing: 14) {
      Text(таймкод(currentFrame))
        .font(.system(.footnote, design: .monospaced))
        // Моноширинные цифры: без них таймкод дёргается на каждом кадре,
        // потому что «1» уже «8», и глазу кажется, что прыгает вся панель.
        .monospacedDigit()
        .foregroundStyle(.white)

      Spacer()

      Text("\(composition.tracks.count) дорожек · \(composition.durationInFrames) кадров")
        .font(.caption2)
        .foregroundStyle(.white.opacity(0.5))
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 10)
    .background(.ultraThinMaterial)
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
    VStack(alignment: .leading, spacing: 2) {
      ForEach($composition.tracks) { $track in
        HStack(spacing: 0) {
          заголовок(track)
          ZStack(alignment: .leading) {
            Rectangle()
              .fill(Color.white.opacity(0.03))
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
    HStack(spacing: 6) {
      Image(systemName: значок(track.type))
        .font(.caption)
        .foregroundStyle(цвет(track.type))
      Text(track.name)
        .font(.caption2)
        .lineLimit(1)
        .foregroundStyle(.white.opacity(track.visible ? 0.85 : 0.35))
    }
    .padding(.horizontal, 8)
    .frame(width: ширинаЗаголовка, height: высотаДорожки, alignment: .leading)
    .background(Color.white.opacity(0.05))
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
    case "video": return Color(red: 0.29, green: 0.87, blue: 0.50)
    case "audio": return Color(red: 0.98, green: 0.75, blue: 0.24)
    case "image": return Color(red: 0.45, green: 0.71, blue: 0.98)
    case "text": return Color(red: 0.85, green: 0.60, blue: 0.98)
    default: return Color(white: 0.7)
    }
  }

  // MARK: - Клип

  private func клип(_ clip: Binding<Clip>, дорожкаЗаперта: Bool) -> some View {
    let c = clip.wrappedValue
    let тип = composition.tracks.first { $0.id == c.trackId }?.type ?? "video"

    return RoundedRectangle(cornerRadius: 6)
      .fill(цвет(тип))
      .frame(width: max(CGFloat(c.durationInFrames) * scale, 12),
             height: высотаДорожки - 8)
      .overlay(alignment: .leading) {
        Text(c.name ?? тип)
          .font(.system(size: 10, weight: .semibold))
          /**
           * Подпись ТЁМНАЯ. Заливка дорожек светлая и насыщенная — белый
           * текст на ней даёт около 1.8:1 при минимуме 4.5:1 по WCAG. Ровно
           * этот дефект только что чинился в веб-редакторе; переносить его
           * в нативный незачем.
           *
           * Не чистый чёрный, а почти-чёрный с тёплым уклоном: чистый на
           * насыщенной заливке выглядит дырой.
           */
          .foregroundStyle(Color(red: 0.08, green: 0.07, blue: 0.06))
          .lineLimit(1)
          .padding(.horizontal, 7)
      }
      .overlay {
        // Обводка выбранного: белая, а не цветная — цвет уже занят типом
        // дорожки, и вторая цветная рамка спорила бы с ним за смысл.
        RoundedRectangle(cornerRadius: 6)
          .strokeBorder(.white, lineWidth: выбран == c.id ? 2 : 0)
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
      .fill(Color(red: 1, green: 0.24, blue: 0.35))
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
