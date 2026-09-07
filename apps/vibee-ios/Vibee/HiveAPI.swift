import Foundation

/**
 THE HIVE -- THE GAME'S DATA, READ STRAIGHT FROM THE QUEEN.

 Owner, 2026-09-07: "the game is https://t27.ai/#/queen", "add the game tab on
 iOS too".

 WHY THIS FILE DOES NOT GO THROUGH `API`

 Everything else in this app talks to our own render service and carries the
 person's identity. The hive talks to two OTHER origins and carries no identity
 at all:

   trios-agent-server-production.up.railway.app/queen/…   live swarm state
   t27.ai/queen/foundation.json, t27.ai/t27/manifest.json  generated corpora

 Routing them through `API` would mean either sending our credentials to
 somebody else's host, or growing a second identity-free path inside a type
 whose whole job is to carry identity. Both are worse than a small separate
 client.

 WHY IT IS OPEN TO EVERYONE

 The web tab made the same call and the reasoning holds here: the source page
 is public with no authentication, so showing it reveals nothing a browser did
 not already show anybody. The `hive_queen` AGENT TOOL stays keeper-only,
 because that one answers inside a chat where a person's own money is discussed.

 SILENCE IS NOT ZERO

 Every loader either returns data or throws. A panel showing zeros while the
 Queen is unreachable is the single worst thing a status screen can do, so the
 screen distinguishes the two and says which.
 */
enum HiveAPI {
  private static let queen = "https://trios-agent-server-production.up.railway.app"
  private static let t27 = "https://t27.ai"

  /**
   How long to wait.

   Short on purpose: this is a status panel on a phone, often on mobile data.
   An answer after twenty seconds is not an answer, it is a frozen tab.
   */
  private static let timeout: TimeInterval = 8

  enum HiveError: LocalizedError {
    case badURL
    case http(Int)

    var errorDescription: String? {
      switch self {
      case .badURL: return "bad address"
      case .http(let code): return "the Queen answered \(code)"
      }
    }
  }

