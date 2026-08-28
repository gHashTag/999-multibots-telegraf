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
            LazyVStack(alignment: .leading, spacing: 14) {
              ForEach(сообщения) { m in
                VStack(alignment: m.свой ? .trailing : .leading, spacing: 6) {
                  if !m.инструменты.isEmpty {
                    // Показываем, ЧЕМ агент проверял. Это и есть доверие:
                    // человек видит, что ответ не выдуман.
                    HStack(spacing: 6) {
                      ForEach(m.инструменты, id: \.self) { и in
                        Text(и).font(.caption2.monospaced())
                          .padding(.horizontal, 7).padding(.vertical, 3)
                          .background(.green.opacity(0.15), in: Capsule())
                          .foregroundStyle(.green)
                      }
                    }
                  }
                  Text(m.текст)
                    .padding(12)
                    .background(m.свой ? .green.opacity(0.2) : .white.opacity(0.07),
                                in: RoundedRectangle(cornerRadius: 14))
                }
                .frame(maxWidth: .infinity, alignment: m.свой ? .trailing : .leading)
                .id(m.id)
              }
            }
            .padding(16)
          }
          .onChange(of: сообщения.count) {
            withAnimation { proxy.scrollTo(сообщения.last?.id, anchor: .bottom) }
          }
        }

        HStack(spacing: 10) {
          TextField("Спроси агента…", text: $ввод, axis: .vertical)
            .textFieldStyle(.plain)
            .padding(12)
            .background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 20))
          Button {
            Task { await отправить() }
          } label: {
            Image(systemName: идёт ? "stop.circle.fill" : "arrow.up.circle.fill")
              .font(.title)
          }
          .disabled(ввод.isEmpty || идёт)
          .tint(.green)
        }
        .padding(12)
      }
      .navigationTitle("Агент")
      .navigationBarTitleDisplayMode(.inline)
      .background(Color.black)
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

struct ProfileView: View {
  @State private var ключ = Identity.agentKey ?? ""
  @State private var сохранён = false

  var body: some View {
    VStack(spacing: 0) {
      /**
       * Ключ доступа — НАД вебом, а не внутри него.
       *
       * Веб-профиль на app.t27.ai живёт своей жизнью и про наш ключ ничего не
       * знает. Прятать поле внутрь вебвью значило бы просить человека искать
       * настройку приложения на странице сайта.
       *
       * Секция сворачивается, когда ключ уже есть: настройка, которую делают
       * один раз, не должна занимать экран каждый день.
       */
      DisclosureGroup(isExpanded: .constant(!Identity.known)) {
        VStack(alignment: .leading, spacing: 10) {
          Text("Ключ привязан к вашему Telegram на стороне сервера и хранится "
               + "только на этом устройстве, в Keychain.")
            .font(.caption)
            .foregroundStyle(.white.opacity(0.55))

          SecureField("ключ агента", text: $ключ)
            .textFieldStyle(.roundedBorder)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()

          HStack {
            Button("Сохранить") {
              let обрезанный = ключ.trimmingCharacters(in: .whitespacesAndNewlines)
              Identity.agentKey = обрезанный.isEmpty ? nil : обрезанный
              сохранён = true
            }
            .buttonStyle(.borderedProminent)
            .tint(.green)
            .disabled(ключ.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

            if сохранён {
              Label("сохранён", systemImage: "checkmark.circle.fill")
                .font(.caption)
                .foregroundStyle(.green)
            }
            Spacer()
          }
        }
        .padding(.top, 8)
      } label: {
        Label(
          Identity.known ? "Доступ настроен" : "Нужен ключ доступа",
          systemImage: Identity.known ? "checkmark.shield" : "exclamationmark.shield"
        )
        .font(.subheadline.weight(.medium))
        .foregroundStyle(Identity.known ? .green : .orange)
      }
      .tint(.green)
      .padding(14)
      .background(Color.white.opacity(0.05))

      WebScreen(path: "/profile")
    }
    .background(Color.black)
  }
}
