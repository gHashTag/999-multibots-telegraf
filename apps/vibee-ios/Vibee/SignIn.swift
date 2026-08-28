import SwiftUI

/**
 * Вход по коду из мини-аппа.
 *
 * ЧТО ЗАМЕНИЛО. Здесь было поле «ключ агента» — длинная строка, которую
 * человек добывал сам и вбивал руками. Это работало ровно один раз и только у
 * того, кто знает, где ключ взять; для всех остальных приложение молча
 * отвечало 401, а агент показывал пустой пузырь.
 *
 * ПОЧЕМУ ШЕСТЬ ЦИФР — ЛУЧШЕЕ, ЧТО ЗДЕСЬ МОЖНО. У приложения нет и не будет
 * подписи Telegram: оно не внутри Telegram. Значит личность обязана прийти с
 * той стороны, где подпись есть. Из трёх способов её перенести —
 *
 *   ссылка   `vibee://…?rt=` — токен оседает в логах и в буфере обмена;
 *   QR-код   — требует второго устройства, а чаще всего оно одно и то же;
 *   код      — проходит через глаза и не оставляет копии нигде,
 *
 * последний единственный не создаёт следа. Так же входят на телевизорах, и
 * ровно по этой причине.
 */
struct SignInView: View {
  /// Зовётся после успешного входа: Профиль перерисовывает себя.
  var вошли: () -> Void

  @State private var код = ""
  @State private var идёт = false
  @State private var ошибка: String?

  @FocusState private var вФокусе: Bool

  private var цифры: String { код.filter(\.isNumber) }
  private var готов: Bool { цифры.count == 6 && !идёт }

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      Text("Откройте бота в Telegram и нажмите «Войти в приложение». "
           + "Он покажет код из шести цифр — введите его здесь.")
        .font(.callout)
        .foregroundStyle(.white.opacity(0.65))
        .fixedSize(horizontal: false, vertical: true)

      /**
       * Одно поле, а не шесть клеток.
       *
       * Шесть отдельных клеток выглядят нарядно и ломают три вещи разом:
       * вставку кода целиком, автозаполнение из сообщения и VoiceOver, который
       * читает их как шесть несвязанных полей. `.oneTimeCode` даёт системную
       * подсказку над клавиатурой — это и есть нативность, ради которой всё.
       */
      TextField("000000", text: $код)
        .keyboardType(.numberPad)
        .textContentType(.oneTimeCode)
        .font(.system(size: 34, weight: .semibold, design: .monospaced))
        .kerning(8)
        .multilineTextAlignment(.center)
        .focused($вФокусе)
        .padding(.vertical, 10)
        .background(.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 12))
        .onChange(of: код) { _, новое in
          // Обрезаем на вводе, а не на отправке: поле, принимающее седьмую
          // цифру и молча её теряющее, выглядит сломанным.
          let только = новое.filter(\.isNumber)
          if только != новое || только.count > 6 { код = String(только.prefix(6)) }
          if ошибка != nil { ошибка = nil }
        }
        .accessibilityLabel("Код из шести цифр")

      if let ошибка {
        Label(ошибка, systemImage: "exclamationmark.triangle.fill")
          .font(.footnote)
          .foregroundStyle(.orange)
          .fixedSize(horizontal: false, vertical: true)
      }

      Button {
        Task { await войти() }
      } label: {
        HStack(spacing: 8) {
          if идёт { ProgressView().tint(.black) }
          Text(идёт ? "Проверяем…" : "Войти")
        }
        .frame(maxWidth: .infinity)
      }
      .buttonStyle(.borderedProminent)
      .tint(.green)
      // Чёрный на зелёном: белый на этом фоне не читается — проверено на
      // живом экране, и это была отдельная жалоба.
      .foregroundStyle(.black)
      .controlSize(.large)
      .disabled(!готов)
    }
    .onAppear { вФокусе = true }
  }

  private func войти() async {
    идёт = true
    ошибка = nil
    do {
      try await Identity.claimPairing(code: цифры)
      вошли()
    } catch {
      ошибка = error.localizedDescription
      // Код одноразовый: после отказа он мёртв в любом случае, и оставлять
      // его в поле значит приглашать нажать «Войти» ещё раз впустую.
      код = ""
      вФокусе = true
    }
    идёт = false
  }
}
