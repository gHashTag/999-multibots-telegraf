import SwiftUI

/**
 THE HIVE -- THE GAME, AS A TAB ON THE PHONE.

 Owner, 2026-09-07: "the game is https://t27.ai/#/queen", "add the game tab on
 iOS too".

 The six sub-tabs are HER six, in her own menu order, and they match the web
 tab one for one: comb, specs, kanban, mission, factory, tree. Two clients
 showing the same board under different names would force anybody moving
 between them to translate.

 WHAT THIS IS NOT

 It is not a copy of her 3-D scene -- that is a Babylon.js application, and a
 second implementation drifts from the first the day either changes. This is
 the same data, read live, laid out for a phone.

 TWO LANGUAGES, ENGLISH BY DEFAULT

 The rest of this app is hard-coded Russian: there is no `.strings` file, no
 `NSLocalizedString`, not one `Locale.current` in any screen. Introducing app
 wide localisation is a separate piece of work (issue #2136). This screen does
 the contained version -- its own small dictionary, English unless the phone
 asks for Russian -- so the tab matches the web, where English is already the
 default, instead of inheriting a hard-coded language it would then have to be
 dug out of later.
 */

/// English unless the phone's preferred language is Russian. Same rule as the
/// web's `getInitialLanguage`, which returns 'en' unless the browser asks.
let speaksRussian: Bool =
  Locale.preferredLanguages.first?.hasPrefix("ru") ?? false

/// Not private: the tab bar label in VibeeApp.swift needs it too, and a second
/// copy of the language rule there would drift from this one.
func say(_ en: String, _ ru: String) -> String {
  speaksRussian ? ru : en
}

enum HiveTab: String, CaseIterable, Identifiable {
  case comb, specs, kanban, mission, factory, tree
  var id: String { rawValue }

  var title: String {
    switch self {
    case .comb: return say("Comb", "Соты")
    case .specs: return say("Specs", "Спеки")
    case .kanban: return say("Kanban", "Канбан")
    case .mission: return say("Mission", "Карта")
    case .factory: return say("Factory", "Фабрика")
    case .tree: return say("Tree", "Дерево")
    }
  }

  var blurb: String {
    switch self {
    case .comb: return say("the board as a field of marks", "доска как поле меток")
    case .specs:
      return say("the corpus she is generated from", "корпус, из которого она собрана")
    case .kanban: return say("operational columns", "рабочие колонки")
    case .mission: return say("strategic lifecycle sectors", "сектора жизненного цикла")
    case .factory: return say("live engineering production", "живое производство")
    case .tree: return say("canonical evidence graph", "граф подтверждённых знаний")
    }
  }
}

/**
 Loading state that keeps "empty" and "did not answer" apart.

 A panel showing zeros while the Queen is unreachable is the single worst thing
 a status screen can do: a dead service then reads as a quiet week.
 */
@MainActor
final class HiveLoader<T>: ObservableObject {
  @Published var value: T?
  @Published var failure: String?
  @Published var loading = false

  func load(_ work: @escaping () async throws -> T) async {
    loading = true
    failure = nil
    do {
      value = try await work()
    } catch {
      value = nil
      failure = error.localizedDescription
    }
    loading = false
  }
}

// MARK: - Small building blocks, so the six panels read the same

private struct Stat: View {
  let number: String
  let caption: String

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(number)
        .font(Typeface.style(.title3, .semibold))
        .foregroundStyle(Palette.text)
      Text(caption)
        .font(Typeface.style(.caption2))
        .foregroundStyle(Palette.textMuted)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(Space.md)
    .background(Palette.surface, in: RoundedRectangle(cornerRadius: Corner.xl))
  }
}

private struct SectionCard<Content: View>: View {
  let title: String
  var count: Int?
  @ViewBuilder let content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: Space.sm) {
      HStack(spacing: 6) {
        Text(title).font(Typeface.style(.subheadline, .semibold))
        if let count {
          Text("\(count)")
            .font(Typeface.style(.caption2))
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .background(Palette.secondary, in: Capsule())
        }
      }
      .foregroundStyle(Palette.text)
      content
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(Space.md)
    .background(Palette.surface, in: RoundedRectangle(cornerRadius: Corner.xl))
  }
}

