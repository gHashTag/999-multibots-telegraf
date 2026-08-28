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
 *
 * ПАЛИТРА ЗДЕСЬ СВОЯ — `Тема.Профиль`, а не общая `Тема.Цвет`.
 *
 * Экран был зелёным целиком: чёрный фон #000000, акцент #00ff88 на отметке
 * входа и на @имени. В вебе профиль так не выглядит — у него отдельный scope
 * `.profile-page` с матовым чёрным фоном, кремовым текстом и ЗОЛОТЫМ акцентом
 * (Profile.css:1111-1129 и далее; полный разбор с номерами строк и честным
 * счётом зелёного против золотого — в `Тема.Профиль`).
 *
 * ПРО ЧИТАЕМОСТЬ. Золото под текстом сплошной заливкой не идёт нигде — ни
 * здесь, ни в вебе. Замер: белый на #ffd700 даёт 1.40:1, то есть повторил бы
 * ровно ту жалобу, из-за которой на зелёных кнопках стоит чёрный текст.
 * Вместо заливки — вебовская связка «золотая рамка + подложка 10% + золотой
 * текст». По снятому кадру: золотая подпись на фоне страницы 14.53:1,
 * на подложке кнопки 12.42:1, тёплый красный «Выйти» 7.34:1, кремовый текст
 * на плитке 14.78:1. Белых пикселей в содержимом экрана не осталось вовсе —
 * единственные #ffffff на скриншоте это часы в строке состояния.
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
            ProgressView()
              .tint(Тема.Профиль.акцент)
              .frame(maxWidth: .infinity)
              .padding(.vertical, Тема.Отступ.xl)
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
    // #050505, а не #000000 общей темы: Profile.css:1114 и :1122.
    .background(Тема.Профиль.страница)
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
          // Золото вместо зелёного: акцент нового профиля — Profile.css:555.
          .foregroundStyle(Тема.Профиль.акцент)
        Spacer()
        Button {
          Task {
            await Identity.logout()
            профиль = nil
            ролики = []
            версия += 1
          }
        } label: {
          Text("Выйти")
        }
        /**
         * Красный ТЁПЛЫЙ, `--vibee-red: #ff6b6b` (index.css:104) — тот, что
         * применяет НОВЫЙ блок профиля (Profile.css:1733).
         *
         * Оговорка, чтобы не выдать выбор за единственно возможный: холодный
         * #ef4444 в Profile.css тоже есть — `--status-error` на :1003, :1009,
         * :1011, :1059 и запасное `239, 68, 68` на :1056-1057. Но все эти
         * строки лежат в старшем блоке, выше :1111, вместе с зелёным акцентом.
         * Берём красный того поколения, чью палитру переносим.
         *
         * Форма — та же пилюля, что у остальных кнопок профиля, и без
         * подложки: у трёх из четырёх вебовских кнопок `background`
         * прозрачный (:1608, :1767 и наведение :1616). Контраст #ff6b6b
         * на #050505 — 7.3:1.
         */
        .buttonStyle(Тема.ПилюляПрофиля(цвет: Тема.Профиль.красный, подложка: .clear))
      }
    } else {
      VStack(alignment: .leading, spacing: Тема.Отступ.карточкаЛенты) {
        Label("Нужен вход", systemImage: "exclamationmark.shield")
          .font(.subheadline.weight(.medium))
          /**
           * ЗОЛОТО, А НЕ `Цвет.предупреждение` #eab308.
           *
           * Прежний #eab308 и золото #ffd700 — два почти одинаковых жёлтых,
           * и после этой правки они попадали бы на один экран: отметка
           * состояния одним, кнопка входа под ней — другим. Ровно такую пару
           * Theme.swift уже фиксирует как дефект на двух зелёных таймлайна.
           * Вебовского источника у этой строки нет — экрана «нужен вход» в
           * вебе не существует, — поэтому свожу к акценту профиля, а не
           * держу второй жёлтый ради статусной семантики.
           */
          .foregroundStyle(Тема.Профиль.акцент)
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
          // #0d0d0c — `--bg-elevated` профиля, Profile.css:1123
          Тема.Профиль.поверхность
        }
      }
      .frame(width: 72, height: 72)
      .clipShape(Circle())
      .overlay(
        Circle().strokeBorder(
          Тема.Профиль.границаЯркая, lineWidth: Тема.Профиль.толщинаГраницы
        )
      )

      VStack(alignment: .leading, spacing: Тема.Отступ.xs) {
        Text(p.display_name ?? p.username)
          .font(.title3.weight(.semibold))
          // Кремовый #e6e0d2, а не белый: Profile.css:1640, :1702, :1908.
          .foregroundStyle(Тема.Профиль.текст)
        Text("@\(p.username)")
          .font(.subheadline)
          .foregroundStyle(Тема.Профиль.акцент)
        if let bio = p.bio, !bio.isEmpty {
          Text(bio)
            .font(.footnote)
            .foregroundStyle(Тема.Профиль.текстПриглушённый)
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
        .foregroundStyle(Тема.Профиль.текстТусклый)

      LazyVGrid(
        // `gap: 12px` в сетке файлов — Profile.css:1505. Было `Отступ.sm` (8).
        columns: Array(
          repeating: GridItem(.flexible(), spacing: Тема.Профиль.просветСетки),
          count: 3
        ),
        spacing: Тема.Профиль.просветСетки
      ) {
        ForEach(ролики) { р in
          ZStack(alignment: .bottomLeading) {
            // `background: #0d0d0c` плитки — Profile.css:1514
            Тема.Профиль.поверхность
            // Счётчик просмотров поверх плитки: в вебе он там же, и это
            // единственное число, ради которого автор сюда заходит.
            Label("\(р.viewsCount)", systemImage: "eye")
              .font(.caption2)
              .foregroundStyle(Тема.Профиль.текст)
              .padding(Тема.Отступ.вкладка)
          }
          .aspectRatio(9.0 / 16.0, contentMode: .fit)
          // 12, а не 8: `border-radius: 12px` — Profile.css:1511.
          .clipShape(RoundedRectangle(cornerRadius: Тема.Профиль.радиусКарточки))
          .overlay(
            // `border: 1px solid #1c1b18` — Profile.css:1513. На #0d0d0c её
            // видно, в отличие от общей `Цвет.граница`, совпадающей с фоном.
            RoundedRectangle(cornerRadius: Тема.Профиль.радиусКарточки)
              .strokeBorder(
                Тема.Профиль.граница, lineWidth: Тема.Профиль.толщинаГраницы
              )
          )
          .accessibilityLabel("\(р.name), просмотров \(р.viewsCount)")
        }
      }
    }
  }

  private func подпись(_ т: String) -> some View {
    Text(т)
      .font(.footnote)
      // `.profile-files__empty { color: #8a8578 }` — Profile.css:1556.
      .foregroundStyle(Тема.Профиль.текстТусклый)
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