  private static func get(_ url: String) async throws -> [String: Any] {
    guard let u = URL(string: url) else { throw HiveError.badURL }
    var request = URLRequest(url: u)
    request.timeoutInterval = timeout
    let (data, response) = try await URLSession.shared.data(for: request)
    if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
      throw HiveError.http(http.statusCode)
    }
    let parsed = try JSONSerialization.jsonObject(with: data)
    return parsed as? [String: Any] ?? [:]
  }

  /**
   Defang text written by another system.

   Not about injection -- SwiftUI renders text as text. It is about a title
   with newlines wrecking a row, and a four-thousand-character "evidence"
   field pushing everything else off the screen.
   */
  static func clean(_ raw: Any?, _ max: Int = 160) -> String {
    let s = (raw as? String ?? "")
      .replacingOccurrences(of: "\n", with: " ")
      .replacingOccurrences(of: "\t", with: " ")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    return s.count > max ? String(s.prefix(max)) + "…" : s
  }

  private static func int(_ any: Any?) -> Int {
    if let i = any as? Int { return i }
    if let d = any as? Double { return Int(d) }
    if let s = any as? String { return Int(s) ?? 0 }
    return 0
  }

  // MARK: - Factory

  struct Factory {
    let swarmState: String
    let capacity: Int
    let active: Int
    let tickSeconds: Int
    let skipped: Int
    let lastTickAt: String
    /// The foundry payload is signed; we carry the FACT, not the key material.
    let signedAlgorithm: String
    let signedKeyId: String
  }

  static func factory() async throws -> Factory {
    let s = try await get("\(queen)/queen/status")
    let workers = s["workers"] as? [String: Any] ?? [:]
    let scheduler = s["scheduler"] as? [String: Any] ?? [:]
    let tick = s["lastTick"] as? [String: Any] ?? [:]

    /*
     The foundry is asked SEPARATELY and is allowed to fail.

     The swarm status is what the panel is for; the signature is a detail. If a
     missing detail blanked the panel, one flaky endpoint would hide the four
     numbers people actually came to see.
     */
    var algorithm = ""
    var keyId = ""
    if let hardware = try? await get("\(queen)/queen/public-hardware") {
      algorithm = clean(hardware["algorithm"], 40)
      keyId = clean(hardware["keyId"], 40)
    }

    return Factory(
      swarmState: clean(s["swarmState"], 40),
      capacity: int(workers["capacity"]),
      active: int(workers["active"]),
      tickSeconds: int(scheduler["intervalSeconds"]),
      skipped: int(tick["skippedCount"]),
      lastTickAt: clean(tick["decidedAt"], 40),
      signedAlgorithm: algorithm,
      signedKeyId: keyId
    )
  }

  // MARK: - Board (comb and kanban share one source)

  struct Card: Identifiable {
    let id: Int
    let title: String
    let column: String
  }

  struct Column: Identifiable {
    var id: String { key }
    let key: String
    let title: String
    let blurb: String
    let count: Int
  }

  struct Board {
    let repo: String
    let columns: [Column]
    let cards: [Card]
  }

  static func board() async throws -> Board {
    let d = try await get("\(queen)/queen/public-board")
    let rawCards = d["cards"] as? [[String: Any]] ?? []
    let cards = rawCards.map {
      Card(id: int($0["number"]), title: clean($0["title"]), column: clean($0["column"], 30))
    }
    /*
     The columns come from HER, in her order. Hard-coding the six names would
     mean a seventh column appears on her board and silently vanishes from ours
     -- taking its cards with it.
     */
    let rawColumns = d["columns"] as? [[String: Any]] ?? []
    let columns = rawColumns.map { c -> Column in
      let key = clean(c["key"], 30)
      return Column(
        key: key,
        title: clean(c["title"], 40),
        blurb: clean(c["blurb"], 80),
        count: cards.filter { $0.column == key }.count
      )
    }
    return Board(repo: clean(d["repo"], 60), columns: columns, cards: cards)
  }

  // MARK: - Comb marks

  struct Mark: Identifiable {
    let id = UUID()
    let kind: String
    let issue: Int
    let title: String
    let state: String
  }

  static func marks() async throws -> [Mark] {
    let d = try await get("\(queen)/queen/public-activity")
    let events = d["events"] as? [[String: Any]] ?? []
    return events.prefix(40).map {
      Mark(
        kind: clean($0["kind"], 30),
        issue: int($0["issue"]),
        title: clean($0["title"]),
        state: clean($0["state"], 30)
      )
    }
  }

  // MARK: - Technology tree

  struct TreeNode: Identifiable {
    let id: String
    let label: String
    let layer: String
    let state: String
  }

  struct Tree {
    let layers: [String]
    let nodes: [TreeNode]
    let percentage: Int
    let researched: Int
    let researching: Int
    let locked: Int
  }

  static func tree() async throws -> Tree {
    let d = try await get("\(queen)/queen/public-research")
    let summary = d["summary"] as? [String: Any] ?? [:]
    let rawNodes = d["nodes"] as? [[String: Any]] ?? []
    return Tree(
      layers: (d["layers"] as? [Any] ?? []).map { clean($0, 30) },
      nodes: rawNodes.map {
        TreeNode(
          id: clean($0["id"], 60),
          label: clean($0["label"], 120),
          layer: clean($0["layer"], 30),
          state: clean($0["state"], 30)
        )
      },
      percentage: int(summary["percentage"]),
      researched: int(summary["researched"]),
      researching: int(summary["researching"]),
      locked: int(summary["locked"])
    )
  }

  // MARK: - Mission map

  struct Epic: Identifiable {
    let id = UUID()
    let title: String
    let ring: String
  }

  struct Mission {
    let repo: String
    let rule: String
    let closedIssues: Int
    let epics: [Epic]
  }

  static func mission() async throws -> Mission {
    let d = try await get("\(t27)/queen/foundation.json")
    let rawEpics = d["epics"] as? [[String: Any]] ?? []
    let closed = d["closedIssues"]
    return Mission(
      repo: clean(d["repo"], 60),
      rule: clean(d["rule"], 200),
      // The list may be an array of issues or already a count; both occur.
      closedIssues: (closed as? [Any])?.count ?? int(closed),
      // Capped: the file is 266 KB and a phone does not need all of it at once.
      // The cap is stated in the UI rather than silently applied.
      epics: rawEpics.prefix(40).map {
        Epic(title: clean($0["title"] ?? $0["name"], 120), ring: clean($0["ring"] ?? $0["layer"], 30))
      }
    )
  }

  // MARK: - Modules (the comb itself)

  /**
   One cell of the comb.

   `openIssues` carries the SAME issue numbers as the kanban board, which is
   what makes the map worth drawing rather than decorative: a cell with issues
   is a place the Queen is working right now, and the number leads to her
   verdict.
   */
  struct Module: Identifiable {
    var id: String { path }
    let path: String
    let language: String
    let lines: Int
    let files: Int
    let functions: Int
    let openIssues: [Int]

    var busy: Bool { !openIssues.isEmpty }
  }

  struct Comb {
    let repo: String
    let modules: [Module]
    var totalLines: Int { modules.reduce(0) { $0 + $1.lines } }
    var busyCount: Int { modules.filter(\.busy).count }
  }

  static func comb() async throws -> Comb {
    let d = try await get("\(t27)/queen/modules.json")
    let raw = d["modules"] as? [[String: Any]] ?? []
    let modules = raw.map { m -> Module in
      Module(
        path: clean(m["path"], 60),
        language: clean(m["language"], 20),
        lines: int(m["lines"]),
        files: int(m["files"]),
        functions: int(m["functions"]),
        openIssues: (m["openIssues"] as? [Any] ?? []).compactMap { int($0) }
      )
    }
    /*
     Biggest first, so the eye lands on the modules that carry the most code.
     A honeycomb has no natural reading order, and leaving it in file order
     would make the map look shuffled every time the generator runs.
     */
    return Comb(
      repo: clean(d["repo"], 60),
      modules: modules.sorted { $0.lines > $1.lines }
    )
  }

  // MARK: - Specs

  struct Engine: Identifiable {
    var id: String { repo }
    let repo: String
    let specs: Int
  }

  struct Specs {
    let specCount: Int
    let totalLines: Int
    let ok: Int
    let warn: Int
    let fail: Int
    let engines: [Engine]
  }

  /**
   The spec corpus. 759 KB.

   Loaded ONLY when this sub-tab is opened, never on screen appear: three
   quarters of a megabyte of somebody's mobile data, for a panel they may never
   look at, is a cost paid by everyone for the benefit of a few.

   NO COVERAGE PERCENTAGE IS COMPUTED HERE. Her comb colours each cell
   T27 COVERED / MANUAL CODE / AWAITING T27, and that split IS the mission. The
   obvious move is to join modules.json (115 modules) against these specs (760).
   Measured 2026-09-07: it does not join. A spec's `module` is a spec name --
   `triformat-tf3`, `CoronaOracle` -- not a repository path, and matching by
   last path segment hits 13 of 115. A number built on that would look
   authoritative and be wrong, and somebody would plan against it.
   */
  static func specs() async throws -> Specs {
    let d = try await get("\(t27)/t27/manifest.json")
    let health = d["health"] as? [String: Any] ?? [:]
    let repos = d["repos"] as? [[String: Any]] ?? []
    return Specs(
      specCount: int(d["specCount"]),
      totalLines: int(d["totalLines"]),
      ok: int(health["ok"]),
      warn: int(health["warn"]),
      fail: int(health["fail"]),
      engines: repos.prefix(20).map { Engine(repo: clean($0["repo"], 40), specs: int($0["specs"])) }
    )
  }
}
