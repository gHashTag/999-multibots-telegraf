import SwiftUI

/**
 * ПОДКЛЮЧЕНИЕ СВОЕГО TELEGRAM — ТОТ ЖЕ ЭКРАН, ЧТО В ВЕБЕ.
 *
 * Владелец 07.09.2026: «страницы профиля должны совпадать по логике и дизайну
 * — сайт и в мобиле». В вебе это вкладка «Агент» (`ConnectTelegram.tsx`), на
 * телефоне её не было вовсе, при том что маршруты `/api/tg/connect/…`
 * принимают и сессию приложения — то есть с iPhone туда можно было ходить
 * всегда, просто некому.
 *
 * ── ЧЕСТНОСТЬ ЗДЕСЬ ВАЖНЕЕ КРАСОТЫ ─────────────────────────────────────────
 *
 * Человек отдаёт доступ к своей переписке. Экран обязан сказать это ПРЯМО и
 * ДО ввода телефона: что получит агент, что не хранится, как отключить.
 * Форма, которая умалчивает и выглядит «как в Telegram», — это фишинг по
 * форме, чем бы она ни была по намерению.
 *
 * Порядок и слова взяты из веб-версии намеренно: человек, видевший экран на
 * сайте, не должен гадать, тот ли это экран.
 *
 * ── ЧЕГО ЗДЕСЬ НЕТ ─────────────────────────────────────────────────────────
 *
 * Код подтверждения НЕ спрашивается в чате Telegram: отправленный сообщением
 * внутри Telegram, он аннулируется платформой — так она защищает людей от
 * самой частой кражи аккаунта. Поэтому поле живёт здесь.
 */
struct ConnectTelegramView: View {
  enum Шаг { case проверка, подключено, телефон, код, пароль }

  @State private var шаг: Шаг = .проверка
  @State private var телефон = ""
  @State private var код = ""
  @State private var пароль = ""
  @State private var handle = ""
  @State private var ошибка: String?
  @State private var занято = false
  /// Номер подставлен из Telegram, а не набран. Влияет только на подпись.
  @State private var номерИзTelegram = false

