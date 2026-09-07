import SwiftUI

/// Чат с агентом: нативный список + разбор NDJSON-потока.
///
/// Формат события проверен живым запросом, а не выведён из кода клиента:
///   {"тип":"размышление","текст":"…"}
///   {"тип":"текст","текст":"…"}
///   {"тип":"инструмент","имя":"providers_status"}
///   {"тип":"результат","имя":"…","значение":{…}}
///   {"тип":"готово","витков":4}
///
/// Ключи русские — так их отдаёт сервер. Переименовывать в Swift-модели
/// значило бы завести второе имя для одного поля; лучше честный CodingKey.
///
/// ПАЛИТРА ЗДЕСЬ СВОЯ — `Тема.Чат`, а не общая `Тема.Цвет`.
///
/// Экран брал общую тему, и на глаз это выглядело правильно: фон чёрный,
/// акцент зелёный — совпало. Расходились ПОВЕРХНОСТИ, а их на глаз не
/// поймать. Веб красит пузырь агента прозрачным белым на 5% (Chat.css:11,
/// применено :92), здесь стояла НЕПРОЗРАЧНАЯ плитка #1a1a1a
/// (`Цвет.поверхность`, index.css:90) — вдвое светлее. Своя реплика была
/// залита зелёным на 20% против вебовских 8% (:96) и вовсе без рамки, хотя
/// в вебе рамка есть и она несёт половину узнавания (:97). Чип инструмента
/// шёл на 15% без рамки против 10% + рамка 28% (:140-141).
///
/// ПРО ЧИТАЕМОСТЬ. Единственная сплошная заливка на экране — кнопка
/// отправки: зелёная, и подпись на ней ЧЁРНАЯ (Chat.css:241). Белая дала бы
/// 1.28:1 — ровно та жалоба, которая в проекте уже была. Золото на этом
/// экране под текстом не идёт нигде: в вебе им покрашена только плашка
/// баланса токенов, а нативного баланса нет — см. `Тема.Чат.золото`.
struct AgentChatView: View {
  @State private var сообщения: [Реплика] = AgentChatView.загрузитьИсторию()
  @State private var ввод = ""
  @State private var идёт = false

  struct Реплика: Identifiable, Codable, Equatable {
    /// `var`, а не `let`: `let id = UUID()` при декодировании даёт новый
    /// идентификатор вместо сохранённого, и SwiftUI считает восстановленные
    /// реплики другими — список дёргается при каждом открытии.
    var id = UUID()
    var свой: Bool
    var текст: String
    var инструменты: [String] = []
    /// Which client wrote it. Absent for anything typed here and now: only
    /// history fetched from the server carries it.
    var surface: String?

    /**
     * Предложение действия, ждущее слова человека.
     *
     * Инструменты `tg_send`, `tg_forward` и `tg_read` НЕ выполняют, а возвращают
     * предложение: отправка доходит до другого человека, и отозвать её нельзя.
     * Решение остаётся за владельцем — и остаётся за ним даже когда модель
     * уверена, особенно тогда, ведь уверенность как раз и производит удачно
     * составленная подсказка внутри чужого сообщения.
     *
     * Без этого поля предложение утонуло бы в списке `инструменты` наравне с
     * `tg_dialogs`, и человек одобрял бы отправку, не увидев ни адресата, ни
     * текста. Замок на сервере без окна в приложении — это не замок.
     */
    var предложение: Предложение?
  }

  /// Что именно агент просит разрешить. Поля названы так же, как на сервере.
  struct Предложение: Codable, Equatable {
    var действие: String
    var куда: String
    var что: String?
    var пояснение: String
    /// Решение человека. `nil` — ещё не отвечал; окно висит до ответа.
    var одобрено: Bool?
  }

