import AVFoundation
import CoreMedia
import QuartzCore
import SwiftUI
import UIKit

/**
 * ЭТАП В: один сборщик кадра на предпросмотр и на экспорт.
 *
 * ГЛАВНОЕ, РАДИ ЧЕГО ЭТОТ ФАЙЛ СУЩЕСТВУЕТ, И ГЛАВНАЯ ЛОВУШКА В НЁМ — ОДНО И
 * ТО ЖЕ МЕСТО: `AVVideoCompositionCoreAnimationTool`.
 *
 * Что обещает документация: отдать инструменту `parentLayer`/`videoLayer`,
 * положить videoComposition в `AVAssetExportSession` — и дерево CALayer
 * запечётся в кадры вместе с анимациями. Это правда. Ровно для ЭКСПОРТА.
 *
 * Чего документация не говорит вслух, а SDK упоминает вскользь
 * (AVVideoComposition.h, раздел про animationTool): при ВОСПРОИЗВЕДЕНИИ через
 * `AVPlayerItem` та же конструкция ведёт себя иначе. Причины три, и все три
 * неустранимы со стороны прикладного кода:
 *
 *   1. Часы. Слой в offline-рендере получает время от AVFoundation: тот сам
 *      выставляет локальное время дерева на каждый выдаваемый кадр. При
 *      воспроизведении никто этого не делает — дерево живёт по
 *      `CACurrentMediaTime()`, то есть по настенным часам процесса, а не по
 *      часам плеера. Совпадение начала — случайность первого запуска.
 *   2. Перемотка. Плеер по seek прыгает назад; CoreAnimation назад не умеет.
 *      Анимация, дошедшая до конца, останется в конечном значении, и титр,
 *      который «уже улетел», не вернётся, сколько ни мотай.
 *   3. Цена. Инструмент включает программную композицию всего кадра, и
 *      1080×1920 на 30 fps в реальном времени она не тянет — предпросмотр
 *      начинает дёргаться там, где обычная дорожка идёт с запасом.
 *
 * Поэтому здесь ДВА пути, и оба настоящие:
 *
 *   ЭКСПОРТ  — `videoComposition(for:mode: .export)` вешает animationTool,
 *              дерево слоёв запекается в файл, время задаёт AVFoundation.
 *   ПРЕДПРОСМОТР — `videoComposition(for:mode: .preview)` НЕ вешает
 *              animationTool вовсе; то же самое дерево слоёв кладётся поверх
 *              `AVPlayerLayer` как обычный CALayer, ставится на паузу
 *              (`speed = 0`) и на каждом кадре дисплея подтягивается за часами
 *              плеера через `timeOffset`. Перемотка при этом работает: мы не
 *              «проигрываем» анимацию, а вычисляем её значение в точке.
 *
 * Дерево слоёв в обоих путях СТРОИТ ОДИН И ТОТ ЖЕ `OverlayLayerBuilding`.
 * Это и есть гарантия, что предпросмотр не врёт: расходиться нечему, потому
 * что расходиться нечему физически — код один.
 *
 * ЧЕГО ЭТОТ ФАЙЛ НЕ ДАЁТ (чтобы никто не искал):
 *   • управления битрейтом, профилем кодека и HDR — это `AVAssetWriter`,
 *     а не `AVAssetExportSession`; пресет здесь единственная ручка;
 *   • `object-fit: cover` для видеоклипов — см. комментарий у `трансформация`;
 *   • микширования звука (громкость, фейды) — в модели `Clip` нет поля
 *     громкости, а выдумывать значение хуже, чем не иметь функции;
 *   • перекрытия двух клипов ВНУТРИ одной модельной дорожки — на одну
 *     `AVMutableCompositionTrack` два кадра одновременно не лягут;
 *   • рендера композиции, в которой нет НИ ОДНОГО видеоисточника: AVFoundation
 *     не умеет синтезировать кадры из одного дерева слоёв, ему нужна дорожка,
 *     которую эти слои постобрабатывают. Такой случай честно бросает ошибку.
 */

// MARK: - Контракт со сборщиком слоёв

/**
 * Дерево слоёв поверх видео: титры, картинки, плашки, аватар.
 *
 * Его строит `LayerBuilder` (соседний файл) — там живут запечённые пружины и
 * `CAKeyframeAnimation`. Здесь мы намеренно знаем о нём ровно одно: он умеет
 * вернуть корневой `CALayer` размером с кадр. Протокол, а не прямой вызов,
 * нужен не ради «архитектурности», а чтобы этот файл можно было собрать и
 * проверить отдельно от сборщика анимаций.
 *
 * ТРЕБОВАНИЯ К ВОЗВРАЩАЕМОМУ ДЕРЕВУ (нарушение любого ломает ровно один из
 * двух путей, и всегда молча):
 *
 *   • `beginTime` у КАЖДОЙ анимации — `AVCoreAnimationBeginTimeAtZero + сек`,
 *     никогда не 0. Ноль CoreAnimation трактует как «сейчас» и подменяет его
 *     текущим временем слоя в момент добавления; в экспорте это даёт кадр,
 *     зависящий от того, сколько миллисекунд назад собралось дерево;
 *   • `isRemovedOnCompletion = false` и `fillMode = .both` — иначе после
 *     `duration` свойство скачком вернётся к model value слоя;
 *   • координаты — от ЛЕВОГО ВЕРХНЕГО угла, как в Remotion, а значит корень
 *     обязан САМ выставить `isGeometryFlipped = true`: автономное дерево
 *     CoreAnimation (то, что уходит в видеобуфер, а не на экран) считает Y
 *     снизу вверх, и флаг НЕ НАСЛЕДУЕТСЯ — родитель за корень его не поставит;
 *   • никакого обращения к `UIView`: дерево живёт вне иерархии видов.
 *
 * ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ДВА ПУТИ РАСХОДЯТСЯ, — этот самый флаг, и расходятся
 * они не по недосмотру, а потому что под ними разные системы координат. В
 * экспорте дерево автономно (Y снизу) и флаг нужен. В предпросмотре то же
 * дерево попадает в иерархию `UIView`, где Y уже сверху, и флаг стал бы
 * ВТОРЫМ переворотом — весь оверлей встал бы вверх ногами по вертикали, а
 * видео под ним осталось бы правильным. Поэтому `PreviewOverlay` снимает флаг
 * одной строкой: компенсация в ОДНОМ месте лучше, чем два разных дерева.
 */
