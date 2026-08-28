import SwiftUI

/**
 * СВОЙСТВА КЛИПА — НАТИВНО.
 *
 * Это вторая половина этапа А. Таймлайн отвечает на вопрос «когда», свойства
 * — на вопрос «как выглядит»: положение, размер, поворот, прозрачность.
 *
 * Почему их стоит забрать у веба раньше холста. Свойства — это НЕПРЕРЫВНЫЕ
 * величины, а непрерывное в вебе редактируют полями ввода: попал в поле,
 * стёр, набрал число, увидел результат. Нативно то же самое делается
 * протаскиванием по цифре — значение меняется под пальцем, и кадр меняется
 * вместе с ним. Разница не в красоте, а в числе попыток: подобрать поворот
 * на глаз за один жест против десяти циклов «набрал — посмотрел».
 *
 * Модель та же `Composition`. Двух источников правды нет: то, что человек
 * покрутил здесь, немедленно видно на таймлайне и уедет в рендер.
 */
struct PropertiesView: View {
  @Binding var composition: Composition
  /// id выбранного клипа. nil — ничего не выбрано, и это нормальное состояние.
  @Binding var выбран: String?

  var body: some View {
    Group {
      if let clip = связьСВыбранным() {
        содержимое(clip)
      } else {
        подсказкаПустоты
      }
    }
    .background(Тема.Цвет.фон)
  }

  /**
   * Binding на выбранный клип ВНУТРИ композиции.
   *
   * Не копия: копию пришлось бы возвращать обратно вручную, и любой
   * пропущенный путь давал бы молча потерянную правку — ровно тот класс
   * ошибок, что уже ловился в этом проекте.
   */
  private func связьСВыбранным() -> Binding<Clip>? {
    guard let id = выбран else { return nil }
    for tIdx in composition.tracks.indices {
      if let cIdx = composition.tracks[tIdx].items.firstIndex(where: { $0.id == id }) {
        return $composition.tracks[tIdx].items[cIdx]
      }
    }
    return nil
  }

  private var подсказкаПустоты: some View {
    VStack(spacing: Тема.Отступ.sm) {
      Image(systemName: "hand.tap")
        .font(.title2)
        .foregroundStyle(Тема.Цвет.текстПриглушённый)
      Text("Выберите клип на таймлайне")
        .font(.footnote)
        .foregroundStyle(Тема.Цвет.текстПриглушённый)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private func содержимое(_ clip: Binding<Clip>) -> some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        Text(clip.wrappedValue.name ?? "Клип")
          .font(.headline)
          .foregroundStyle(Тема.Цвет.текст)

        группа("Положение") {
          крутилка("X", value: clip.x, шаг: 1, диапазон: -4000...4000, единица: "px")
          крутилка("Y", value: clip.y, шаг: 1, диапазон: -4000...4000, единица: "px")
        }

        группа("Размер") {
          крутилка("Ширина", value: clip.width, шаг: 1, диапазон: 1...8000, единица: "px")
          крутилка("Высота", value: clip.height, шаг: 1, диапазон: 1...8000, единица: "px")
        }

        группа("Вид") {
          крутилка("Поворот", value: clip.rotation, шаг: 0.5, диапазон: -360...360, единица: "°")
          ползунок("Прозрачность", value: clip.opacity)
        }

        группа("Время") {
          целое("Начало", value: clip.startFrame, диапазон: 0...100_000)
          целое("Длительность", value: clip.durationInFrames, диапазон: 1...100_000)
        }
      }
      .padding(Тема.Отступ.md)
    }
  }

  private func группа<C: View>(_ title: String, @ViewBuilder _ c: () -> C) -> some View {
    VStack(alignment: .leading, spacing: Тема.Отступ.карточкаЛенты) {
      Text(title.uppercased())
        .font(.system(size: Тема.Кегль.xs, weight: .semibold))
        .tracking(0.8)
        .foregroundStyle(Тема.Цвет.текстПриглушённый)
      c()
    }
  }

  // MARK: - Управляющие элементы

  /**
   * Число, которое ТАЩАТ, а не набирают.
   *
   * Горизонтальное протаскивание по строке меняет значение; чувствительность
   * привязана к шагу, поэтому поворот в градусах и координата в пикселях
   * ведут себя одинаково предсказуемо. Поле ввода оставлено рядом — когда
   * нужно точное число, набрать его быстрее, чем подкрадываться жестом.
   */
  private func крутилка(
    _ label: String, value: Binding<Double>, шаг: Double,
    диапазон: ClosedRange<Double>, единица: String
  ) -> some View {
    HStack {
      Text(label)
        .font(.footnote)
        .foregroundStyle(Тема.Цвет.текстПриглушённый)
        .frame(width: 84, alignment: .leading)

      Spacer()

      HStack(spacing: 2) {
        Text(value.wrappedValue.formatted(.number.precision(.fractionLength(0...1))))
          .monospacedDigit()
        Text(единица).foregroundStyle(Тема.Цвет.текстПриглушённый)
      }
      .font(.system(.footnote, design: .monospaced))
      .foregroundStyle(Тема.Цвет.текст)
      .padding(.horizontal, Тема.Отступ.карточкаЛенты)
      .padding(.vertical, 7)
      .background(Тема.Цвет.поверхность, in: RoundedRectangle(cornerRadius: Тема.Радиус.md))
      .contentShape(Rectangle())
      .gesture(
        DragGesture(minimumDistance: 2)
          .onChanged { g in
            let шагов = (g.translation.width / 4).rounded()
            let новое = value.wrappedValue + шагов * шаг
            value.wrappedValue = min(max(новое, диапазон.lowerBound), диапазон.upperBound)
          }
      )
    }
  }

  private func ползунок(_ label: String, value: Binding<Double>) -> some View {
    VStack(alignment: .leading, spacing: Тема.Отступ.xs) {
      HStack {
        Text(label)
          .font(.footnote)
          .foregroundStyle(Тема.Цвет.текстПриглушённый)
        Spacer()
        Text("\(Int(value.wrappedValue * 100))%")
          .font(.system(.caption, design: .monospaced))
          .monospacedDigit()
          .foregroundStyle(Тема.Цвет.текст)
      }
      Slider(value: value, in: 0...1)
        .tint(Тема.Цвет.акцент)
    }
  }

  private func целое(_ label: String, value: Binding<Int>, диапазон: ClosedRange<Int>) -> some View {
    HStack {
      Text(label)
        .font(.footnote)
        .foregroundStyle(Тема.Цвет.текстПриглушённый)
        .frame(width: 84, alignment: .leading)
      Spacer()
      Stepper(
        value: Binding(
          get: { value.wrappedValue },
          set: { value.wrappedValue = min(max($0, диапазон.lowerBound), диапазон.upperBound) }
        ),
        in: диапазон
      ) {
        Text("\(value.wrappedValue)")
          .font(.system(.footnote, design: .monospaced))
          .monospacedDigit()
          .foregroundStyle(Тема.Цвет.текст)
      }
      .labelsHidden()
      .overlay(alignment: .leading) {
        Text("\(value.wrappedValue) кадр")
          .font(.system(.footnote, design: .monospaced))
          .monospacedDigit()
          .foregroundStyle(Тема.Цвет.текст)
          .offset(x: -78)
      }
    }
  }
}