  /**
   * Где живёт история.
   *
   * ЗАЧЕМ. Реплики лежали в `@State` и умирали вместе с экраном: человек
   * закрывал приложение и терял разговор целиком. В вебе история остаётся —
   * значит нативный экран, теряющий её, не «проще», а хуже.
   *
   * ПОЧЕМУ ФАЙЛ, А НЕ UserDefaults. UserDefaults читается целиком при первом
   * обращении и держится в памяти; переписка на сотню реплик там неуместна.
   * Файл в Application Support не попадает в резервную копию по умолчанию
   * только если это указать — здесь наоборот, пусть переезжает с человеком.
   *
   * ПОЧЕМУ НЕ KEYCHAIN. Там личность, а не содержимое. Переписка с агентом
   * не секрет в том же смысле, что токен, и класть её в Keychain значило бы
   * раздувать хранилище, рассчитанное на короткие строки.
   */
  private static var файлИстории: URL? {
    guard let каталог = try? FileManager.default.url(
      for: .applicationSupportDirectory, in: .userDomainMask,
      appropriateFor: nil, create: true
    ) else { return nil }
    return каталог.appendingPathComponent("agent-chat.json")
  }

  /// Сколько реплик держим. Больше — файл растёт без предела, а прокрутка
  /// к началу годичной переписки никому не нужна.
  private static let пределИстории = 200

  private static func загрузитьИсторию() -> [Реплика] {
    guard let url = файлИстории,
          let data = try? Data(contentsOf: url),
          let реплики = try? JSONDecoder().decode([Реплика].self, from: data)
    else { return [] }
    return реплики
  }

  private static func сохранитьИсторию(_ реплики: [Реплика]) {
    guard let url = файлИстории else { return }
    let хвост = Array(реплики.suffix(пределИстории))
    guard let data = try? JSONEncoder().encode(хвост) else { return }
    // Ошибку записи глотаем намеренно и молча: потерять историю неприятно,
    // но показывать алерт поверх разговора — хуже. Сам разговор не задет.
    try? data.write(to: url, options: .atomic)
  }

  // MARK: - The shared conversation
  //
  // New members here are named in English by project convention; the Russian
  // names around them are pre-existing and migrate separately.

  /**
   * ONE CONVERSATION, THREE SURFACES -- AND THIS ONE WAS DEAF.
   *
   * The bot and the mini app both read `agent_messages` before every turn, so
   * what you write in one appears in the other. This screen did neither: it
   * kept a private file (`agent-chat.json`) and posted exactly one message,
   * `[{role:"user", content: question}]`.
   *
   * Two consequences, and the second is the expensive one:
   *
   *   the phone never showed what was said in the bot or the mini app;
   *   the MODEL received no history at all, so every question on iOS was
   *   answered with zero memory. "And make it shorter" had nothing to refer
   *   to -- and the answer looked like the agent had simply stopped listening.
   *
   * The server already expects the client to send its transcript: it records
   * only the LAST user turn of what arrives (routes.ts), precisely so a client
   * can pass the whole conversation without duplicating it.
   */

  /// One turn as the server stores it. Only `role` and `content` survive the
  /// round trip: tool chips and proposals live in the stream, not in the table.
  struct ServerTurn: Decodable {
    let role: String
    let content: String
    /// Which client wrote it: bot | miniapp | ios | agent | unknown.
    let surface: String?
  }

  /**
   * WHERE THIS SURFACE IS. Anything written here is "here", so it is never
   * labelled: a caption on every single bubble is noise, and noise is what
   * stops people reading the captions that matter.
   */
  static let thisSurface = "ios"

  /**
   * The human name of another surface, or nil when there is nothing to say.
   *
   * `unknown` returns nil ON PURPOSE. It is the column default, so it marks a
   * turn written before this existed or by a client that did not name itself.
   * It carries no information, and "from somewhere" would be a caption that
   * looks like knowledge.
   */
  static func surfaceLabel(_ surface: String?) -> String? {
    switch surface {
    case "bot": return say("from the bot", "из бота")
    case "miniapp": return say("from the app", "из мини-аппа")
    case "agent": return say("via an agent key", "по ключу агента")
    default: return nil
    }
  }