protocol OverlayLayerBuilding {
  /// Дерево ЦЕЛИКОМ, вместе с видеослоем, который сборщик поставил на нужное
  /// z-место. Вызывается ОТДЕЛЬНО для каждого рендера: см. `свежееДерево`.
  ///
  /// Раньше протокол возвращал только корень (`CALayer`), а рендер заводил
  /// СВОЙ пустой видеослой и клал его ПОД корень. Корень сборщика несёт
  /// непрозрачный чёрный фон во весь кадр — он закрывал видео целиком, и
  /// экспорт давал чёрный прямоугольник с одними титрами. Сборка при этом
  /// была зелёной: типы сходятся, слои складываются, картинка чёрная.
  ///
  /// Отдавать надо ИМЕННО тот видеослой, который сборщик уже разместил.
  func makeRenderTree(for composition: Composition) -> RenderTree
}

/// Обёртка над замыканием — на случай, когда отдельный тип заводить незачем
/// (тесты, отладочная плашка, экран без титров).
struct ClosureOverlayBuilder: OverlayLayerBuilding {
  private let тело: (Composition) -> RenderTree

  init(_ тело: @escaping (Composition) -> RenderTree) {
    self.тело = тело
  }

  func makeRenderTree(for composition: Composition) -> RenderTree {
    тело(composition)
  }
}

// MARK: - Ошибки

enum NativeRenderError: LocalizedError {
  case пустаяКомпозиция
  case нетВидеоисточника
  case экспортНеПоддерживается(String)
  case экспортПровалился(String)
  case экспортОтменён

  var errorDescription: String? {
    switch self {
    case .пустаяКомпозиция:
      return "Композиция пуста: длительность 0 кадров"
    case .нетВидеоисточника:
      return """
        В композиции нет ни одной видеодорожки-источника. AVFoundation не умеет \
        рендерить видео из одного дерева CALayer — ему нужен кадровый поток, \
        который эти слои постобрабатывают.
        """
    case .экспортНеПоддерживается(let пресет):
      return "Пресет \(пресет) не применим к этой композиции"
    case .экспортПровалился(let текст):
      return "Экспорт не удался: \(текст)"
    case .экспортОтменён:
      return "Экспорт отменён"
    }
  }
}

// MARK: - Рендерер

final class NativeRenderer {

  enum RenderMode {
    /// Офлайн-рендер в файл: вешаем `AVVideoCompositionCoreAnimationTool`.
    case export
    /// Воспроизведение в `AVPlayer`: animationTool НЕ вешаем (см. шапку файла).
    case preview
  }

  let composition: Composition
  private let сборщикСлоёв: OverlayLayerBuilding

  init(composition: Composition, overlayBuilder: OverlayLayerBuilding) {
    self.composition = composition
    self.сборщикСлоёв = overlayBuilder
  }

  var renderSize: CGSize {
    CGSize(width: composition.width, height: composition.height)
  }

  // MARK: Разложенный таймлайн

  /// Один видеоклип, уже положенный на дорожку `AVMutableComposition`.
  /// Метрики источника (`naturalSize`, `preferredTransform`) вытаскиваются
  /// ОДИН РАЗ при сборке таймлайна: и потому, что это async, и потому, что
  /// `videoComposition(for:)` в предпросмотре зовут на каждое изменение
  /// свойств клипа, а грузить метаданные файла на каждый чих — это заикание
  /// интерфейса на ровном месте.
  struct РазмещённыйКлип {
    let clip: Clip
    let порядокДорожки: Int
    let trackID: CMPersistentTrackID
    let началоКадр: Int
    let длинаКадров: Int
    let naturalSize: CGSize
    let preferredTransform: CGAffineTransform
  }

  /// Результат сборки дорожек. Держим вместе с раскладкой: без неё по одному
  /// `AVComposition` уже не восстановить, какой clip где лежит, а
  /// `videoComposition(for:)` без этого не сможет выставить трансформации.
  struct Timeline {
    let asset: AVMutableComposition
    let клипы: [РазмещённыйКлип]
    let длинаКадров: Int
    let fps: Int
  }