  var body: some View {
    VStack(alignment: .leading, spacing: Тема.Отступ.пузырьЧата) {
      switch шаг {
      case .проверка:
        // Пока не спросили сервер — молчим. Показать «подключить» и через миг
        // сменить на «подключено» значит мигнуть человеку неправдой.
        EmptyView()
      case .подключено:
        подключено
      case .телефон, .код, .пароль:
        форма
      }
      if let ошибка {
        Text(ошибка)
          .font(Тема.Шрифт.стиль(.footnote))
          .foregroundStyle(Тема.Профиль.красный)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .task { await спроситьСостояние() }
  }

  // MARK: - Куски

  @ViewBuilder private var подключено: some View {
    VStack(alignment: .leading, spacing: Тема.Отступ.xs) {
      Text("Telegram подключён")
        .font(Тема.Шрифт.стиль(.subheadline, .semibold))
        .foregroundStyle(Тема.Профиль.текст)
      Text(
        "Агент видит ваши диалоги, контакты и может искать по переписке. "
          + "Он ничего не отправляет от вашего имени без вашего подтверждения."
      )
      .font(Тема.Шрифт.стиль(.footnote))
      .foregroundStyle(Тема.Профиль.текстВторичный)
      .fixedSize(horizontal: false, vertical: true)

      Button("Отключить") {
        Task { await шагнуть { try await отключить() } }
      }
      .disabled(занято)
      .buttonStyle(Тема.Пилюля(цвет: Тема.Профиль.красный, заливка: .clear))
      .frame(minHeight: 44)
    }
  }

  @ViewBuilder private var форма: some View {
    VStack(alignment: .leading, spacing: Тема.Отступ.xs) {
      Text("Подключить Telegram")
        .font(Тема.Шрифт.стиль(.subheadline, .semibold))
        .foregroundStyle(Тема.Профиль.текст)

      /*
       * СОГЛАСИЕ ДО ВВОДА ТЕЛЕФОНА, а не мелким шрифтом под кнопкой. Человек
       * решает, зная последствия, — иначе это не согласие. Тот же список и
       * тот же порядок, что в вебе (`ConnectTelegram.tsx`).
       */
      ForEach(Self.факты, id: \.self) { факт in
        HStack(alignment: .top, spacing: Тема.Отступ.xs) {
          Text("•").foregroundStyle(Тема.Профиль.текстПриглушённый)
          Text(факт)
            .font(Тема.Шрифт.стиль(.footnote))
            .foregroundStyle(Тема.Профиль.текстВторичный)
            .fixedSize(horizontal: false, vertical: true)
        }
      }

      switch шаг {
      case .телефон:
        поле("+7 999 123-45-67", $телефон, клавиатура: .phonePad)
        if номерИзTelegram {
          // Говорим, ОТКУДА номер: подставленный молча выглядит как чужой,
          // и человек начинает его перепроверять вместо того, чтобы нажать.
          Text("Номер из Telegram — можно исправить")
            .font(Тема.Шрифт.стиль(.caption))
            .foregroundStyle(Тема.Профиль.текстПриглушённый)
        } else {
          /*
           * НОМЕРА НЕТ — ЧЕСТНО ГОВОРИМ, ЧТО ЕГО НЕЛЬЗЯ ВЗЯТЬ ОТСЮДА.
           *
           * Приложение не может прочитать ни номер устройства (Apple не даёт),
           * ни телефон аккаунта Telegram (платформа не отдаёт его никому,
           * кроме как по явному нажатию самого человека). Кнопка «взять из
           * Telegram» ЗДЕСЬ была бы кнопкой, которая не может сработать — а
           * таких в этом продукте уже хватило.
           *
           * Поэтому — ссылка в бота, где это нажатие возможно. Один раз.
           */
          Link(destination: URL(string: "https://t.me/t27ai_bot?start=phone")!) {
            Text("Не набирать руками: поделиться номером в боте")
              .font(Тема.Шрифт.стиль(.footnote, .medium))
              .foregroundStyle(Тема.Профиль.акцент)
          }
          .frame(minHeight: 44, alignment: .leading)
        }
        кнопка(занято ? "Отправляю код…" : "Получить код", готово: !телефон.isEmpty) {
          let о = try await Connect.начать(телефон: телефон)
          handle = о.handle
          телефон = о.phone
          шаг = .код
        }
      case .код:
        // Телефон показан ещё раз: опечатку надо заметить сейчас, а не после
        // десяти минут ожидания сообщения.
        Text("Код отправлен в Telegram на \(телефон). Не пересылайте его никому.")
          .font(Тема.Шрифт.стиль(.caption))
          .foregroundStyle(Тема.Профиль.текстПриглушённый)
          .fixedSize(horizontal: false, vertical: true)
        поле("12345", $код, клавиатура: .numberPad)
        кнопка(занято ? "Проверяю…" : "Подтвердить", готово: !код.isEmpty) {
          шаг = try await Connect.код(handle: handle, код: код) ? .пароль : .подключено
        }
      case .пароль:
        Text("У вас включена двухфакторная защита. Пароль не сохраняется.")
          .font(Тема.Шрифт.стиль(.caption))
          .foregroundStyle(Тема.Профиль.текстПриглушённый)
          .fixedSize(horizontal: false, vertical: true)
        полеПароля
        кнопка(занято ? "Проверяю…" : "Войти", готово: !пароль.isEmpty) {
          try await Connect.пароль(handle: handle, пароль: пароль)
          пароль = ""
          шаг = .подключено
        }
      default:
        EmptyView()
      }
    }
  }

  private static let факты = [
    "Агент сможет читать ваши диалоги, контакты и историю сообщений.",
    "Писать кому-либо он будет только после вашего подтверждения.",
    "Код и пароль не сохраняются — они уходят в Telegram.",
    "Номер сохраняется, чтобы не вводить его снова; при отключении удаляется.",
    "Отключить можно здесь же, в одно нажатие.",
  ]

  @ViewBuilder private func поле(
    _ подсказка: String,
    _ значение: Binding<String>,
    клавиатура: UIKeyboardType
  ) -> some View {
    TextField(подсказка, text: значение)
      .keyboardType(клавиатура)
      .textInputAutocapitalization(.never)
      .autocorrectionDisabled()
      .font(Тема.Шрифт.стиль(.body))
      .foregroundStyle(Тема.Профиль.текст)
      .padding(Тема.Отступ.sm)
      .background(
        Тема.Профиль.фон,
        in: RoundedRectangle(cornerRadius: Тема.Профиль.радиусПоля)
      )
      .overlay(
        RoundedRectangle(cornerRadius: Тема.Профиль.радиусПоля).strokeBorder(
          Тема.Профиль.границаЗаметная, lineWidth: Тема.Профиль.толщинаГраницы
        )
      )
  }

  @ViewBuilder private var полеПароля: some View {
    SecureField("Пароль", text: $пароль)
      .font(Тема.Шрифт.стиль(.body))
      .foregroundStyle(Тема.Профиль.текст)
      .padding(Тема.Отступ.sm)
      .background(
        Тема.Профиль.фон,
        in: RoundedRectangle(cornerRadius: Тема.Профиль.радиусПоля)
      )
      .overlay(
        RoundedRectangle(cornerRadius: Тема.Профиль.радиусПоля).strokeBorder(
          Тема.Профиль.границаЗаметная, lineWidth: Тема.Профиль.толщинаГраницы
        )
      )
  }

  @ViewBuilder private func кнопка(
    _ надпись: String,
    готово: Bool,
    _ дело: @escaping () async throws -> Void
  ) -> some View {
    Button(надпись) { Task { await шагнуть(дело) } }
      .disabled(занято || !готово)
      .buttonStyle(Тема.Пилюля(цвет: Тема.Профиль.акцент, заливка: .clear))
      .frame(minHeight: 44)
  }

  // MARK: - Действия

  private func шагнуть(_ дело: @escaping () async throws -> Void) async {
    ошибка = nil
    занято = true
    defer { занято = false }
    do {
      try await дело()
    } catch {
      // Причина показывается как есть: сервер здесь отвечает словами человека
      // («номер не принят Telegram»), и подменять их общим «не удалось»
      // значило бы отнять единственную подсказку.
      ошибка = (error as? Connect.Отказ)?.причина ?? error.localizedDescription
    }
  }

  private func отключить() async throws {
    try await Connect.отключить()
    шаг = .телефон
  }

  private func спроситьСостояние() async {
    // Не удалось спросить — показываем форму. Заявить «не подключено» было бы
    // догадкой, а предложить подключить можно всегда.
    let с = try? await Connect.состояние()
    /*
     * НОМЕР ПОДСТАВЛЯЕТСЯ, НО НЕ ОТПРАВЛЯЕТСЯ САМ.
     *
     * Владелец просил «чтобы руками не писать». Подставить — да; нажать за
     * человека «Получить код» — нет: это начало доступа к его переписке, и
     * такое не делают без его касания.
     *
     * Поле остаётся видимым и правимым: скрытая подстановка хуже набора
     * руками — человек не видит, какой номер вот-вот уйдёт.
     */
    if let номер = с?.phone, телефон.isEmpty {
      телефон = номер
      номерИзTelegram = true
    }
    шаг = (с?.подключено ?? false) ? .подключено : .телефон
  }
}