private struct Note: View {
  let text: String
  var body: some View {
    Text(text)
      .font(Typeface.style(.caption))
      .foregroundStyle(Palette.textMuted)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// Shown instead of a panel when the Queen did not answer. Visually distinct
/// from an empty panel on purpose.
private struct Unreachable: View {
  let why: String?

  var body: some View {
    VStack(alignment: .leading, spacing: Space.sm) {
      Text(say("The Queen did not answer", "Королева не ответила"))
        .font(Typeface.style(.subheadline, .semibold))
        .foregroundStyle(Palette.text)
      Text(
        say(
          "This does not mean the hive is quiet — it means we cannot see it right now.",
          "Это не значит, что в улье тихо — значит, что мы его сейчас не видим."
        ) + (why.map { " (\($0))" } ?? "")
      )
      .font(Typeface.style(.caption))
      .foregroundStyle(Palette.textMuted)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(Space.md)
    .overlay(
      RoundedRectangle(cornerRadius: Corner.xl)
        .strokeBorder(Palette.warning, lineWidth: 1)
    )
  }
}

/// Wraps every panel so loading, failure and content are handled in ONE place.
private struct Panel<T, Content: View>: View {
  @ObservedObject var loader: HiveLoader<T>
  @ViewBuilder let content: (T) -> Content

  var body: some View {
    if loader.loading {
      Note(text: say("Asking the Queen…", "Спрашиваем королеву…"))
    } else if let value = loader.value {
      content(value)
    } else {
      Unreachable(why: loader.failure)
    }
  }
}

// MARK: - The six panels

private struct CombPanel: View {
  @StateObject private var loader = HiveLoader<[HiveAPI.Mark]>()

  var body: some View {
    Panel(loader: loader) { marks in
      VStack(spacing: Space.sm) {
        if marks.isEmpty {
          Note(text: say("No marks — the board is quiet.", "Отметок нет — на доске тихо."))
        }
        ForEach(marks) { m in
          HStack(alignment: .top, spacing: Space.sm) {
            Text(m.kind)
              .font(Typeface.style(.caption2))
              .padding(.horizontal, 7)
              .padding(.vertical, 2)
              .background(
                m.state == "refused"
                  ? Palette.warning.opacity(0.3) : Palette.secondary,
                in: Capsule()
              )
            Text(m.title)
              .font(Typeface.style(.caption))
              .frame(maxWidth: .infinity, alignment: .leading)
            if m.issue > 0 {
              Text("#\(m.issue)")
                .font(Typeface.style(.caption2))
                .foregroundStyle(Palette.textMuted)
                .monospacedDigit()
            }
          }
          .foregroundStyle(Palette.text)
          .padding(Space.md)
          .background(Palette.surface, in: RoundedRectangle(cornerRadius: Corner.lg))
        }
      }
    }
    .task { await loader.load { try await HiveAPI.marks() } }
  }
}

private struct KanbanPanel: View {
  @StateObject private var loader = HiveLoader<HiveAPI.Board>()

  var body: some View {
    Panel(loader: loader) { board in
      VStack(alignment: .leading, spacing: Space.md) {
        Note(text: board.repo)
        ForEach(board.columns) { column in
          SectionCard(title: column.title, count: column.count) {
            Note(text: column.blurb)
            ForEach(board.cards.filter { $0.column == column.key }.prefix(6)) { card in
              HStack(alignment: .top, spacing: 6) {
                Text("#\(card.id)")
                  .font(Typeface.style(.caption2))
                  .foregroundStyle(Palette.textMuted)
                  .monospacedDigit()
                Text(card.title).font(Typeface.style(.caption))
              }
              .foregroundStyle(Palette.text)
              .frame(maxWidth: .infinity, alignment: .leading)
            }
            if column.count > 6 {
              Note(
                text: speaksRussian
                  ? "и ещё \(column.count - 6)" : "and \(column.count - 6) more")
            }
          }
        }
      }
    }
    .task { await loader.load { try await HiveAPI.board() } }
  }
}

private struct FactoryPanel: View {
  @StateObject private var loader = HiveLoader<HiveAPI.Factory>()

  var body: some View {
    Panel(loader: loader) { f in
      VStack(alignment: .leading, spacing: Space.md) {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 96), spacing: Space.sm)],
                  spacing: Space.sm) {
          Stat(number: "\(f.active)/\(f.capacity)", caption: say("bees busy", "пчёл занято"))
          Stat(number: f.swarmState, caption: say("swarm state", "состояние роя"))
          if f.tickSeconds > 0 {
            Stat(number: "\(f.tickSeconds)s", caption: say("round step", "шаг круга"))
          }
          Stat(number: "\(f.skipped)", caption: say("skipped", "пропущено"))
        }
        if f.signedKeyId.isEmpty {
          Note(
            text: say(
              "The foundry did not report a signature.", "Литейная не ответила о подписи."))
        } else {
          // Assembled from parts rather than one interpolated literal: the
          // no-cyrillic guard strips whole quoted strings, and a `say()` call
          // nested inside an interpolation hides its quotes from that pass.
          let signedLabel = say("Foundry signed", "Литейная подписана")
          let keyWord = say("key", "ключ")
          Note(
            text: signedLabel + ": " + f.signedAlgorithm + ", "
              + keyWord + " " + f.signedKeyId)
        }
        if !f.lastTickAt.isEmpty {
          Note(text: say("Last round: ", "Последний круг: ") + f.lastTickAt)
        }
      }
    }
    .task { await loader.load { try await HiveAPI.factory() } }
  }
}