  /**
   * Собрать дорожки.
   *
   * ПОЧЕМУ НЕ `Composition.avComposition()`. Тот метод — черновик из этапа Б,
   * и он сознательно плоский: всё сваливается на ОДНУ видеодорожку. Для
   * проверки таймингов этого хватает, для кадра — нет: на одной дорожке
   * невозможны ни перекрытие двух клипов, ни разные трансформации, ни разная
   * непрозрачность, потому что `AVMutableVideoCompositionLayerInstruction`
   * адресуется по trackID. Здесь на КАЖДУЮ модельную дорожку заводится своя
   * дорожка композиции — это ровно то соответствие, которое ожидает человек,
   * когда двигает клип на второй слой поверх первого.
   *
   * Цена: количество дорожек композиции = количеству видимых модельных
   * дорожек. AVFoundation декодирует активные дорожки параллельно, и на
   * старом железе десяток одновременных 4K-потоков её положит. Плата
   * осознанная: альтернатива — не показывать перекрытия вовсе.
   */
  func timeline() async throws -> Timeline {
    guard composition.durationInFrames > 0 else {
      throw NativeRenderError.пустаяКомпозиция
    }

    let av = AVMutableComposition()
    var разложено: [РазмещённыйКлип] = []

    // Solo вычисляется по ВСЕЙ композиции до цикла: solo — это «заглушить
    // остальных», а не «включить себя», и определяется наличием хотя бы
    // одной solo-дорожки. Проверка внутри цикла дала бы разное поведение в
    // зависимости от порядка дорожек — классический источник «у меня же
    // работало».
    let естьSolo = composition.tracks.contains { $0.solo }

    for (индекс, track) in composition.tracks.enumerated() {
      // `locked` намеренно не смотрим: замок — свойство РЕДАКТОРА (запрет
      // тащить мышью), а не рендера. Заблокированная дорожка обязана
      // рендериться, иначе замок молча выкидывает контент из результата.
      guard track.visible else { continue }
      guard !естьSolo || track.solo else { continue }

      var видеоДорожка: AVMutableCompositionTrack?
      var аудиоДорожка: AVMutableCompositionTrack?

      for clip in track.items {
        guard clip.durationInFrames > 0, clip.startFrame >= 0 else { continue }
        guard let сырой = clip.url, let url = URL(string: сырой) else { continue }

        let asset = AVURLAsset(
          url: url,
          options: [AVURLAssetPreferPreciseDurationAndTimingKey: true]
        )

        // Точная длительность нужна не из аккуратности: без неё
        // `insertTimeRange` за концом файла бросает, и один короткий ролик
        // роняет сборку всей композиции.
        let длинаИсточника = try await asset.load(.duration)
        let нужно = clip.duration(fps: composition.fps)
        let берём = CMTimeRange(
          start: .zero,
          duration: CMTimeMinimum(нужно, длинаИсточника)
        )
        guard берём.duration > .zero else { continue }

        let видео = try await asset.loadTracks(withMediaType: .video)
        let аудио = try await asset.loadTracks(withMediaType: .audio)

        // Клип без видео- и аудиодорожек — это не ошибка: так выглядят
        // картинка, текст и аватар-PNG. Их рисует дерево слоёв, а не
        // AVFoundation. Бросать здесь исключение (как делает черновой
        // `avComposition()`) значит запретить композиции с картинками.
        if видео.isEmpty && аудио.isEmpty { continue }

        if track.type != "audio", let источник = видео.first {
          if видеоДорожка == nil {
            видеоДорожка = av.addMutableTrack(
              withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)
          }
          if let цель = видеоДорожка {
            try цель.insertTimeRange(берём, of: источник, at: clip.start(fps: composition.fps))

            let метрики = try await источник.load(.naturalSize, .preferredTransform)
            // Реальная длина на таймлайне может быть КОРОЧЕ модельной, если
            // файл короче клипа. Сегменты инструкций строим по факту, иначе
            // последний сегмент окажется без кадров и AVFoundation отдаст
            // чёрное вместо ожидаемого хвоста.
            let фактическихКадров = Int(
              (CMTimeGetSeconds(берём.duration) * Double(composition.fps)).rounded()
            )
            разложено.append(
              РазмещённыйКлип(
                clip: clip,
                порядокДорожки: индекс,
                trackID: цель.trackID,
                началоКадр: clip.startFrame,
                длинаКадров: max(1, min(clip.durationInFrames, фактическихКадров)),
                naturalSize: метрики.0,
                preferredTransform: метрики.1
              )
            )
          }
        }

        if let источник = аудио.first, !track.muted {
          if аудиоДорожка == nil {
            аудиоДорожка = av.addMutableTrack(
              withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
          }
          try аудиоДорожка?.insertTimeRange(
            берём, of: источник, at: clip.start(fps: composition.fps))
        }
      }
    }

    guard !разложено.isEmpty else { throw NativeRenderError.нетВидеоисточника }

    /**
     * ДОБИВАЕМ КОМПОЗИЦИЮ ДО ДЛИНЫ МОДЕЛИ.
     *
     * `AVMutableComposition` длится ровно столько, сколько в неё вставили
     * ИСТОЧНИКОВ. Всё, что рисуется слоями и не имеет своего видеофайла —
     * хвостовая заставка, титр после последнего кадра, статичный логотип —
     * в эту длину не входит. Такой хвост просто не попадал в файл: человек
     * видел его в предпросмотре и не находил в экспорте.
     *
     * Авторитет здесь у МОДЕЛИ, а не у суммы источников: `durationInFrames`
     * — это то, что человек собрал на таймлайне. Пустой отрезок в конце
     * ничего не рисует, но задаёт длину, и слои поверх получают своё время.
     */
    let нужнаяДлина = composition.duration
    if av.duration < нужнаяДлина {
      av.insertEmptyTimeRange(
        CMTimeRange(start: av.duration, duration: нужнаяДлина - av.duration))
    }

    return Timeline(
      asset: av,
      клипы: разложено,
      длинаКадров: composition.durationInFrames,
      fps: composition.fps
    )
  }

  // MARK: videoComposition

  /**
   * Собрать `AVMutableVideoComposition` по уже разложенному таймлайну.
   *
   * Метод СИНХРОННЫЙ и чистый — все загрузки метаданных остались в
   * `timeline()`. Это не стилистика: предпросмотр пересобирает
   * videoComposition на каждое перетаскивание клипа, и await внутри означал
   * бы задержку в кадре под пальцем.
   */
  func videoComposition(for timeline: Timeline, mode: RenderMode = .export)
    -> AVMutableVideoComposition
  {
    let vc = AVMutableVideoComposition()
    vc.renderSize = renderSize
    vc.frameDuration = CMTime(value: 1, timescale: CMTimeScale(timeline.fps))
    // renderScale трогать нельзя: значение, отличное от 1, поддерживается
    // ТОЛЬКО при воспроизведении, а при экспорте AVAssetExportSession на нём
    // падает. Один объект на оба пути — значит 1.0 всегда.
    vc.renderScale = 1.0

    // --- Границы сегментов ---
    // Инструкции обязаны покрывать весь диапазон композиции СПЛОШЬ и без
    // перекрытий — это требование AVFoundation, а не пожелание. Дырка даёт
    // не ошибку, а чёрный кадр в середине ролика, который замечают уже в
    // готовом файле. Поэтому режем по кадрам (целые числа, без накопления
    // ошибки CMTime) и заведомо добавляем 0 и конец.
    var границы = Set<Int>([0, timeline.длинаКадров])
    for к in timeline.клипы {
      границы.insert(min(max(0, к.началоКадр), timeline.длинаКадров))
      границы.insert(min(max(0, к.началоКадр + к.длинаКадров), timeline.длинаКадров))
    }
    let точки = границы.sorted()

    var инструкции: [AVMutableVideoCompositionInstruction] = []

    for i in 0..<max(0, точки.count - 1) {
      let a = точки[i]
      let b = точки[i + 1]
      guard b > a else { continue }

      let инструкция = AVMutableVideoCompositionInstruction()
      инструкция.timeRange = CMTimeRange(
        start: CMTime(value: CMTimeValue(a), timescale: CMTimeScale(timeline.fps)),
        duration: CMTime(value: CMTimeValue(b - a), timescale: CMTimeScale(timeline.fps))
      )
      // Фон непрозрачно-чёрный: если в сегменте нет ни одного клипа (дырка на
      // таймлайне), кадр обязан быть определённым. Прозрачность здесь
      // бессмысленна — итоговый файл всё равно без альфы.
      инструкция.backgroundColor = CGColor(red: 0, green: 0, blue: 0, alpha: 1)
      // Без этого флага animationTool молча не применяется: постобработка
      // выключена — значит и слоёв не будет. Значение по умолчанию true, но
      // ставим явно, потому что цена ошибки — экспорт вообще без титров.
      инструкция.enablePostProcessing = (mode == .export)

      let активные = timeline.клипы.filter {
        $0.началоКадр <= a && $0.началоКадр + $0.длинаКадров >= b
      }

      // ПОРЯДОК НАЛОЖЕНИЯ. В массиве `layerInstructions` ПЕРВЫЙ элемент —
      // ВЕРХНИЙ (front-most). В модели наоборот: как в Remotion, дорожка с
      // бОльшим индексом лежит поверх. Значит сортируем по УБЫВАНИЮ индекса.
      // Ошибка здесь не ломает сборку и не даёт предупреждения — просто
      // фон оказывается поверх переднего плана, и это списывают на «данные
      // кривые». Проверка: два непрозрачных перекрывающихся клипа на
      // соседних дорожках, смотрим, чей виден.
      let порядок = активные.sorted { $0.порядокДорожки > $1.порядокДорожки }

      // `AVMutableVideoCompositionLayerInstruction` создаётся только от
      // `AVAssetTrack` — публичного инициализатора «по trackID» нет. Берём
      // дорожку из самой композиции: это поиск по массиву уже загруженных
      // объектов, без обращения к файлу.
      инструкция.layerInstructions = порядок.compactMap { к in
        guard let дорожка = timeline.asset.track(withTrackID: к.trackID) else { return nil }
        let li = AVMutableVideoCompositionLayerInstruction(assetTrack: дорожка)
        li.setTransform(трансформация(для: к), at: инструкция.timeRange.start)
        li.setOpacity(Float(max(0, min(1, к.clip.opacity))), at: инструкция.timeRange.start)
        return li
      }

      инструкции.append(инструкция)
    }

    vc.instructions = инструкции

    if mode == .export {
      /**
       * ИНСТРУМЕНТ ВЕШАЕМ, ТОЛЬКО ЕСЛИ ЕСТЬ ЧТО РИСОВАТЬ ПОВЕРХ ВИДЕО.
       *
       * Прогон в приложении: композиция из ОДНОГО видеоклипа, экспорт роняет
       * приложение целиком —
       *   EXC_BREAKPOINT в com.apple.coremedia.basicvideocompositor.output,
       *   QuartzCore render_layers -> IOSurfaceCreate -> xpc_api_misuse.
       * То есть падает не сборка композиции, а отрисовка дерева слоёв внутри
       * `AVVideoCompositionCoreAnimationTool`.
       *
       * Для такой композиции инструменту рисовать НЕЧЕГО: клип целиком ушёл в
       * видеодорожку (`videoClipIDs`), накладок нет (`contentLayers` пуст), и
       * дерево состоит из корня и пустого слоя-приёмника. Мы включали
       * постобработку кадра ради нуля слоёв — то есть платили риском и
       * временем за работу, которой нет.
       *
       * Поэтому условие не «обход падения», а восстановленный смысл: нет
       * накладок — нет постобработки. Композиция с титрами инструмент получает
       * ровно как прежде.
       */
      let дерево = свежееДерево()
      if дерево.contentLayers.isEmpty {
        vc.animationTool = nil
      } else {
        дерево.parentLayer.frame = CGRect(origin: .zero, size: renderSize)
        дерево.videoLayer.frame = дерево.parentLayer.bounds
        установитьМасштаб(дерево.parentLayer, 1.0)
        vc.animationTool = дерево.coreAnimationTool()
      }
    }
    // В режиме .preview animationTool НЕ ставим вовсе. Это не экономия — см.
    // шапку файла: в плеере он даёт рассинхрон, ломает перемотку и валит
    // производительность. Слои для предпросмотра отдаёт `makePreviewOverlay()`.

    return vc
  }

  /**
   * Матрица «источник → прямоугольник клипа в кадре».
   *
   * Система координат `AVMutableVideoCompositionLayerInstruction` —
   * ЛЕВЫЙ ВЕРХНИЙ угол, ось Y вниз. Она совпадает с CSS и с моделью
   * (`clip.x/y` от левого верха), поэтому никакого переворота здесь не нужно
   * и делать его нельзя.
   *
   * ВПИСЫВАНИЕ — `contain`, а не `cover`. Две причины, и вторая важнее:
   *   1. `contain` — это дефолт `object-fit` у HTML-элемента `<video>`,
   *      то есть ровно то, что сейчас показывает Remotion. Взять `cover`
   *      значило бы дать другой кадр, чем веб-предпросмотр;
   *   2. честный `cover` требует `setCropRectangle`, а он задаётся в
   *      координатах ИСХОДНОЙ дорожки и применяется ДО трансформации.
   *      Чтобы посчитать этот прямоугольник, надо обратить матрицу вместе с
   *      `preferredTransform` — и при повёрнутом на 90° источнике там ровно
   *      то место, где ошибка не видна на статичном кадре. `cover` в этом
   *      файле НЕ реализован сознательно.
   */
  private func трансформация(для к: РазмещённыйКлип) -> CGAffineTransform {
    // preferredTransform уже включает поворот и сдвиг, приводящие снятое
    // портретом видео к правильной ориентации. После него содержимое
    // занимает прямоугольник (0,0,ow,oh).
    let повёрнутый = к.naturalSize.applying(к.preferredTransform)
    let ow = abs(повёрнутый.width)
    let oh = abs(повёрнутый.height)
    guard ow > 0, oh > 0 else { return к.preferredTransform }

    let tw = CGFloat(к.clip.width)
    let th = CGFloat(к.clip.height)
    let tx = CGFloat(к.clip.x)
    let ty = CGFloat(к.clip.y)
    guard tw > 0, th > 0 else { return к.preferredTransform }

    let s = min(tw / ow, th / oh)
    let dx = tx + (tw - ow * s) / 2
    let dy = ty + (th - oh * s) / 2

    var t = к.preferredTransform
    t = t.concatenating(CGAffineTransform(scaleX: s, y: s))
    t = t.concatenating(CGAffineTransform(translationX: dx, y: dy))

    // Поворот — вокруг ЦЕНТРА прямоугольника клипа, как в CSS
    // (`transform-origin: 50% 50%` по умолчанию). Вокруг начала координат
    // он тоже «работает», просто клип уезжает за кадр, и это списывают на
    // неверные x/y.
    if к.clip.rotation != 0 {
      let угол = CGFloat(к.clip.rotation) * .pi / 180
      let cx = tx + tw / 2
      let cy = ty + th / 2
      let поворот = CGAffineTransform(translationX: -cx, y: -cy)
        .concatenating(CGAffineTransform(rotationAngle: угол))
        .concatenating(CGAffineTransform(translationX: cx, y: cy))
      t = t.concatenating(поворот)
    }

    return t
  }

  // MARK: animationTool (только экспорт)


  /// Новое дерево на каждый вызов — см. ловушку 1 выше. Строим внутри
  /// транзакции с выключенными действиями: любое присваивание свойству
  /// слоя вне иерархии видов иначе порождает НЕЯВНУЮ анимацию длиной 0.25 с,
  /// которая в экспорте наложится поверх явной и даст «мягкий старт» там,
  /// где его никто не закладывал.
  private func свежееДерево() -> RenderTree {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    let дерево = сборщикСлоёв.makeRenderTree(for: composition)
    CATransaction.commit()
    return дерево
  }

  private func установитьМасштаб(_ слой: CALayer, _ масштаб: CGFloat) {
    слой.contentsScale = масштаб
    слой.rasterizationScale = масштаб
    слой.sublayers?.forEach { установитьМасштаб($0, масштаб) }
  }

  // MARK: Предпросмотр

  /**
   * `AVPlayerItem` для предпросмотра — С videoComposition, но БЕЗ animationTool.
   */
  func playerItem(for timeline: Timeline) -> AVPlayerItem {
    let item = AVPlayerItem(asset: timeline.asset)
    item.videoComposition = videoComposition(for: timeline, mode: .preview)
    // Без этого флага seek возвращается «когда декодер успел», и картинка
    // отстаёт от ползунка на кадр-два. Для редактора, где по кадрам и
    // ходят, это разница между «инструмент» и «примерно».
    item.seekingWaitsForVideoCompositionRendering = true
    return item
  }

  /// Наложение поверх `AVPlayerLayer` — второй путь того же дерева слоёв.
  @MainActor
  func makePreviewOverlay() -> PreviewOverlay {
    // Для предпросмотра берём ТОЛЬКО оверлей: видеокадр здесь рисует
    // AVPlayerLayer под нами, а видеослой из дерева закрыл бы его собой.
    let дерево = свежееДерево()
    дерево.videoLayer.removeFromSuperlayer()
    дерево.parentLayer.backgroundColor = nil
    return PreviewOverlay(tree: дерево.parentLayer, renderSize: renderSize)
  }

  /// Всё, что нужно экрану предпросмотра, одним вызовом.
  @MainActor
  func preview() async throws -> (player: AVPlayer, overlay: PreviewOverlay) {
    let t = try await timeline()
    let player = AVPlayer(playerItem: playerItem(for: t))
    let overlay = makePreviewOverlay()
    overlay.attach(to: player)
    return (player, overlay)
  }

  // MARK: Экспорт

  /**
   * Экспорт в файл. Та же `videoComposition`, тот же сборщик слоёв.
   *
   * ПОЧЕМУ ПРЕСЕТ, А НЕ AVAssetWriter. Writer даёт битрейт, профиль и
   * цветовое пространство, но требует своими руками гонять
   * `AVAssetReaderVideoCompositionOutput` и сшивать звук — это отдельный
   * пласт кода со своими режимами отказа. Пока требований к битрейту нет,
   * `AVAssetExportSession` честнее: меньше кода, который может врать.
   *
   * `AVAssetExportPresetPassthrough` здесь невозможен в принципе: passthrough
   * копирует дорожки байтами, а значит игнорирует и videoComposition, и
   * animationTool. Файл получится — только без единого титра.
   */
  func export(
    to url: URL,
    presetName: String = AVAssetExportPresetHighestQuality
  ) async throws {
    let t = try await timeline()
    let vc = videoComposition(for: t, mode: .export)

    // Существующий файл — вторая по частоте причина «экспорт молча не
    // работает»: AVAssetExportSession не перезаписывает, а отказывается.
    let fm = FileManager.default
    try? fm.createDirectory(
      at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    if fm.fileExists(atPath: url.path) {
      try fm.removeItem(at: url)
    }

    guard let session = AVAssetExportSession(asset: t.asset, presetName: presetName) else {
      throw NativeRenderError.экспортНеПоддерживается(presetName)
    }
    session.videoComposition = vc
    session.shouldOptimizeForNetworkUse = true
    /**
     * Длину пишем ЯВНО, а не полагаемся на длину ассета.
     *
     * Без `timeRange` сессия берёт длительность у ассета — и любое
     * расхождение между моделью и суммой источников молча решается в пользу
     * источников. Мы уже добили композицию пустым отрезком выше, но явное
     * указание снимает вопрос совсем: файл длится ровно столько, сколько
     * человек собрал, и ни кадром меньше.
     */
    session.timeRange = CMTimeRange(start: .zero, duration: composition.duration)

    if #available(iOS 18.0, *) {
      // Новый API сам выставляет outputURL/outputFileType — задавать их
      // дополнительно нельзя, он на этом ругается.
      try await session.export(to: url, as: .mp4)
    } else {
      session.outputURL = url
      session.outputFileType = .mp4
      try await устаревшийЭкспорт(session)
    }
  }

  /// Ветка для iOS 17. `exportAsynchronously` объявлен устаревшим в iOS 18,
  /// поэтому вынесен отдельно: предупреждение компилятора живёт в одном
  /// месте и не тонет в общем коде.
  @available(iOS, deprecated: 18.0)
  private func устаревшийЭкспорт(_ session: AVAssetExportSession) async throws {
    // `AVAssetExportSession` помечен NS_SWIFT_NONSENDABLE, а completion
    // приходит на произвольной очереди — компилятор об этом предупреждает и
    // прав в общем случае. Здесь захват безопасен по конструкции: сессия
    // создана строкой выше, наружу не отдана, и к моменту вызова completion
    // экспорт уже завершён, то есть параллельного доступа к ней нет ни
    // одного. Помечаем явно, чтобы предупреждение не осело в сборке навсегда.
    nonisolated(unsafe) let сессия = session
    try await withCheckedThrowingContinuation {
      (продолжение: CheckedContinuation<Void, Error>) in
      сессия.exportAsynchronously {
        switch сессия.status {
        case .completed:
          продолжение.resume()
        case .cancelled:
          продолжение.resume(throwing: NativeRenderError.экспортОтменён)
        default:
          let текст = сессия.error?.localizedDescription ?? "статус \(сессия.status.rawValue)"
          продолжение.resume(throwing: NativeRenderError.экспортПровалился(текст))
        }
      }
    }
  }
}

// MARK: - Наложение слоёв для плеера

/**
 * Дерево слоёв, синхронизированное с часами `AVPlayer`.
 *
 * КАК ЭТО РАБОТАЕТ. Корень сцены ставится на паузу (`speed = 0`). У
 * остановленного слоя локальное время равно `timeOffset` — то есть мы больше
 * не «проигрываем» анимацию, а ВЫЧИСЛЯЕМ её значение в заданной точке.
 * Каждый кадр дисплея берём текущее время плеера и кладём его в `timeOffset`.
 *
 * ЧТО ЭТО ЧИНИТ по сравнению с animationTool в плеере:
 *   • перемотку назад: точка вычисляется, а не проигрывается, поэтому seek
 *     на кадр 0 честно возвращает титр в исходное состояние;
 *   • паузу: плеер стоит — время не меняется — слои стоят;
 *   • скорость: `player.rate` учтён автоматически, мы читаем часы, а не
 *     считаем сами.
 *
 * ЧЕГО ЭТО НЕ ДАЁТ. Опрос идёт по `CADisplayLink`, то есть значение слоёв
 * отстаёт от кадра видео максимум на один тик дисплея (≈8 мс при 120 Гц).
 * В экспорте такого расхождения нет — там время задаёт AVFoundation. Для
 * предпросмотра это ниже порога заметности, но это РЕАЛЬНОЕ отличие двух
 * путей, и если когда-нибудь понадобится покадровая сверка, сверять надо
 * экспорт, а не то, что на экране.
 *
 * УТЕЧКА, ПРО КОТОРУЮ ЗАБЫВАЮТ. `CADisplayLink` УДЕРЖИВАЕТ свою цель. Пока
 * link не остановлен, `deinit` этого объекта не наступит никогда — и
 * полагаться на него нельзя. Единственный способ отпустить — позвать
 * `detach()`; `NativePreview` делает это в `dismantleUIView`.
 */
@MainActor
final class PreviewOverlay: NSObject {

