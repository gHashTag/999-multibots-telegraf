import AVFoundation
import Foundation

/**
 * ОБЩЕЕ ЯДРО ТРЁХ ЭТАПОВ.
 *
 * Владелец попросил все три пути к нативному редактору сразу: нативный
 * таймлайн с веб-предпросмотром, затем нативный предпросмотр, затем полный
 * отказ от Remotion. Сделать их тремя проектами значило бы трижды описать
 * одно и то же — и трижды разойтись в мелочах, из-за которых человек видит
 * одно, а получает другое.
 *
 * Поэтому модель композиции ОДНА, и от неё расходятся три выхода:
 *
 *   этап А → `TimelineView` рисует эту модель, `remotionJSON()` кормит
 *            веб-предпросмотр тем же, чем кормит финальный рендер;
 *   этап Б → `avComposition()` собирает `AVMutableComposition` для
 *            нативного предпросмотра;
 *   этап В → та же модель становится входом нативного рендера, а
 *            `remotionJSON()` остаётся сверкой: пока оба выхода дают один
 *            кадр, переход безопасен.
 *
 * КЛЮЧИ JSON СОВПАДАЮТ С ВЕБОМ намеренно (`startFrame`, `durationInFrames`,
 * `x/y/width/height`). Это не косметика: как только имена разъедутся,
 * появится слой перевода, а слой перевода — это место, где расхождение
 * заводится и живёт незаметно.
 */

// MARK: - Модель

struct Composition: Codable, Equatable {
  var fps: Int = 30
  var width: Int = 1080
  var height: Int = 1920
  var tracks: [Track] = []
  /// Actual media alignment. Optional keeps older saved projects decodable.
  var captions: [TimedCaption]? = nil
  /// Browser gallery metadata is carried through native edits even though the
  /// native timeline renders media from clip URLs.
  var assets: [SyncedAsset]? = nil
  var captionStyle: SyncedCaptionStyle? = nil
  var showCaptions: Bool? = nil

  /// Длина в кадрах — по самому дальнему клипу.
  var durationInFrames: Int {
    tracks.flatMap(\.items).map { $0.startFrame + $0.durationInFrames }.max() ?? 0
  }

  var duration: CMTime {
    CMTime(value: CMTimeValue(durationInFrames), timescale: CMTimeScale(fps))
  }
}

struct SyncedAsset: Codable, Equatable {
  var id: String
  var type: String
  var name: String
  var url: String
  var thumbnail: String?
  var duration: Int?
  var width: Int?
  var height: Int?
  var fileSize: Int?
}

struct SyncedCaptionStyle: Codable, Equatable {
  var fontSize: Double?
  var textColor: String?
  var highlightColor: String?
  var backgroundColor: String?
  var bottomPercent: Double?
  var maxWidthPercent: Double?
  var fontWeight: Int?
  var showShadow: Bool?
  var fontFamily: String?
  var animation: String?
}

struct TimedCaption: Codable, Equatable {
  var text: String
  var startMs: Int
  var endMs: Int
  var timestampMs: Int
  var confidence: Double?

  func offset(by milliseconds: Int) -> TimedCaption {
    TimedCaption(
      text: text,
      startMs: startMs + milliseconds,
      endMs: endMs + milliseconds,
      timestampMs: timestampMs + milliseconds,
      confidence: confidence
    )
  }
}

struct Track: Codable, Equatable, Identifiable {
  var id: String
  var type: String          // video | audio | image | text | avatar
  var name: String
  var items: [Clip] = []
  var locked: Bool = false
  var visible: Bool = true
  var muted: Bool = false
  var solo: Bool = false
}

struct Clip: Codable, Equatable, Identifiable {
  var id: String
  var trackId: String
  var assetId: String?
  var name: String?
  var type: String?
  var volume: Double?
  var playbackRate: Double?

  var startFrame: Int
  var durationInFrames: Int

  var x: Double = 0
  var y: Double = 0
  var width: Double = 1080
  var height: Double = 1920
  var rotation: Double = 0
  var opacity: Double = 1

  /// Локальный или удалённый источник. У текстовых клипов его нет.
  var url: String?
}

// MARK: - Время