private struct TreePanel: View {
  @StateObject private var loader = HiveLoader<HiveAPI.Tree>()

  var body: some View {
    Panel(loader: loader) { t in
      VStack(alignment: .leading, spacing: Space.md) {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 84), spacing: Space.sm)],
                  spacing: Space.sm) {
          Stat(number: "\(t.percentage)%", caption: say("studied", "изучено"))
          Stat(number: "\(t.researched)", caption: say("done", "готово"))
          Stat(number: "\(t.researching)", caption: say("in progress", "в работе"))
          Stat(number: "\(t.locked)", caption: say("locked", "закрыто"))
        }
        ForEach(t.layers, id: \.self) { layer in
          let nodes = t.nodes.filter { $0.layer == layer }
          if !nodes.isEmpty {
            SectionCard(title: layer, count: nodes.count) {
              ForEach(nodes) { n in
                HStack(alignment: .top, spacing: 6) {
                  Text(n.state)
                    .font(Typeface.style(.caption2))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 1)
                    .background(
                      n.state == "researched"
                        ? Palette.accent.opacity(0.26) : Palette.secondary,
                      in: Capsule()
                    )
                  Text(n.label).font(Typeface.style(.caption))
                }
                .foregroundStyle(Palette.text)
                .frame(maxWidth: .infinity, alignment: .leading)
              }
            }
          }
        }
      }
    }
    .task { await loader.load { try await HiveAPI.tree() } }
  }
}

private struct MissionPanel: View {
  @StateObject private var loader = HiveLoader<HiveAPI.Mission>()

  var body: some View {
    Panel(loader: loader) { m in
      VStack(alignment: .leading, spacing: Space.md) {
        let closedLabel = say("closed issues", "закрытых задач")
        Note(text: m.repo + " · " + closedLabel + ": " + String(m.closedIssues))
        if !m.rule.isEmpty {
          Text(m.rule)
            .font(Typeface.style(.caption))
            .foregroundStyle(Palette.text)
            .padding(Space.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
              Palette.surface, in: RoundedRectangle(cornerRadius: Corner.lg))
        }
        SectionCard(title: say("Epics", "Эпики"), count: m.epics.count) {
          ForEach(m.epics) { e in
            HStack(alignment: .top, spacing: 6) {
              if !e.ring.isEmpty {
                Text(e.ring)
                  .font(Typeface.style(.caption2))
                  .padding(.horizontal, 6)
                  .padding(.vertical, 1)
                  .background(Palette.secondary, in: Capsule())
              }
              Text(e.title).font(Typeface.style(.caption))
            }
            .foregroundStyle(Palette.text)
            .frame(maxWidth: .infinity, alignment: .leading)
          }
          // The cap is stated rather than silently applied: a list that quietly
          // stops at forty reads as "that is all there is".
          Note(text: say("Showing the first 40.", "Показаны первые 40."))
        }
      }
    }
    .task { await loader.load { try await HiveAPI.mission() } }
  }
}

private struct SpecsPanel: View {
  @StateObject private var loader = HiveLoader<HiveAPI.Specs>()