  /// Слой, который надо положить поверх `AVPlayerLayer`.
  /// Внутри него — сцена в координатах кадра; сам он отвечает за вписывание.
  let layer: CALayer

  private let сцена: CALayer
  private let renderSize: CGSize
  private weak var player: AVPlayer?
  private var link: CADisplayLink?

  init(tree: CALayer, renderSize: CGSize) {
    self.renderSize = renderSize
    self.сцена = tree
    self.layer = CALayer()
    super.init()

    CATransaction.begin()
    CATransaction.setDisableActions(true)

    layer.bounds = CGRect(origin: .zero, size: renderSize)
    layer.anchorPoint = CGPoint(x: 0.5, y: 0.5)
    // Обрезаем по кадру: слой, уехавший за границу видео, в экспорте не
    // виден (там кадр и есть граница), а в предпросмотре без маски полез бы
    // на интерфейс — и предпросмотр показал бы то, чего в файле нет.
    layer.masksToBounds = true

    сцена.frame = layer.bounds

    // ЕДИНСТВЕННАЯ СТРОКА, ОТЛИЧАЮЩАЯ ПРЕДПРОСМОТР ОТ ЭКСПОРТА.
    // Сборщик слоёв ставит на корне `isGeometryFlipped = true`, и для
    // экспорта это правильно: автономное дерево считает Y снизу вверх, флаг
    // возвращает начало координат в левый верх — туда, где его держат и
    // Remotion, и `clip.x/y`. Здесь же тот же корень попадает в иерархию
    // `UIView`, у которой Y уже сверху, и флаг сработал бы ВТОРЫМ
    // переворотом: титры оказались бы зеркально по вертикали, причём видео
    // под ними — правильным. Такое расхождение не ломает сборку, не даёт
    // предупреждений и обнаруживается только глазами.
    // Проверка: поставить метку в y=0 и сравнить кадр 0 предпросмотра с
    // кадром 0 экспорта — метка обязана быть сверху в обоих.
    сцена.isGeometryFlipped = false

    сцена.speed = 0
    сцена.timeOffset = 0
    сцена.beginTime = 0
    layer.addSublayer(сцена)

    CATransaction.commit()
  }