  private struct HistoryResponse: Decodable {
    let messages: [ServerTurn]
  }

  /// How many past turns travel with a question. Matches the bot, which reads
  /// 40 before every turn; a different number would give the same person a
  /// different memory depending on which app they happened to open.
  static let contextLimit = 40

  /**
   * Fold the shared conversation into what this device is showing.
   *
   * The server copy wins when there is one -- it is the only place all three
   * surfaces meet. Empty means "nothing shared yet", not "the conversation was
   * cleared", so an empty answer leaves the local copy alone: a network blip
   * must not wipe a visible conversation.
   *
   * A PENDING PROPOSAL BLOCKS THE REPLACEMENT. `tg_send` and its siblings do
   * not act, they propose, and the proposal arrives only in the live stream --
   * it is not stored and cannot be fetched back. Overwriting a turn that still
   * carries an unanswered one would erase the only window in which the person
   * can say yes or no, while the agent goes on waiting for an answer that can
   * no longer be given.
   */
  static func mergeHistory(server: [ServerTurn], local: [Реплика]) -> [Реплика] {
    let awaitingAnswer = local.contains { реплика in
      guard let предложение = реплика.предложение else { return false }
      return предложение.одобрено == nil
    }
    if awaitingAnswer { return local }
    if server.isEmpty { return local }
    return server.map {
      Реплика(свой: $0.role == "user", текст: $0.content, surface: $0.surface)
    }
  }

  /**
   * The `messages` array a chat request carries.
   *
   * Empty turns are dropped: the screen appends a blank assistant bubble as a
   * placeholder while an answer streams in, and a failed turn leaves it blank
   * forever. Sending `content: ""` would ask the model to make sense of a
   * silence it never produced.
   */
  static func requestMessages(
    history: [Реплика],
    question: String,
    limit: Int = contextLimit
  ) -> [[String: String]] {
    let tail = history.filter { !$0.текст.isEmpty }.suffix(limit)
    return tail.map { ["role": $0.свой ? "user" : "assistant", "content": $0.текст] }
      + [["role": "user", "content": question]]
  }

  /**
   * Pull the shared conversation when the screen opens.
   *
   * Failure is silent ON PURPOSE, exactly as in the mini app: an unreachable
   * history must not stand between a person and writing a new message. The
   * local copy is already on screen, so the worst case is what the screen did
   * before this existed.
   */
  @MainActor
  private func loadSharedHistory() async {
    guard Identity.known else { return }
    guard
      var компоненты = URLComponents(
        url: API.base.appendingPathComponent("api/agent/history"),
        resolvingAgainstBaseURL: false
      )
    else { return }
    компоненты.queryItems = [URLQueryItem(name: "limit", value: "100")]
    guard let url = компоненты.url else { return }

    var r = URLRequest(url: url)
    for (k, v) in Identity.headers() { r.setValue(v, forHTTPHeaderField: k) }
    do {
      let (data, ответ) = try await URLSession.shared.data(for: r)
      guard (ответ as? HTTPURLResponse)?.statusCode == 200 else { return }
      let история = try JSONDecoder().decode(HistoryResponse.self, from: data)
      сообщения = AgentChatView.mergeHistory(server: история.messages, local: сообщения)
    } catch {
      // See the note above: silence here is the designed behaviour.
    }
  }

