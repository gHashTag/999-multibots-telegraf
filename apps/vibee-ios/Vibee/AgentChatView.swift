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

    do {
      var r = URLRequest(url: API.base.appendingPathComponent("api/agent/chat"))
      r.httpMethod = "POST"
      r.setValue("application/json", forHTTPHeaderField: "Content-Type")
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
  var body: some View { WebScreen(path: "/profile") }
}