  /**
   * Вписать наложение в прямоугольник вида.
   *
   * Считаем прямоугольник видео САМИ, а не читаем `AVPlayerLayer.videoRect`:
   * тот равен нулю, пока элемент не готов к воспроизведению, и наложение
   * «прыгало» бы в позицию через кадр после появления картинки. При
   * `videoGravity = .resizeAspect` результат вычисляется точно.
   *
   * Вписывание сделано ТРАНСФОРМАЦИЕЙ, а не пересчётом координат внутри
   * сцены. Это принципиально: значения в анимациях запечены в пикселях кадра
   * (1080×1920), и пересчёт при каждом повороте экрана означал бы
   * перезапекание всего дерева — то есть сброс анимаций и мигание.
   */
  func layout(in bounds: CGRect, scale: CGFloat) {
    guard bounds.width > 0, bounds.height > 0,
      renderSize.width > 0, renderSize.height > 0
    else { return }

    let k = min(bounds.width / renderSize.width, bounds.height / renderSize.height)

    CATransaction.begin()
    CATransaction.setDisableActions(true)
    layer.position = CGPoint(x: bounds.midX, y: bounds.midY)
    layer.transform = CATransform3DMakeScale(k, k, 1)
    // Растр текста должен учитывать и масштаб экрана, и вписывание, иначе
    // титры в предпросмотре мылят. В экспорте, наоборот, масштаб строго 1.
    установитьМасштаб(layer, max(1, scale * k))
    CATransaction.commit()
  }

