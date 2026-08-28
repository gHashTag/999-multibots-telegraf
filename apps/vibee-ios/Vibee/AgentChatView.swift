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
struct AgentChatView: View {
  @State private var сообщения: [Реплика] = []
  @State private var ввод = ""
  @State private var идёт = false

  struct Реплика: Identifiable {
    let id = UUID()
    var свой: Bool
    var текст: String
    var инструменты: [String] = []
  }

  var body: some View {
    NavigationStack {
      VStack(spacing: 0) {
        ScrollViewReader { proxy in
          ScrollView {
            LazyVStack(alignment: .leading, spacing: Тема.Отступ.пузырьЧата) {
              ForEach(сообщения) { m in
                VStack(alignment: m.свой ? .trailing : .leading, spacing: Тема.Отступ.вкладка) {
                  if !m.инструменты.isEmpty {
                    // Показываем, ЧЕМ агент проверял. Это и есть доверие:
                    // человек видит, что ответ не выдуман.
                    HStack(spacing: Тема.Отступ.вкладка) {
                      ForEach(m.инструменты, id: \.self) { и in
                        Text(и).font(Тема.Шрифт.моно(.caption2))
                          .padding(.horizontal, 7).padding(.vertical, 3)
                          .background(Тема.Цвет.акцент.opacity(0.15), in: Capsule())
                          .foregroundStyle(Тема.Цвет.акцент)
                      }
                    }
                  }
                  Text(m.текст)
                    .padding(Тема.Отступ.списокЛенты)
                    .background(m.свой ? Тема.Цвет.акцент.opacity(0.2) : Тема.Цвет.поверхность,
                                in: RoundedRectangle(cornerRadius: Тема.Радиус.xl))
                }
                .frame(maxWidth: .infinity, alignment: m.свой ? .trailing : .leading)
                .id(m.id)
              }
            }
            .padding(Тема.Отступ.md)
          }
          .onChange(of: сообщения.count) {
            withAnimation { proxy.scrollTo(сообщения.last?.id, anchor: .bottom) }
          }
        }

        HStack(spacing: Тема.Отступ.карточкаЛенты) {
          TextField("Спроси агента…", text: $ввод, axis: .vertical)
            .textFieldStyle(.plain)
            .padding(Тема.Отступ.списокЛенты)
            .background(Тема.Цвет.поверхность, in: RoundedRectangle(cornerRadius: Тема.Радиус.xl))
          Button {
            Task { await отправить() }
          } label: {
            Image(systemName: идёт ? "stop.circle.fill" : "arrow.up.circle.fill")
              .font(Тема.Шрифт.значок(.title))
          }
          .disabled(ввод.isEmpty || идёт)
          // Явные 44: иконка `.title` сама по себе даёт цель около 28.
          .frame(width: Тема.Касание.минимум, height: Тема.Касание.минимум)
          .tint(Тема.Цвет.акцент)
        }
        .padding(Тема.Отступ.списокЛенты)
      }
      .navigationTitle("Агент")
      .navigationBarTitleDisplayMode(.inline)
      .background(Тема.Цвет.фон)
    }
  }

  private func отправить() async {
    let вопрос = ввод
    ввод = ""; идёт = true
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
      r.httpBody = try JSONSerialization.data(
        withJSONObject: ["messages": [["role": "user", "content": вопрос]]])

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
        default: break
        }
      }
    } catch {
      сообщения[i].текст = "Не дошло до сервера: \(error.localizedDescription)"
    }
    идёт = false
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
