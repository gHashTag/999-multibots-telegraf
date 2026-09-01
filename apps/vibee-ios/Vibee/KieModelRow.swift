import SwiftUI

/// Строка выбора: живые нажимаются, приостановленные видны и объяснены.
struct СтрокаМоделиKie: View {
  let модель: Модель
  let выбрана: Bool
  let нажать: () -> Void

  var body: some View {
    Button(action: нажать) {
      HStack(spacing: 12) {
        VStack(alignment: .leading, spacing: 3) {
          Text(модель.название)
            .font(Тема.Шрифт.стиль(.subheadline))
            .foregroundStyle(модель.живая ? Тема.Цвет.текст : Тема.Цвет.текстПриглушённый)

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

        // Цена справа: человек решает «стоит ли», а не «что это». Молчание
        // здесь означало, что цену узнают уже по списанию.
        if let ценник = модель.ценник {
          Text(ценник)
            .font(Тема.Шрифт.стиль(.caption))
            .foregroundStyle(Тема.Цвет.текстПриглушённый)
            .multilineTextAlignment(.trailing)
            .fixedSize(horizontal: false, vertical: true)
        } else if модель.живая {
          // Не молчим и об отсутствии: «—» честнее пустоты, из которой
          // человек заключит, что бесплатно.
          Text("цену не назвали")
            .font(Тема.Шрифт.стиль(.caption))
            .foregroundStyle(Тема.Цвет.текстПриглушённый.opacity(0.7))
        }

        if выбрана && модель.живая {
          Image(systemName: "checkmark").foregroundStyle(Тема.Цвет.акцент)
        }
      }
      .padding(.vertical, 10)
      .padding(.horizontal, 14)
      // 44pt — минимальная цель касания в HIG; две мелкие подписи дают меньше.
      .frame(minHeight: 44)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        выбрана ? Тема.Цвет.акцент.opacity(0.08) : Color.clear,
        in: RoundedRectangle(cornerRadius: 10)
      )
    }
    .buttonStyle(.plain)
    .disabled(!модель.живая)
    // Опознаватель НА КНОПКЕ, а не на обёртке снаружи: XCUITest находил
    // внешний контейнер, его тап не доходил до Button, и тест падал ровно
    // так же, как падали мои ручные тапы по координатам.
    .accessibilityIdentifier("ии.модель.\(модель.id)")
  }
}