  var body: some View {
    основное
      /**
       * Сохраняем на КАЖДОМ изменении, а не при уходе с экрана.
       *
       * Уход с экрана — не то же, что закрытие приложения: iOS вправе
       * выгрузить процесс из фона без предупреждения, и `onDisappear` тогда
       * не вызовется вовсе. Запись при изменении дороже, но она случается
       * ровно тогда, когда есть что терять.
       */
      .onChange(of: сообщения) { _, новые in
        AgentChatView.сохранитьИсторию(новые)
      }
      /*
       * Pull the shared conversation when the screen opens.
       *
       * `.task` rather than `.onAppear`: the work is asynchronous and SwiftUI
       * cancels it by itself if the person leaves before the answer arrives.
       * `onAppear` would need a `Task` that nobody cancels, and the answer
       * would land on a screen that is already gone.
       */
      .task { await loadSharedHistory() }
  }

  private var основное: some View {
    VStack(spacing: 0) {
      шапка

      ScrollViewReader { proxy in
        ScrollView {
          // `gap: 14px` между репликами — Chat.css:66. Было 14 через
          // `Отступ.пузырьЧата`, число то же, но источник другой: тот
          // токен снят с ГОРИЗОНТАЛЬНОГО отступа пузыря (Chat.css:89).
          LazyVStack(alignment: .leading, spacing: Тема.Чат.просветСообщений) {
            ForEach(сообщения) { m in
              реплика(m)
            }
          }
          // `.chat-container { padding: 18px }` — Chat.css:61. Было 16.
          .padding(Тема.Чат.отступСписка)
        }
        .onChange(of: сообщения.count) {
          withAnimation { proxy.scrollTo(сообщения.last?.id, anchor: .bottom) }
        }
      }

      панельВвода
    }
    .background(Тема.Чат.фон)
  }

  // MARK: - Куски