  /// Привязать к плееру и начать опрос часов.
  func attach(to player: AVPlayer) {
    detach()
    self.player = player
    let l = CADisplayLink(target: self, selector: #selector(тик))
    // `.common` — чтобы наложение не замирало, пока пользователь тащит
    // ползунок таймлайна: в default-режиме runloop во время отслеживания
    // жестов display link не вызывается.
    l.add(to: .main, forMode: .common)
    link = l
    тик()
  }

  /// Отвязать. ОБЯЗАТЕЛЬНО звать: см. про удержание цели в шапке типа.
  func detach() {
    link?.invalidate()
    link = nil
    player = nil
  }

  @objc private func тик() {
    guard let player else { return }
    let время = player.currentTime()
    guard время.isNumeric else { return }
    let секунды = CMTimeGetSeconds(время)
    guard секунды.isFinite, секунды >= 0 else { return }

    CATransaction.begin()
    CATransaction.setDisableActions(true)
    // Смещение задаём в секундах ОТ НУЛЯ — ровно в той шкале, в которой
    // сборщик слоёв выставлял `beginTime`. Прибавлять сюда
    // `AVCoreAnimationBeginTimeAtZero` бессмысленно: он равен 1e-100 и в
    // double рядом с любым реальным числом секунд исчезает без следа. Его
    // единственная работа — быть НЕ нулём в `beginTime` анимаций, чтобы
    // CoreAnimation не подменил его «текущим временем» при добавлении.
    сцена.timeOffset = секунды
    CATransaction.commit()
  }

  private func установитьМасштаб(_ слой: CALayer, _ масштаб: CGFloat) {
    слой.contentsScale = масштаб
    слой.rasterizationScale = масштаб
    слой.sublayers?.forEach { установитьМасштаб($0, масштаб) }
  }
}

// MARK: - Экран предпросмотра

/// Вид с `AVPlayerLayer` и наложением поверх него.
/// `layerClass` вместо отдельного подслоя — чтобы прямоугольник плеера
/// совпадал с прямоугольником вида ровно, без рассинхрона при вращении.
final class PreviewHostView: UIView {
  override class var layerClass: AnyClass { AVPlayerLayer.self }