extension Clip {
  func start(fps: Int) -> CMTime {
    CMTime(value: CMTimeValue(startFrame), timescale: CMTimeScale(fps))
  }
  func duration(fps: Int) -> CMTime {
    CMTime(value: CMTimeValue(durationInFrames), timescale: CMTimeScale(fps))
  }
  func range(fps: Int) -> CMTimeRange {
    CMTimeRange(start: start(fps: fps), duration: duration(fps: fps))
  }
}

// MARK: - Этап Б: нативный предпросмотр

enum CompositionBuildError: LocalizedError {
  case нетДорожек
  case нетТреков(String)

  var errorDescription: String? {
    switch self {
    case .нетДорожек:
      return "В композиции нет ни одного клипа с источником"
    case .нетТреков(let url):
      return "У источника нет ни видео-, ни аудиодорожки: \(url)"
    }
  }
}

extension Composition {
  /**
   * Собрать `AVMutableComposition` для нативного предпросмотра.
   *
   * ЧЕСТНАЯ ГРАНИЦА. Это ЧЕРНОВИК, а не финальный кадр: здесь нет ни
   * фильтров Remotion, ни текстовых слоёв, ни произвольных трансформаций —
   * `AVMutableComposition` умеет резать и накладывать, но не рисовать. То,
   * что он показывает, обязано СОВПАДАТЬ ПО ТАЙМИНГУ с финальным рендером,
   * и только по тайммингу.
   *
   * Обещать больше нельзя: предпросмотр, который расходится с результатом,
   * хуже медленного, потому что человек узнаёт о расхождении уже потратив
   * деньги на рендер.
   */
  func avComposition() async throws -> AVMutableComposition {
    let composition = AVMutableComposition()

    var видеоДорожка: AVMutableCompositionTrack?
    var аудиоДорожка: AVMutableCompositionTrack?
    var чтоТоЛегло = false

    for track in tracks where track.visible {
      for clip in track.items {
        guard let raw = clip.url, let url = URL(string: raw) else { continue }
        let asset = AVURLAsset(url: url)

        let видео = try await asset.loadTracks(withMediaType: .video)
        let аудио = try await asset.loadTracks(withMediaType: .audio)
        if видео.isEmpty && аудио.isEmpty {
          throw CompositionBuildError.нетТреков(raw)
        }

        // Берём из источника ровно столько, сколько длится клип, но не
        // больше, чем в нём есть: иначе insertTimeRange бросает, и один
        // короткий файл рушит сборку всей композиции.
        let длинаИсточника = try await asset.load(.duration)
        let нужно = clip.duration(fps: fps)
        let берём = CMTimeRange(
          start: .zero,
          duration: CMTimeMinimum(нужно, длинаИсточника)
        )

        if let src = видео.first {
          if видеоДорожка == nil {
            видеоДорожка = composition.addMutableTrack(
              withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
          }
          try видеоДорожка?.insertTimeRange(
            берём, of: src, at: clip.start(fps: fps))
          чтоТоЛегло = true
        }

        if let src = аудио.first, !track.muted {
          if аудиоДорожка == nil {
            аудиоДорожка = composition.addMutableTrack(
              withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
          }
          try аудиоДорожка?.insertTimeRange(
            берём, of: src, at: clip.start(fps: fps))
          чтоТоЛегло = true
        }
      }
    }

    guard чтоТоЛегло else { throw CompositionBuildError.нетДорожек }
    return composition
  }
}

// MARK: - Этапы А и В: один JSON на предпросмотр и на рендер

extension Composition {
  /**
   * Тот же JSON, что уходит в веб-предпросмотр и в финальный рендер.
   *
   * На этапе А им кормится `WKWebView`, на этапе В он остаётся СВЕРКОЙ:
   * пока нативный рендер и Remotion из одного JSON дают один кадр, переход
   * можно вести постепенно. Как только выходы разъедутся — это видно сразу,
   * а не после первого недовольного человека.
   */
  func remotionJSON() throws -> Data {
    let enc = JSONEncoder()
    enc.outputFormatting = [.sortedKeys]  // стабильный порядок — сверяемо
    return try enc.encode(self)
  }

  static func from(json: Data) throws -> Composition {
    try JSONDecoder().decode(Composition.self, from: json)
  }
}