  var body: some View {
    Panel(loader: loader) { s in
      VStack(alignment: .leading, spacing: Space.md) {
        // The mission, stated where the numbers are.
        Text(
          say(
            "The goal of the game is that files are generated from t27 specs rather than written by hand. Below: how many exist and what state they are in.",
            "Цель игры — чтобы файлы не писались руками, а порождались из спецификаций t27. Ниже — сколько их уже есть и в каком они состоянии."
          )
        )
        .font(Typeface.style(.caption))
        .foregroundStyle(Palette.text)
        .padding(Space.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.surface, in: RoundedRectangle(cornerRadius: Corner.lg))

        LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), spacing: Space.sm)],
                  spacing: Space.sm) {
          Stat(number: "\(s.specCount)", caption: say("specs", "спецификаций"))
          Stat(
            number: s.totalLines.formatted(.number.grouping(.automatic)),
            caption: say("lines", "строк"))
          Stat(number: "\(s.ok)", caption: say("healthy", "здоровы"))
          Stat(number: "\(s.warn)", caption: say("warnings", "замечания"))
          Stat(number: "\(s.fail)", caption: say("need a person", "нужен человек"))
        }

        SectionCard(title: say("Engines", "Движки")) {
          ForEach(s.engines) { e in
            HStack {
              Text(e.repo).font(Typeface.style(.caption))
              Spacer()
              Text("\(e.specs)")
                .font(Typeface.style(.caption2))
                .padding(.horizontal, 6)
                .background(Palette.secondary, in: Capsule())
            }
            .foregroundStyle(Palette.text)
          }
          // Said plainly rather than shown as a made-up percentage.
          Note(
            text: say(
              "The covered-by-t27 / hand-written split lives on the 3-D board: it cannot honestly be derived from these files, because spec names and repository paths do not match.",
              "Разметка «покрыто t27 / написано руками» живёт на объёмной доске: свести её из этих файлов честно нельзя — имена спецификаций и пути в репозитории не совпадают."
            ))
        }
      }
    }
    .task { await loader.load { try await HiveAPI.specs() } }
  }
}

// MARK: - The screen

struct HiveScreen: View {
  @State private var tab: HiveTab = .comb

  var body: some View {
    VStack(spacing: 0) {
      /*
       Sub-tabs scroll horizontally. Six of them do not fit a phone, and
       shrinking the text until they do makes every one unreadable. The chip
       style matches GenerateScreen: an outlined active chip, never a filled
       one -- the accent fill in this app means "you can press this".
       */
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: Space.sm) {
          ForEach(HiveTab.allCases) { t in
            Button { tab = t } label: {
              Text(t.title)
                .font(Typeface.style(.subheadline, .medium))
                .foregroundStyle(tab == t ? Palette.text : Palette.textInactive)
                .padding(.horizontal, Space.chip)
                // Explicit height, not "whatever padding gives": padding is
                // not a size, and 44pt is the touch minimum.
                .frame(minHeight: Touch.minimum)
                .overlay(
                  RoundedRectangle(cornerRadius: Corner.lg)
                    .strokeBorder(
                      tab == t ? Palette.selected : Color.clear, lineWidth: 1)
                )
            }
          }
        }
        .padding(.horizontal, Space.md)
      }
      .padding(.vertical, Space.sm)

      ScrollView {
        VStack(alignment: .leading, spacing: Space.md) {
          Note(text: tab.blurb)

          // Each panel is its own view with its own `.task`, so a sub-tab
          // fetches only when it is opened. The spec corpus alone is 759 KB.
          switch tab {
          case .comb: CombPanel()
          case .specs: SpecsPanel()
          case .kanban: KanbanPanel()
          case .mission: MissionPanel()
          case .factory: FactoryPanel()
          case .tree: TreePanel()
          }

          // The 3-D board is not reimplemented here; it is one tap away.
          Link(
            say("Open the 3-D board on t27.ai →", "Открыть объёмную доску на t27.ai →"),
            destination: URL(string: "https://t27.ai/#/queen")!
          )
          .font(Typeface.style(.subheadline))
          .foregroundStyle(Palette.accent)
          .frame(minHeight: Touch.minimum)
        }
        .padding(Space.md)
      }
    }
    .background(Palette.background.ignoresSafeArea())
  }
}