  /**
   * Шапка чата вместо системного заголовка навигации.
   *
   * Здесь стоял `NavigationStack` ради одной строки «Агент». Он давал
   * системную панель — другой кегль, другой вес, никакого подзаголовка — и
   * ни одного экрана, куда можно уйти вглубь: `NavigationLink` в файле нет.
   * Веб на этом месте держит СВОЙ блок `.chat-title` (Chat.css:35-56) с
   * подзаголовком, который объясняет, чем этот агент отличается от чата
   * вообще. Текст перенесён дословно из Chat.tsx:280-283.
   */
  private var шапка: some View {
    VStack(alignment: .leading, spacing: 0) {
      // `h1 { font-size: 16px; font-weight: 600; letter-spacing: .01em }`
      // — Chat.css:48-50.
      Text("Агент")
        .font(Тема.Шрифт.кегль(Тема.Чат.кегльЗаголовка, Тема.Чат.весЗаголовка, относительно: .headline))
        .tracking(Тема.Чат.трекингЗаголовка)
        .foregroundStyle(Тема.Чат.текст)

      // `p { margin: 2px 0 0; font-size: 12px; color: --t27-muted }`
      // — Chat.css:53-55.
      Text("Смотрит в приложение своими инструментами и делает, а не советует")
        .font(Тема.Шрифт.кегль(Тема.Чат.кегльПодзаголовка, относительно: .footnote))
        .foregroundStyle(Тема.Чат.текстПриглушённый)
        .padding(.top, 2)
        .fixedSize(horizontal: false, vertical: true)

      /**
       * «Новый разговор» — из веба (Chat.tsx:287-297), а не выдумка.
       *
       * Появляется, когда есть что заканчивать. Условие веба
       * `messages.length > 1` перенесено ПО СМЫСЛУ, а не по числу: там
       * список начинается с приветственной реплики, здесь он начинается
       * пустым, и дословное «больше одной» означало бы другое состояние.
       *
       * Нативному экрану кнопка нужна даже сильнее: уйти со вкладки и
       * вернуться переписку не стирает, а другого способа её закончить на
       * экране нет вовсе.
       */
      if !сообщения.isEmpty {
        Button("Новый разговор") {
          сообщения = []
          ввод = ""
        }
        .buttonStyle(
          Тема.Пилюля(
            цвет: Тема.Чат.текстТаблетки,
            заливка: .clear,
            кегль: Тема.Шрифт.кегль(Тема.Чат.кегльТаблетки, относительно: .footnote),
            // Рамка ТЕМНЕЕ подписи: #2a2820 против #8a8578, Chat.css:282
            // и :285. У профильных кнопок эти два цвета совпадают, у этой —
            // нет, и совпадением она бы кричала громче, чем задумано:
            // комментарий Chat.css:275-276 называет её «приглушённой».
            цветРамки: Тема.Чат.границаТаблетки,
            трекинг: Тема.Чат.трекингТаблетки
          )
        )
        .padding(.top, Тема.Отступ.xs)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    // `padding: 14px 18px` — Chat.css:38.
    .padding(.vertical, Тема.Чат.отступШапкиПоВертикали)
    .padding(.horizontal, Тема.Чат.отступШапкиПоГоризонтали)
    .overlay(alignment: .bottom) {
      // `border-bottom: 1px solid var(--t27-border)` — Chat.css:39.
      Тема.Чат.граница.frame(height: Тема.Чат.толщинаГраницы)
    }
  }

  private func реплика(_ m: Реплика) -> some View {
    VStack(alignment: m.свой ? .trailing : .leading, spacing: Тема.Отступ.вкладка) {
      /*
       * WHERE THIS TURN CAME FROM, when it was not this phone.
       *
       * One conversation spans the bot, the mini app and here, so a reply can
       * answer a question that was never typed on this screen. Without the
       * caption the transcript reads as the agent answering itself.
       *
       * Quieter than the tool chip below it on purpose: a tool chip reports
       * something the agent DID, this reports only where a line was typed.
       */
      if let откуда = AgentChatView.surfaceLabel(m.surface) {
        Text(откуда)
          .font(Тема.Шрифт.моно(Тема.Чат.кегльЧипа))
          .foregroundStyle(Тема.Цвет.текстПриглушённый)
      }
      if !m.инструменты.isEmpty {
        // Показываем, ЧЕМ агент проверял. Это и есть доверие:
        // человек видит, что ответ не выдуман.
        // `.tool-chips { gap: 6px }` — Chat.css:133.
        HStack(spacing: Тема.Отступ.вкладка) {
          ForEach(m.инструменты, id: \.self) { и in
            Text(и)
              // `font-size: 11px`, моноширинный — Chat.css:137-138.
              .font(Тема.Шрифт.моно(Тема.Чат.кегльЧипа))
              .foregroundStyle(Тема.Чат.акцент)
              // `padding: 2px 8px` — Chat.css:143. Было 3/7 на глаз.
              .padding(.horizontal, Тема.Чат.отступЧипаПоГоризонтали)
              .padding(.vertical, Тема.Чат.отступЧипаПоВертикали)
              // Заливка 0.1, а не 0.15 — Chat.css:140. И РАМКА: в вебе
              // она есть (:141), здесь её не было вовсе.
              .background(
                Тема.Чат.чипЗаливка,
                in: RoundedRectangle(cornerRadius: Тема.Чат.радиусПузыря)
              )
              .overlay(
                RoundedRectangle(cornerRadius: Тема.Чат.радиусПузыря)
                  .strokeBorder(
                    Тема.Чат.чипГраница, lineWidth: Тема.Чат.толщинаГраницы
                  )
              )
          }
        }
      }

      Text(m.текст)
        // `font-size: 14px; line-height: 1.55` — Chat.css:87-88. Было
        // системное `.body` (17 pt) без заданного межстрочного.
        .font(Тема.Шрифт.кегль(Тема.Чат.кегльТела, относительно: .callout))
        .lineSpacing(Тема.Чат.зазорСтрок)
        .foregroundStyle(Тема.Чат.текст)
        // `padding: 11px 14px` — Chat.css:89. Было 12 по кругу.
        .padding(.horizontal, Тема.Чат.отступПузыряПоГоризонтали)
        .padding(.vertical, Тема.Чат.отступПузыряПоВертикали)
        .background(
          m.свой ? Тема.Чат.свояЗаливка : Тема.Чат.поверхность,
          in: RoundedRectangle(cornerRadius: Тема.Чат.радиусПузыря)
        )
        .overlay(
          // Рамка есть у ОБОИХ пузырей: общая белая на 10% (Chat.css:91)
          // и зелёная на 35% у своей реплики (:97).
          RoundedRectangle(cornerRadius: Тема.Чат.радиусПузыря)
            .strokeBorder(
              m.свой ? Тема.Чат.свояГраница : Тема.Чат.граница,
              lineWidth: Тема.Чат.толщинаГраницы
            )
        )
    }
    // `.message { max-width: 88% }` — Chat.css:75. Пузырь во всю ширину
    // экрана читается хуже: глазу негде поймать край строки.
    .frame(maxWidth: .infinity, alignment: m.свой ? .trailing : .leading)
    .id(m.id)
  }

  private var панельВвода: some View {
    HStack(spacing: Тема.Отступ.sm) {
      TextField("Спроси агента…", text: $ввод, axis: .vertical)
        .textFieldStyle(.plain)
        .font(Тема.Шрифт.кегль(Тема.Чат.кегльПоля, относительно: .callout))
        // `padding: 11px 13px`, `min-height: 44px` — Chat.css:219, :224.
        .padding(.horizontal, Тема.Чат.отступПоляПоГоризонтали)
        .padding(.vertical, Тема.Чат.отступПоляПоВертикали)
        .frame(minHeight: Тема.Чат.высотаПоля)
        // Прозрачная поверхность и рамка 10% — Chat.css:220-222.
        // Радиус 10, а не 12: у поля он свой (:222).
        .background(
          Тема.Чат.поверхность,
          in: RoundedRectangle(cornerRadius: Тема.Чат.радиусПоля)
        )
        .overlay(
          RoundedRectangle(cornerRadius: Тема.Чат.радиусПоля)
            .strokeBorder(Тема.Чат.граница, lineWidth: Тема.Чат.толщинаГраницы)
        )

      /**
       * Кнопка СЛОВОМ и сплошным зелёным, а не иконкой-стрелкой.
       *
       * В вебе это `.send-btn`: заливка `--t27-accent`, подпись «Отправить»
       * ЧЁРНАЯ, 90×44, радиус 10 (Chat.css:235-244). Иконка `arrow.up.circle`
       * не совпадала с вебом ничем, кроме смысла, и давала цель около 28 pt
       * даже при внешнем frame на 44.
       *
       * ЧЁРНАЯ ПОДПИСЬ — не вкус: белая на #00ff88 даёт 1.28:1, чёрная —
       * 16.3:1. Ровно этот размен уже зафиксирован в `Цвет.наАкценте`.
       */
      Button {
        Task { await отправить() }
      } label: {
        Text(идёт ? "Идёт…" : "Отправить")
          .font(Тема.Шрифт.кегль(Тема.Чат.кегльПоля, .semibold, относительно: .callout))
          .foregroundStyle(Тема.Чат.наАкценте)
          .frame(minWidth: Тема.Чат.минШиринаОтправки, minHeight: Тема.Чат.высотаПоля)
          .background(
            Тема.Чат.акцент,
            in: RoundedRectangle(cornerRadius: Тема.Чат.радиусПоля)
          )
      }
      .buttonStyle(.plain)
      // `.send-btn:disabled { opacity: 0.5 }` — Chat.css:252.
      .opacity(ввод.isEmpty || идёт ? 0.5 : 1)
      .disabled(ввод.isEmpty || идёт)
    }
    // `.chat-input-area { padding: 12px 14px }` — Chat.css:207.
    .padding(.horizontal, Тема.Чат.отступПанелиПоГоризонтали)
    .padding(.vertical, Тема.Чат.отступПанелиПоВертикали)
    .overlay(alignment: .top) {
      // `border-top: 1px solid var(--t27-border)` — Chat.css:206.
      Тема.Чат.граница.frame(height: Тема.Чат.толщинаГраницы)
    }
  }

  private func отправить() async {
    let вопрос = ввод
    ввод = ""
    идёт = true
    /**
     * СНЯТИЕ ФЛАГА ЧЕРЕЗ `defer`, А НЕ СТРОКОЙ В КОНЦЕ.
     *
     * Строка в конце уже не сработала один раз: выход по `guard
     * Identity.known` ниже возвращал управление, минуя `идёт = false`, и
     * кнопка отправки оставалась выключенной НАВСЕГДА. Человек без ключа
     * агента получал ровно одну попытку за запуск приложения, после чего
     * чат становился доступным только на чтение.
     *
     * Раньше это было почти незаметно: кнопкой служила иконка-стрелка, и
     * выключенная она отличалась от включённой только яркостью. Кнопка со
     * словом показывает состояние прямым текстом — «Идёт…», которое не
     * заканчивается, — и дефект стало видно на первом же кадре.
     */
    defer { идёт = false }

    /*
     * The snapshot is taken BEFORE this question and the blank answer bubble
     * are appended. Otherwise the question would travel twice and the
     * placeholder would travel as a turn whose content is "".
     */
    let priorTurns = сообщения

    сообщения.append(.init(свой: true, текст: вопрос))
    сообщения.append(.init(свой: false, текст: ""))
    let i = сообщения.count - 1

    guard Identity.known else {
      /**
       * Нечем представиться — говорим об этом ВМЕСТО молчания.
       *
       * Раньше запрос уходил без личности, сервер отвечал 401, поток
       * заканчивался пустым, и в чате оставался пустой пузырь. Человек видел
       * неработающего агента без единого слова о причине.
       */
      сообщения[i].текст =
        "Не могу представиться серверу — он не знает, кто спрашивает, и "
        + "отвечает отказом.\n\nЗайдите в Профиль и вставьте ключ агента. "
        + "Вход через Telegram появится следом: серверная половина уже готова."
      return
    }

    do {
      var r = URLRequest(url: API.base.appendingPathComponent("api/agent/chat"))
      r.httpMethod = "POST"
      r.setValue("application/json", forHTTPHeaderField: "Content-Type")
      // Личность. Без неё сервер отвечает 401, а экран молчал: агент просто
      // не отвечал, и понять почему было нельзя.
      for (k, v) in Identity.headers() { r.setValue(v, forHTTPHeaderField: k) }
      /*
       * The whole conversation travels, not just the question.
       *
       * This used to be `[["role": "user", "content": вопрос]]`: the model got
       * ONE turn and answered with no memory, so "now make it shorter" had
       * nothing to refer to. The server expects this shape -- it records only
       * the LAST user turn of what arrives, so passing the full transcript
       * duplicates nothing.
       *
       * `surface: "ios"` makes the origin visible in the shared feed. The
       * server knows the word; without it the turn was stored as "unknown".
       */
      r.httpBody = try JSONSerialization.data(
        withJSONObject: [
          "messages": AgentChatView.requestMessages(
            history: priorTurns, question: вопрос),
          "surface": "ios",
        ])

      let (поток, _) = try await URLSession.shared.bytes(for: r)
      var послеИнструмента = false
      for try await строка in поток.lines {
        guard let d = строка.data(using: .utf8),
              let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any]
        else { continue }
        switch o["тип"] as? String {
        case "текст":
          // Тот же разрыв абзаца, что и в вебе: агент говорит несколько раз
          // за ответ, и куски из разных ходов иначе слипаются в одну строку.
          if послеИнструмента, !сообщения[i].текст.isEmpty {
            сообщения[i].текст += "\n\n"
          }
          послеИнструмента = false
          сообщения[i].текст += (o["текст"] as? String) ?? ""
        case "инструмент":
          послеИнструмента = true
          if let имя = o["имя"] as? String { сообщения[i].инструменты.append(имя) }
          // Предложение приходит в результате инструмента и НЕ является текстом
          // ответа: показать его абзацем значило бы дать человеку прочитать
          // просьбу и не дать на неё ответить.
          if let р = o["результат"] as? [String: Any], р["предложение"] as? Bool == true {
            сообщения[i].предложение = Предложение(
              действие: р["действие"] as? String ?? "",
              куда: р["куда"] as? String ?? "",
              что: р["что"] as? String,
              пояснение: р["пояснение"] as? String ?? "",
              одобрено: nil
            )
          }
        default: break
        }
      }
    } catch {
      сообщения[i].текст = "Не дошло до сервера: \(error.localizedDescription)"
    }
  }
}

/**
 * Профиль переехал в ProfileScreen.swift и стал нативным целиком.
 *
 * Имя оставлено псевдонимом: на него ссылается таб-бар, и менять две вещи
 * разом — лишний способ ошибиться. Псевдоним уберём, когда останется один
 * вызов.
 */
typealias ProfileView = ProfileScreen

/**
 * Окно подтверждения: последний шаг перед тем, как что-то уйдёт другому человеку.
 *
 * ПОЧЕМУ ЭТО ОТДЕЛЬНЫЙ ВИД, А НЕ СТРОКА В ЛЕНТЕ. Согласие, которое дают не
 * глядя, — не согласие. Адресат и текст показаны ЦЕЛИКОМ и до нажатия: если бы
 * текст сворачивался в «…», человек одобрял бы то, чего не прочитал, а именно
 * это и нужно тому, кто подложил указание в чужое сообщение.
 *
 * Отказ стоит первым и набран обычным весом, одобрение — вторым. Обратный
 * порядок превращает окно в формальность, которую проматывают.
 */
struct ОкноПодтверждения: View {
  let предложение: AgentChatView.Предложение
  let ответить: (Bool) -> Void