  var playerLayer: AVPlayerLayer {
    // Приведение безопасно: тип слоя задан `layerClass` выше.
    guard let l = layer as? AVPlayerLayer else {
      fatalError("layerClass обязан быть AVPlayerLayer")
    }
    return l
  }

  var overlay: PreviewOverlay? {
    didSet {
      oldValue?.layer.removeFromSuperlayer()
      if let overlay {
        playerLayer.addSublayer(overlay.layer)
        setNeedsLayout()
      }
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let масштаб = window?.screen.scale ?? traitCollection.displayScale
    overlay?.layout(in: bounds, scale: масштаб > 0 ? масштаб : 2)
  }
}

/// SwiftUI-обёртка: плеер + наложение.
struct NativePreview: UIViewRepresentable {
  private let player: AVPlayer
  private let overlay: PreviewOverlay

  init(player: AVPlayer, overlay: PreviewOverlay) {
    self.player = player
    self.overlay = overlay
  }

  func makeUIView(context: Context) -> PreviewHostView {
    let вид = PreviewHostView()
    вид.backgroundColor = UIColor(Тема.Цвет.фон)
    вид.playerLayer.videoGravity = .resizeAspect
    вид.playerLayer.player = player
    вид.overlay = overlay
    return вид
  }

  func updateUIView(_ uiView: PreviewHostView, context: Context) {
    if uiView.playerLayer.player !== player {
      uiView.playerLayer.player = player
    }
    if uiView.overlay !== overlay {
      uiView.overlay = overlay
    }
  }

  /// Единственное место, где рвётся удержание `CADisplayLink → PreviewOverlay`.
  /// Без него объект живёт до конца процесса вместе со всем деревом слоёв.
  static func dismantleUIView(_ uiView: PreviewHostView, coordinator: ()) {
    uiView.overlay?.detach()
    uiView.playerLayer.player = nil
  }
}
