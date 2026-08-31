import SwiftUI

/**
 * Модели KieAI на устройстве: что можно запустить прямо сейчас, а что нет.
 *
 * ЗАЧЕМ СПИСОК ЛЕЖИТ В ПРИЛОЖЕНИИ, А НЕ ТОЛЬКО НА СЕРВЕРЕ. Человек должен
 * видеть выбор ДО того, как нажмёт и получит отказ. Экран, показывающий все
 * модели одинаково, а потом отвечающий «недоступно», тратит чужое время и
 * выглядит поломкой; экран, скрывающий приостановленные, лжёт умолчанием —
 * человек решит, что Sora у нас нет вовсе.
 *
 * Поэтому приостановленные ПОКАЗАНЫ и помечены, а нажать нельзя.
 *
 * КАК ПОЛУЧЕН СПИСОК — и почему это не стоило ни одного кредита. KieAI
 * проверяет запрос до создания задания, поэтому намеренно неполное тело
 * получает смысловой ответ и до списания не доходит. Три ответа различают
 * три состояния:
 *
 *     «model name ... is not supported»  — имени нет
 *     «<поле> is required»               — имя ЕСТЬ, и назван контракт
 *     «This interface is temporarily paused» — есть, выключено у провайдера
 *
 * Тот же перебор гоняется тестом на сервере и тоже ничего не тратит.
 */
enum МодельKie: String, CaseIterable, Identifiable {
  case липсинк = "veed/fabric-1"
  case картинка = "google/nano-banana"
  case правкаКартинки = "google/nano-banana-edit"
  case imagen4 = "google/imagen4"
  case правкаQwen = "qwen/image-edit"
  case sora = "sora-2-text-to-video"
  case soraPro = "sora-2-pro-text-to-video"
  case soraИзКартинки = "sora-2-image-to-video"

  var id: String { rawValue }

  /// Состояние, установленное замером, а не предположением.
  enum Состояние { case живая, приостановлена }

  var состояние: Состояние {
    switch self {
    case .sora, .soraPro, .soraИзКартинки: return .приостановлена
    default: return .живая
    }
  }

  var название: String {
    switch self {
    case .липсинк: return "Липсинк по фото"
    case .картинка: return "Картинка по описанию"
    case .правкаКартинки: return "Правка картинки"
    case .imagen4: return "Imagen 4"
    case .правкаQwen: return "Правка (Qwen)"
    case .sora: return "Sora 2 — видео"
    case .soraPro: return "Sora 2 Pro — видео"
    case .soraИзКартинки: return "Sora 2 — из картинки"
    }
  }

  /// Что модель требует на вход — словами самого API.
  var требует: String {
    switch self {
    case .липсинк: return "фото"
    case .правкаКартинки, .правкаQwen: return "картинку и описание"
    case .картинка, .imagen4: return "описание"
    case .sora, .soraPro, .soraИзКартинки: return "—"
    }
  }

  /**
   * Почему нельзя нажать. `nil` — можно.
   *
   * Причина названа ЧУЖОЙ стороной намеренно: «приостановлена у провайдера»
   * говорит человеку, что ждать, а не чинить, и что дело не в его аккаунте.
   */
  var почемуНельзя: String? {
    состояние == .приостановлена
      ? "Приостановлена у провайдера — не в вашем аккаунте. Появится сама."
      : nil
  }
}

/// Строка выбора модели: живые нажимаются, приостановленные видны и объяснены.
struct СтрокаМоделиKie: View {
  let модель: МодельKie
  let выбрана: Bool
  let нажать: () -> Void

  var body: some View {
    Button(action: нажать) {
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 3) {
          Text(модель.название)
            .font(Тема.Шрифт.стиль(.subheadline))
            .foregroundStyle(
              модель.почемуНельзя == nil
                ? Тема.Цвет.текст
                : Тема.Цвет.текстПриглушённый
            )

          if let причина = модель.почемуНельзя {
            Text(причина)
              .font(Тема.Шрифт.стиль(.caption))
              .foregroundStyle(Тема.Цвет.предупреждение)
              .fixedSize(horizontal: false, vertical: true)
          } else {
            Text("нужно: \(модель.требует)")
              .font(Тема.Шрифт.стиль(.caption))
              .foregroundStyle(Тема.Цвет.текстПриглушённый)
          }
        }

        Spacer(minLength: 8)

        if выбрана && модель.почемуНельзя == nil {
          Image(systemName: "checkmark")
            .foregroundStyle(Тема.Цвет.акцент)
        }
      }
      .padding(.vertical, 10)
      .padding(.horizontal, 14)
      // 44pt — минимальная цель касания в Human Interface Guidelines. Строка
      // с двумя мелкими подписями легко выходит ниже, если не задать явно.
      .frame(minHeight: 44)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        // Акцент ЭТОГО экрана, а не profile-палитра: заливкаСлабая живёт в
        // Тема.Профиль и тонирована золотом, которое здесь чужое.
        выбрана ? Тема.Цвет.акцент.opacity(0.08) : Color.clear,
        in: RoundedRectangle(cornerRadius: 10)
      )
    }
    .buttonStyle(.plain)
    .disabled(модель.почемуНельзя != nil)
  }
}
