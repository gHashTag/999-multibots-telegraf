import SwiftUI

/**
 * Профиль целиком нативный.
 *
 * ЧТО ЗДЕСЬ БЫЛО. `WebScreen(path: "/profile")` под секцией входа. И он
 * ГАРАНТИРОВАННО показывал не профиль: веб узнаёт человека по подписи
 * Telegram, а у WKWebView внутри приложения её нет и не будет. Сначала
 * вкладка молча показывала ленту, потом — экран «профиль не открыть».
 * Оба варианта одинаково бесполезны, просто второй честнее.
 *
 * ЧТО ИЗМЕНИЛОСЬ. Приложение знает свой telegram_id — сервер называет его в
 * ответ на обмен кода. Этого достаточно: имя, аватар и ролики берутся теми же
 * маршрутами, которыми пользуется веб. Никакой подписи для них не нужно —
 * профиль публичный, и это правильно: чужой профиль тоже должен открываться.
 */
struct ProfileScreen: View {
  @State private var профиль: API.Profile?
  @State private var ролики: [API.Template] = []
  @State private var грузим = true
  @State private var ошибка: String?
  /// Растёт при входе и выходе — по нему перезагружаются данные.
  @State private var версия = 0

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: Тема.Отступ.lg) {
        доступ

        if Identity.telegramId != nil {
          if грузим {
            ProgressView().frame(maxWidth: .infinity).padding(.vertical, Тема.Отступ.xl)
          } else if let ошибка {
            подпись(ошибка)
          } else if let профиль {
            шапка(профиль)
            сетка
          }
        }
      }
      .padding(Тема.Отступ.md)
    }
    .background(Тема.Цвет.фон)
    .task(id: версия) { await загрузить() }
  }

  // MARK: - Куски

  /**
   * Секция доступа СВЕРХУ и всегда.
   *
   * Соблазн был спрятать её после входа. Но «выйти» — единственное действие,
   * которое человек ищет именно в профиле, и прятать его за раскрывающийся
   * блок значит прятать единственную кнопку, ради которой сюда заходят.
   */
  @ViewBuilder private var доступ: some View {
    if Identity.hasSession {
      HStack {
        Label("Вы вошли", systemImage: "checkmark.shield")
          .font(.subheadline.weight(.medium))
          .foregroundStyle(Тема.Цвет.акцент)
        Spacer()
        Button(role: .destructive) {
          Task {
            await Identity.logout()
            профиль = nil
            ролики = []
            версия += 1
          }
        } label: {
          // Высота ВНУТРИ label: снаружи `.frame` не растягивает подложку,
          // которую рисует `.bordered` — замерено 34.3 pt вместо 44.
          Text("Выйти")
            .frame(minHeight: Тема.Кнопка.высота)
        }
        .buttonStyle(.bordered)
        .tint(Тема.Цвет.ошибка)
      }
    } else {
      VStack(alignment: .leading, spacing: Тема.Отступ.карточкаЛенты) {
        Label("Нужен вход", systemImage: "exclamationmark.shield")
          .font(.subheadline.weight(.medium))
          .foregroundStyle(Тема.Цвет.предупреждение)
        SignInView { версия += 1 }
      }
    }
  }

  private func шапка(_ p: API.Profile) -> some View {
    HStack(alignment: .top, spacing: Тема.Отступ.пузырьЧата) {
      // AsyncImage, а не своя загрузка: система сама кеширует, отменяет при
      // уходе с экрана и не держит картинку в памяти дольше нужного.
      AsyncImage(url: p.avatar_url.flatMap(URL.init(string:))) { фаза in
        if let img = фаза.image {
          img.resizable().scaledToFill()
        } else {
          Тема.Цвет.поверхность
        }
      }
      .frame(width: 72, height: 72)
      .clipShape(Circle())

      VStack(alignment: .leading, spacing: Тема.Отступ.xs) {
        Text(p.display_name ?? p.username)
          .font(.title3.weight(.semibold))
          .foregroundStyle(Тема.Цвет.текст)
        Text("@\(p.username)")
          .font(.subheadline)
          .foregroundStyle(Тема.Цвет.акцент)
        if let bio = p.bio, !bio.isEmpty {
          Text(bio)
            .font(.footnote)
            .foregroundStyle(Тема.Цвет.текстПриглушённый)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      Spacer(minLength: 0)
    }
  }

  @ViewBuilder private var сетка: some View {
    if ролики.isEmpty {
      подпись("Пока ни одного ролика")
    } else {
      Text("Ролики · \(ролики.count)")
        .font(.subheadline.weight(.medium))
        .foregroundStyle(Тема.Цвет.текстПриглушённый)

      LazyVGrid(
        columns: Array(repeating: GridItem(.flexible(), spacing: Тема.Отступ.sm), count: 3),
        spacing: Тема.Отступ.sm
      ) {
        ForEach(ролики) { р in
          ZStack(alignment: .bottomLeading) {
            Тема.Цвет.поверхность
            // Счётчик просмотров поверх плитки: в вебе он там же, и это
            // единственное число, ради которого автор сюда заходит.
            Label("\(р.viewsCount)", systemImage: "eye")
              .font(.caption2)
              .foregroundStyle(Тема.Цвет.текст)
              .padding(Тема.Отступ.вкладка)
          }
          .aspectRatio(9.0 / 16.0, contentMode: .fit)
          .clipShape(RoundedRectangle(cornerRadius: Тема.Радиус.lg))
          .accessibilityLabel("\(р.name), просмотров \(р.viewsCount)")
        }
      }
    }
  }

  private func подпись(_ т: String) -> some View {
    Text(т)
      .font(.footnote)
      .foregroundStyle(Тема.Цвет.текстПриглушённый)
      .frame(maxWidth: .infinity, alignment: .leading)
  }

  // MARK: - Загрузка

  private func загрузить() async {
    guard let id = Identity.telegramId else {
      грузим = false
      return
    }
    грузим = true
    ошибка = nil
    do {
      let p = try await API.profile(telegramId: id)
      профиль = p
      // Ролики грузим ВТОРЫМ запросом и не роняем из-за них весь экран:
      // профиль без списка полезен, список без профиля — нет.
      ролики = (try? await API.userTemplates(username: p.username)) ?? []
    } catch {
      ошибка = "Профиль не загрузился: \(error.localizedDescription)"
    }
    грузим = false
  }
}