  private var заголовок: String {
    switch предложение.действие {
    case "send": return "Отправить сообщение?"
    case "forward": return "Переслать?"
    case "read": return "Пометить прочитанным?"
    default: return "Подтвердить действие?"
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(заголовок)
        .font(.headline)
        .foregroundStyle(Тема.Цвет.текст)

      HStack(spacing: 6) {
        Text("Кому").foregroundStyle(Тема.Цвет.текстПриглушённый)
        Text(предложение.куда)
          .foregroundStyle(Тема.Цвет.акцент)
          .textSelection(.enabled)
      }
      .font(.subheadline)

      if let что = предложение.что, !что.isEmpty {
        // Целиком и с возможностью выделить: человек должен иметь возможность
        // перечитать и скопировать то, что уйдёт от его имени.
        Text(что)
          .font(.body)
          .foregroundStyle(Тема.Цвет.текст)
          .textSelection(.enabled)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(12)
          .background(Тема.Цвет.карточка, in: RoundedRectangle(cornerRadius: 10))
      }

      Text(предложение.пояснение)
        .font(.caption)
        .foregroundStyle(Тема.Цвет.текстПриглушённый)

      HStack(spacing: 10) {
        Button("Не отправлять") { ответить(false) }
          .buttonStyle(.bordered)
          .frame(minHeight: 44)

        Button("Отправить") { ответить(true) }
          .buttonStyle(.borderedProminent)
          .frame(minHeight: 44)
      }
      .font(.subheadline)
    }
    .padding(16)
    .background(Тема.Цвет.поверхность, in: RoundedRectangle(cornerRadius: 14))
    .overlay(
      RoundedRectangle(cornerRadius: 14)
        .stroke(Тема.Цвет.предупреждение.opacity(0.5), lineWidth: 1)
    )
  }
}
