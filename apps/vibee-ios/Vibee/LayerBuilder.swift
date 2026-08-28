import AVFoundation
import CoreGraphics
import CoreImage
import CoreText
import Foundation
import ImageIO
import QuartzCore

/**
 * ДЕРЕВО CALayer ВМЕСТО ДЕРЕВА REACT.
 *
 * Remotion строит React-дерево и просит браузер нарисовать кадр по номеру.
 * Нативный путь строит дерево `CALayer` ОДИН РАЗ, а номер кадра превращается
 * во ВРЕМЯ: `AVVideoCompositionCoreAnimationTool` прогоняет то же дерево по
 * шкале экспортируемого видео. Отсюда все ловушки этого файла — они все про
 * время и про то, что офлайн-рендер и предпросмотр на экране ведут себя
 * по-разному.
 *
 * ГЛАВНАЯ ЛОВУШКА: beginTime == 0.0.
 * CoreAnimation трактует `beginTime == 0.0` как «сейчас» и молча подставляет
 * `CACurrentMediaTime()`. Это записано в SDK: AVAnimation.h:16-19 и
 * AVVideoComposition.h:777-780 пункт (a). `CACurrentMediaTime()` — аптайм
 * машины, десятки тысяч секунд; анимация с таким началом стартует через ~10⁴ с
 * после начала ролика длиной 27–34 с, то есть НИКОГДА.
 *
 * Что увидит человек, если забыть: НЕ ошибку. Экспорт пройдёт, файл будет
 * валидным, длительность правильной, а внутри не окажется ни одного движения —
 * при `fillMode .both` весь ролик простоит на первом значении (титры навсегда
 * на opacity 0, то есть чёрный кадр с фоном). И в предпросмотре на экране всё
 * будет анимироваться правильно, потому что там `CACurrentMediaTime()` и есть
 * настоящее «сейчас». Баг живёт только в экспорте — ровно в том выходе, за
 * который заплачено.
 *
 * Поэтому правило без исключений: НИ ОДИН `beginTime` во всём дереве не равен
 * 0.0 — всегда `AVCoreAnimationBeginTimeAtZero + смещение`. Константа — это
 * крошечное положительное число, численно неотличимое от нуля на шкале видео,
 * но не равное нулю, поэтому подстановка не срабатывает.
 *
 * Самый дешёвый детектор этой ошибки: взять хеши 10 случайных кадров экспорта.
 * Если все совпали — анимации не проигрались. Одна строчка теста ловит ровно
 * этот класс отказа, который иначе замечает только человек и только на готовом
 * ролике.
 *
 * ЧЕГО ЭТОТ ФАЙЛ НЕ ДАЁТ (честная граница):
 *  • он не считает анимации. Кривые Remotion (`spring`, `interpolate`)
 *    запекаются отдельно и вешаются на слои из `RenderTree.contentLayers`
 *    через `LayerBuilder.bakedAnimation`. Здесь только геометрия, содержимое
 *    и ВРЕМЯ ЖИЗНИ слоя;
 *  • он не размывает текст и градиенты — см. комментарий у `blurRadius`;
 *  • он не воспроизводит семантику `<Sequence>` для компонентов, которые в
 *    композициях стоят СНАРУЖИ Sequence и получают абсолютный кадр
 *    (NoirReel: Masthead/Captions; TrinityBlogReel: Paper/Frame/Caption;
 *    SplitTalkingHead: Captions). Для них слоевой сдвиг времени применять
 *    нельзя — это дало бы систематическое смещение на `acts[i].at` кадров
 *    (для TrinityBlogReel до ~522 кадров). Модель `Composition` таких клипов
 *    не различает: у каждого клипа есть `startFrame`, и он всегда локальный.
 *    Если понадобится абсолютная семантика — это будет отдельное поле модели,
 *    а не догадка внутри построителя.
 */

// MARK: - Публичные типы

/// Чем клип становится в дереве слоёв.
enum LayerKind: String, Codable, Equatable {
  case image
  case text
  case gradient
  /// Видео слоем НЕ становится: оно идёт дорожкой `AVMutableComposition`.
  case video
  /// Сплошная заливка (CSS `background-color`), без содержимого.
  case color
}

/// Оформление текстового клипа. В модели `Clip` этих полей нет и быть не
/// должно: `Composition` — это то, что уезжает в JSON к вебу, а шрифты и
/// обводки у веба и у CoreText задаются по-разному. Стиль подаётся сбоку,
/// таблицей по `clip.id`.
struct TextStyle: Equatable {
  /// Если nil — берётся `clip.name`.
  var string: String?
  var fontName: String = "HelveticaNeue-Bold"
  var fontSize: Double = 64
  var colorCSS: String = "#ffffff"
  var strokeColorCSS: String?
  /// Толщина обводки в пикселях композиции (как CSS `-webkit-text-stroke`).
  var strokeWidth: Double = 0
  /// CSS `letter-spacing` в пикселях.
  var tracking: Double = 0
  /// CSS `line-height` в пикселях. nil — естественная метрика шрифта.
  var lineHeight: Double?
  var alignment: TextAlign = .center
  var verticalAlignment: VerticalAlign = .center

  enum TextAlign: String, Equatable { case left, center, right }
  enum VerticalAlign: String, Equatable { case top, center, bottom }

  init() {}
}

struct LayerStyle: Equatable {
  /// Явный тип. Если nil — выводится из `Track.type` и наличия остальных полей.
  var kind: LayerKind?
  var text: TextStyle?
  /// CSS вида `linear-gradient(135deg, #ff0080 0%, #7928ca 100%)`.
  var gradientCSS: String?
  var backgroundColorCSS: String?
  var cornerRadius: Double = 0
  /**
   * Радиус гауссова размытия в пикселях.
   *
   * ЧТО ЗДЕСЬ ЧЕСТНО, А ЧТО НЕТ. Для КАРТИНОК размытие настоящее: содержимое
   * прогоняется через `CIGaussianBlur` и в слой кладётся уже размытый
   * `CGImage`. Для текста и градиентов — нет. На iOS `CALayer.filters` и
   * `backgroundFilters` существуют в API, но композитор их игнорирует
   * (в отличие от macOS), и офлайн-рендер через
   * `AVVideoCompositionCoreAnimationTool` идёт тем же композитором. Поэтому
   * `filters` выставляется как запись намерения в дереве, а не как эффект:
   * увидеть размытый титр этим способом нельзя.
   *
   * Что делать, если размытый титр реально нужен: растрировать слой в
   * `CGImage` и размыть его как картинку (потеряв анимации внутри), либо
   * увести эффект в собственный `AVVideoCompositing`. Оба пути стоят
   * дороже и здесь не сделаны, чтобы не выдавать пустышку за работу.
   */
  var blurRadius: Double = 0
  /// Аналог CSS `object-fit`. `.resize` — это `fill` (растянуть), как в вебе
  /// по умолчанию для `<img>` с заданными width/height.
  var contentsGravity: CALayerContentsGravity = .resize
  /// Порядок наложения. Если nil — порядок треков и клипов в модели.
  var zIndex: Int?

  init() {}
}

/// Готовое дерево. `parentLayer` НЕЛЬЗЯ привязывать к `UIView`:
/// AVVideoComposition.h:777-780 пункт (c) запрещает слои, связанные с вьюхой,
/// — у них своё расписание перерисовки и своё время.
struct RenderTree {
  let parentLayer: CALayer
  /// Слой, в который `AVVideoCompositionCoreAnimationTool` кладёт видеокадр.
  /// Он ОДИН на всю композицию: инструмент не умеет несколько видеослоёв.
  /// Все видеоклипы уже склеены в одну дорожку `avComposition()`, и здесь они
  /// приходят как единая картинка.
  let videoLayer: CALayer
  /// Листовые слои по `clip.id` — сюда вешаются запечённые анимации.
  /// Время у них ЛОКАЛЬНОЕ: ноль совпадает с `clip.startFrame`.
  let contentLayers: [String: CALayer]
  /// Клипы, ушедшие в видеодорожку, а не в слои.
  let videoClipIDs: [String]

  func coreAnimationTool() -> AVVideoCompositionCoreAnimationTool {
    AVVideoCompositionCoreAnimationTool(
      postProcessingAsVideoLayer: videoLayer, in: parentLayer)
  }
}

enum LayerBuildError: LocalizedError {
  case пустаяКомпозиция
  case изображениеНеЧитается(String)
  case неизвестныйЦвет(String)
  case градиентНеРазобран(String)
  case видеоНеСлой(String)

  var errorDescription: String? {
    switch self {
    case .пустаяКомпозиция:
      return "В композиции нет кадров или fps равен нулю"
    case .изображениеНеЧитается(let s):
      return "Не удалось прочитать изображение: \(s)"
    case .неизвестныйЦвет(let s):
      return "Не разобран цвет CSS: \(s)"
    case .градиентНеРазобран(let s):
      return "Не разобран градиент CSS: \(s)"
    case .видеоНеСлой(let s):
      return "Видеоклип \(s) не может быть слоем — он идёт дорожкой композиции"
    }
  }
}

// MARK: - Построитель

struct LayerBuilder {
  let composition: Composition
  /// Оформление по `clip.id`. Клип без записи получает значения по умолчанию.
  var styles: [String: LayerStyle]

  init(composition: Composition, styles: [String: LayerStyle] = [:]) {
    self.composition = composition
    self.styles = styles
  }

  /**
   * Собрать дерево.
   *
   * `async` здесь не украшение: картинки могут лежать по http (ассеты
   * пайплайна приходят из рендер-сервера), и грузить их синхронно означало бы
   * либо блокировать поток, либо подсовывать пустой слой и «дорисовать
   * потом». Второе для офлайн-рендера смертельно: экспорт не ждёт, он заберёт
   * то, что есть на момент кадра, и молча выдаст дыру.
   *
   * Нечитаемая картинка — это `throw`, а не пропуск слоя. Пропущенный оверлей
   * не ломает сборку и виден только глазами на готовом ролике — то есть
   * ровно тот класс отказа, ради которого написан весь этот файл.
   */
  func build() async throws -> RenderTree {
    let fps = composition.fps
    let всегоКадров = composition.durationInFrames
    guard fps > 0, всегоКадров > 0 else { throw LayerBuildError.пустаяКомпозиция }

    let холст = CGRect(
      x: 0, y: 0,
      width: Double(composition.width), height: Double(composition.height))

    let корень = CALayer()
    корень.frame = холст
    // ОСЬ Y. Веб (и вся модель: x/y клипа) считает от ЛЕВОГО ВЕРХНЕГО угла
    // вниз. Автономное дерево CoreAnimation (а офлайн-рендер работает именно с
    // автономным деревом, без UIView) считает снизу вверх. `isGeometryFlipped`
    // переворачивает систему координат ДЛЯ ПОДСЛОЁВ: их y начинает отсчитываться
    // сверху, как в вебе. Содержимое самих подслоёв при этом не зеркалится —
    // флаг влияет на размещение, а не на отрисовку контента.
    //
    // ВАЖНО: флаг СТАВИТСЯ РОВНО ЗДЕСЬ, на корне, и распространяется на всё
    // поддерево. Первая версия этого комментария утверждала обратное — что
    // флаг не наследуется и его надо ставить на каждой обёртке клипа, — и
    // обёртки его действительно ставили. Измерение на настоящем компоновщике
    // (CARenderer) показало, что это ВТОРОЙ переворот: любой лист, не
    // совпадающий с границами своей обёртки, уезжал по вертикали ровно на
    // (высота обёртки − высота листа). Заметнее всего у текста — он
    // единственный смещается внутри обёртки.
    //
    // Ставить флаг на промежуточных контейнерах НЕЛЬЗЯ.
    корень.isGeometryFlipped = true
    корень.masksToBounds = true
    корень.backgroundColor = CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 1)
    // Координаты слоёв — уже пиксели композиции (1080×1920), а не точки экрана.
    // Подставлять сюда масштаб экрана нельзя: рендер идёт не на экран, и
    // contentsScale 2 или 3 дал бы кадр в 2–3 раза крупнее холста.
    корень.contentsScale = 1
    корень.beginTime = AVCoreAnimationBeginTimeAtZero

    let видеослой = CALayer()
    видеослой.frame = холст
    видеослой.contentsScale = 1
    видеослой.beginTime = AVCoreAnimationBeginTimeAtZero

    // (порядок, номер) — номер нужен, чтобы сортировка была устойчивой при
    // одинаковых zIndex: порядок наложения не имеет права зависеть от того,
    // какой алгоритм сортировки внутри у стандартной библиотеки.
    var очередь: [(порядок: Int, номер: Int, слой: CALayer)] = []
    var листья: [String: CALayer] = [:]
    var видеоКлипы: [String] = []
    var видеослойРазмещён = false
    var номер = 0

    for (индексТрека, track) in composition.tracks.enumerated() where track.visible {
      // Аудио в дереве слоёв не существует: у него нет ни пикселей, ни
      // геометрии. Его место — аудиодорожка `avComposition()`.
      if track.type == "audio" { continue }

      for clip in track.items {
        номер += 1
        let стиль = styles[clip.id] ?? LayerStyle()
        let вид = стиль.kind ?? Self.видПоТреку(track: track, стиль: стиль)
        let порядок = стиль.zIndex ?? (индексТрека * 1000 + номер)

        if вид == .video {
          видеоКлипы.append(clip.id)
          if !видеослойРазмещён {
            // Видеослой встаёт на место ПЕРВОГО видеоклипа: всё, что в модели
            // лежит выше видео (цветокоррекция, виньетка, титры), обязано
            // остаться выше и здесь.
            очередь.append((порядок, номер, видеослой))
            видеослойРазмещён = true
          }
          continue
        }

        let обёртка = try await собратьКлип(
          clip: clip, стиль: стиль, вид: вид, fps: fps, всегоКадров: всегоКадров)
        очередь.append((порядок, номер, обёртка.обёртка))
        листья[clip.id] = обёртка.лист
      }
    }

    if !видеослойРазмещён {
      // Видеослоя в модели нет, но инструменту он нужен всегда: экспорт
      // рождается из видеодорожки, и без слоя-приёмника
      // AVVideoCompositionCoreAnimationTool нечем питать кадр. Кладём его в
      // самый низ — он останется чёрным, если дорожки действительно нет.
      очередь.append((Int.min, 0, видеослой))
    }

    for запись in очередь.sorted(by: {
      $0.порядок == $1.порядок ? $0.номер < $1.номер : $0.порядок < $1.порядок
    }) {
      // Порядок задаётся ТОЛЬКО позицией в `sublayers`. `zPosition` для этого
      // не годится: он вдобавок меняет порядок хит-теста и работает лишь при
      // включённом `sortsSublayers`, то есть добавляет два скрытых условия к
      // тому, что и так однозначно выражается массивом.
      корень.addSublayer(запись.слой)
    }

    return RenderTree(
      parentLayer: корень,
      videoLayer: видеослой,
      contentLayers: листья,
      videoClipIDs: видеоКлипы)
  }

  // MARK: Клип → пара слоёв

  /**
   * Каждый клип — ДВА слоя, и это не украшательство.
   *
   * Обёртка живёт в АБСОЛЮТНОМ времени ролика: на ней висит анимация
   * видимости, чьи `keyTimes` считаются от полной длины композиции. Лист живёт
   * в ЛОКАЛЬНОМ времени клипа: его `beginTime` сдвинут на `startFrame`, и
   * запечённые анимации на нём пишутся в кадрах от начала клипа — ровно так,
   * как `<Sequence from={N}>` пересчитывает `useCurrentFrame()` к нулю.
   *
   * Одним слоем это не делается: `CAMediaTiming` наследуется вниз по дереву,
   * поэтому сдвиг `beginTime` сдвинул бы и анимацию видимости, и та начала бы
   * прятать клип не там. Разделение стоит одного лишнего слоя на клип и
   * снимает целый класс ошибок «сцена уехала на N кадров».
   */
  private func собратьКлип(
    clip: Clip, стиль: LayerStyle, вид: LayerKind, fps: Int, всегоКадров: Int
  ) async throws -> (обёртка: CALayer, лист: CALayer) {
    let размер = CGSize(width: clip.width, height: clip.height)

    let обёртка = CALayer()
    обёртка.frame = CGRect(x: clip.x, y: clip.y, width: clip.width, height: clip.height)
    обёртка.contentsScale = 1
    // Модельное значение = 0: если анимацию видимости кто-то снимет (или
    // забудет `isRemovedOnCompletion = false`), клип пропадёт целиком. Это
    // заметная поломка. Обратный выбор — модельная единица — дал бы клип,
    // висящий поверх всего ролика: поломка незаметная, а значит худшая.
    обёртка.opacity = 0
    обёртка.beginTime = AVCoreAnimationBeginTimeAtZero
    if clip.rotation != 0 {
      // Знак угла не меняем. В перевёрнутой (y вниз) системе положительный
      // поворот вокруг +z идёт по часовой стрелке — как `rotate(30deg)` в CSS.
      // Проверяется одним кадром с rotation = 15 на прямоугольном клипе.
      обёртка.transform = CATransform3DMakeRotation(
        CGFloat(clip.rotation * .pi / 180), 0, 0, 1)
    }
    обёртка.add(
      Self.видимость(clip: clip, всегоКадров: всегоКадров, fps: fps),
      forKey: "видимость")

    let лист = try await листовойСлой(clip: clip, стиль: стиль, вид: вид, размер: размер)
    лист.contentsScale = 1
    if стиль.cornerRadius > 0 {
      лист.cornerRadius = CGFloat(стиль.cornerRadius)
      лист.masksToBounds = true
    }
    if let фон = стиль.backgroundColorCSS {
      лист.backgroundColor = try Self.цвет(фон)
    }
    // Локальный ноль листа = первый кадр клипа. Константа прибавлена ЗДЕСЬ, а
    // не в анимациях: анимации, которые повесят на этот лист, живут уже в его
    // локальном времени, где ноль — настоящий ноль. Но `bakedAnimation` всё
    // равно кладёт туда константу: цена — 1e-100 секунды, выигрыш — правило
    // «нигде нет нуля» без исключений, которое можно проверить грепом.
    лист.beginTime = AVCoreAnimationBeginTimeAtZero + Double(clip.startFrame) / Double(fps)
    обёртка.addSublayer(лист)

    return (обёртка, лист)
  }

  private func листовойСлой(
    clip: Clip, стиль: LayerStyle, вид: LayerKind, размер: CGSize
  ) async throws -> CALayer {
    switch вид {
    case .video:
      throw LayerBuildError.видеоНеСлой(clip.id)

    case .image:
      guard let raw = clip.url else { throw LayerBuildError.изображениеНеЧитается(clip.id) }
      var картинка = try await Self.загрузитьИзображение(raw)
      if стиль.blurRadius > 0 {
        // Настоящее размытие: считаем его один раз здесь, а не просим у
        // композитора того, чего он на iOS не делает.
        картинка = try Self.размыть(картинка, радиус: стиль.blurRadius)
      }
      let слой = CALayer()
      слой.frame = CGRect(origin: .zero, size: размер)
      слой.contents = картинка
      слой.contentsGravity = стиль.contentsGravity
      слой.masksToBounds = true
      return слой

    case .gradient:
      guard let css = стиль.gradientCSS else {
        throw LayerBuildError.градиентНеРазобран(clip.id)
      }
      let разбор = try Self.разобратьГрадиент(css, размер: размер)
      let слой = CAGradientLayer()
      слой.frame = CGRect(origin: .zero, size: размер)
      слой.type = .axial
      слой.colors = разбор.цвета
      слой.locations = разбор.позиции
      // `startPoint`/`endPoint` — единичные координаты СОБСТВЕННОГО слоя, где
      // (0,0) — верхний левый угол (дефолт CAGradientLayer на iOS — (0.5, 0),
      // и градиент по умолчанию идёт сверху вниз). Это совпадает с системой
      // отсчёта CSS, поэтому парсер угла ниже переводит напрямую.
      слой.startPoint = разбор.начало
      слой.endPoint = разбор.конец
      Self.записатьНамерениеРазмытия(стиль.blurRadius, на: слой)
      return слой

    case .text:
      let ст = стиль.text ?? TextStyle()
      let текст = ст.string ?? clip.name ?? ""
      let слой = try Self.текстовыйСлой(ст, текст: текст, вМесте: размер)
      Self.записатьНамерениеРазмытия(стиль.blurRadius, на: слой)
      return слой

    case .color:
      let слой = CALayer()
      слой.frame = CGRect(origin: .zero, size: размер)
      слой.backgroundColor = try Self.цвет(стиль.backgroundColorCSS ?? "#000000")
      return слой
    }
  }

  private static func видПоТреку(track: Track, стиль: LayerStyle) -> LayerKind {
    if стиль.gradientCSS != nil { return .gradient }
    if стиль.text != nil { return .text }
    switch track.type {
    case "video": return .video
    case "text": return .text
    // avatar — это видео или картинка аватара; в дереве слоёв он ведёт себя
    // как изображение, а движущийся аватар приходит видеодорожкой и попадает
    // сюда только явным `LayerStyle.kind = .video`.
    case "image", "avatar": return .image
    default: return .image
    }
  }
}

// MARK: - Время жизни слоя

extension LayerBuilder {
  /**
   * Аналог размонтирования детей `<Sequence>` вне окна.
   *
   * `CAMediaTiming.duration` слой НЕ ПРЯЧЕТ: после конца длительности он
   * остаётся на экране с последним значением. `Sequence` же выбрасывает
   * поддерево из DOM. Забыть об этом легко, потому что ПЕРВАЯ сцена рисуется
   * правильно — лишним оказывается её хвост поверх всех следующих.
   *
   * `.discrete` вместо `.linear` принципиально: клип обязан появляться и
   * исчезать мгновенно на границе кадра, а не проявляться. При `.discrete`
   * число `keyTimes` на единицу больше числа `values` — значение i держится на
   * полуинтервале [keyTimes[i], keyTimes[i+1]).
   *
   * Длительность здесь — ПОЛНАЯ длина ролика, а не длина клипа: keyTimes
   * нормированы по всей шкале, поэтому кадр N приходится ровно на N/total и
   * граница совпадает с кадром без округлений. (У `bakedAnimation` длительность
   * считается иначе — там keyTimes идут i/(N−1); подробности там же.)
   *
   * Проверка: отрендерить кадр N+D — ПЕРВЫЙ кадр после окна, а не N+D−1 — и
   * убедиться, что слоя нет.
   */
  fileprivate static func видимость(clip: Clip, всегоКадров: Int, fps: Int)
    -> CAKeyframeAnimation
  {
    let анимация = CAKeyframeAnimation(keyPath: "opacity")
    анимация.calculationMode = .discrete
    анимация.values = [
      NSNumber(value: 0.0),
      NSNumber(value: clip.opacity),
      NSNumber(value: 0.0),
    ]

    let всего = Double(всегоКадров)
    let вход = min(max(Double(clip.startFrame) / всего, 0), 1)
    let выход = min(max(Double(clip.startFrame + clip.durationInFrames) / всего, вход), 1)
    анимация.keyTimes = [
      NSNumber(value: 0.0),
      NSNumber(value: вход),
      NSNumber(value: выход),
      NSNumber(value: 1.0),
    ]

    анимация.duration = всего / Double(fps)
    анимация.beginTime = AVCoreAnimationBeginTimeAtZero
    анимация.fillMode = .both
    // AVVideoComposition.h:777-780 пункт (b): без этого CoreAnimation снимет
    // анимацию по окончании и свойство скакнёт к модельному значению слоя.
    // В офлайн-рендере это выглядит как «сцена доиграла и мигнула».
    анимация.isRemovedOnCompletion = false
    return анимация
  }

  /**
   * Запечённая покадровая кривая — единственный честный способ перенести
   * `spring()` и любую композицию `interpolate(spring(...))` из Remotion.
   *
   * Почему не `CASpringAnimation`: при
   * `damping / (2·√(stiffness·mass)) ≥ 1` Remotion ПОЛНОСТЬЮ игнорирует
   * damping и считает критически затухающую кривую с ω₀=√(k/m). Численно:
   * damping 39, 50, 200, 1000 и 100000 при stiffness 380 дают на кадре 6 одно
   * и то же 0.900713359446, тогда как честный решатель ОДУ даёт 0.311987 —
   * расхождение 0.589. Это ровно конфиг NoirReel {damping: 200, stiffness: 380}.
   * Плюс `CASpringAnimation` без явной длительности наследует дефолтные 0.25 с
   * и обрубает пружину, а одна пружина в этом проекте трижды кормит СРАЗУ ДВА
   * свойства через разные `interpolate` — одной анимацией это не выражается.
   *
   * `beginLocalFrame` — кадр ОТ НАЧАЛА КЛИПА (локальное время листа), а не от
   * начала ролика.
   */
  static func bakedAnimation(
    keyPath: String, values: [Double], fps: Int, beginLocalFrame: Int = 0
  ) -> CAKeyframeAnimation {
    precondition(!values.isEmpty, "запекать нечего: пустой массив значений")
    let анимация = CAKeyframeAnimation(keyPath: keyPath)
    анимация.values = values.map { NSNumber(value: $0) }
    анимация.calculationMode = .linear

    if values.count > 1 {
      let последний = Double(values.count - 1)
      анимация.keyTimes = (0..<values.count).map {
        NSNumber(value: Double($0) / последний)
      }
      // ДЛИТЕЛЬНОСТЬ = (N−1)/fps, НЕ N/fps. Значение i должно попасть на кадр
      // i, то есть на момент i/fps. При keyTimes = i/(N−1) это выполняется
      // ровно при длительности (N−1)/fps. Взять N/fps — значит растянуть
      // кривую в N/(N−1) раз и к последнему кадру опоздать ровно на один кадр:
      // на статичном кадре не видно, на видео видно.
      анимация.duration = последний / Double(fps)
    } else {
      // Одно значение — это константа; нулевая длительность у CAAnimation
      // означает «дефолт 0.25 с», поэтому берём один кадр и удерживаем его.
      анимация.keyTimes = [NSNumber(value: 0.0)]
      анимация.duration = 1.0 / Double(fps)
    }

    анимация.beginTime =
      AVCoreAnimationBeginTimeAtZero + Double(beginLocalFrame) / Double(fps)
    анимация.fillMode = .both
    анимация.isRemovedOnCompletion = false
    // Дефолт CABasicAnimation/CAKeyframeAnimation — .easeInEaseOut. На уже
    // запечённых значениях он исказил бы правильную кривую поверх правильных
    // чисел, и сборка бы не сломалась: тихая подмена, видимая только на глаз.
    анимация.timingFunction = CAMediaTimingFunction(name: .linear)
    return анимация
  }

  /// `interpolate(frame, [a, b], [c, d])` без easing — 25 таких вызовов в
  /// композициях, все линейные. `.linear` обязателен по той же причине, что и
  /// выше. `extrapolateRight: 'clamp'` выражается парой fillMode + запрет на
  /// снятие анимации.
  ///
  /// КАДРЫ ЛОКАЛЬНЫЕ, как и у `bakedAnimation`. Раньше параметры звались
  /// `fromLocalFrame`/`toLocalFrame` и молчали о происхождении, а соседняя фабрика
  /// прямо писала «от начала клипа» — три сестринских функции считали
  /// одинаково и объясняли по-разному.
  ///
  /// Цена расхождения конкретна: `interpolate(frame, [90, 102], …)`,
  /// переписанный из TSX БЕЗ `<Sequence>`, содержит кадры композиции.
  /// Подставить их сюда как локальные — сдвиг ровно на `clip.startFrame`.
  static func linearAnimation(
    keyPath: String, from: Double, to: Double,
    fromLocalFrame: Int, toLocalFrame: Int, fps: Int
  ) -> CABasicAnimation {
    let анимация = CABasicAnimation(keyPath: keyPath)
    анимация.fromValue = NSNumber(value: from)
    анимация.toValue = NSNumber(value: to)
    анимация.beginTime = AVCoreAnimationBeginTimeAtZero + Double(fromLocalFrame) / Double(fps)
    анимация.duration = max(Double(toLocalFrame - fromLocalFrame), 1) / Double(fps)
    анимация.timingFunction = CAMediaTimingFunction(name: .linear)
    анимация.fillMode = .both
    анимация.isRemovedOnCompletion = false
    return анимация
  }

  /// `interpolate` с тремя и более точками входа (кросс-фейды PromoReelV3).
  /// `keyTimes` нормируются по ВСЕМУ входному диапазону, а не по длине
  /// композиции: ошибка здесь даёт правильную форму кривой в неправильном
  /// темпе — на статичном кадре не видно, только на видео.
  ///
  /// КАДРЫ ЛОКАЛЬНЫЕ — см. `linearAnimation`.
  static func keyframeAnimation(
    keyPath: String, inputLocalFrames: [Int], outputValues: [Double], fps: Int
  ) -> CAKeyframeAnimation {
    precondition(
      inputLocalFrames.count == outputValues.count && inputLocalFrames.count > 1,
      "диапазоны interpolate обязаны совпадать по длине и содержать ≥2 точки")
    let анимация = CAKeyframeAnimation(keyPath: keyPath)
    анимация.values = outputValues.map { NSNumber(value: $0) }
    анимация.calculationMode = .linear
    let первый = Double(inputLocalFrames[0])
    let диапазон = Double(inputLocalFrames[inputLocalFrames.count - 1]) - первый
    анимация.keyTimes = inputLocalFrames.map {
      NSNumber(value: диапазон > 0 ? (Double($0) - первый) / диапазон : 0)
    }
    анимация.beginTime = AVCoreAnimationBeginTimeAtZero + первый / Double(fps)
    анимация.duration = max(диапазон, 1) / Double(fps)
    анимация.fillMode = .both
    анимация.isRemovedOnCompletion = false
    анимация.timingFunction = CAMediaTimingFunction(name: .linear)
    return анимация
  }
}

// MARK: - Содержимое: изображение

extension LayerBuilder {
  private static let ciКонтекст: CIContext = {
    // Рабочее пространство фиксировано: без него CoreImage возьмёт системное,
    // и размытая картинка приедет в другом цвете, чем неразмытая соседняя.
    CIContext(options: [.workingColorSpace: CGColorSpaceCreateDeviceRGB()])
  }()

  fileprivate static func загрузитьИзображение(_ raw: String) async throws -> CGImage {
    let url: URL
    if raw.hasPrefix("/") {
      url = URL(fileURLWithPath: raw)
    } else if let разобранный = URL(string: raw) {
      url = разобранный
    } else {
      throw LayerBuildError.изображениеНеЧитается(raw)
    }

    let источник: CGImageSource?
    if url.isFileURL {
      источник = CGImageSourceCreateWithURL(url as CFURL, nil)
    } else {
      let (данные, ответ) = try await URLSession.shared.data(from: url)
      if let http = ответ as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
        throw LayerBuildError.изображениеНеЧитается("\(raw) → HTTP \(http.statusCode)")
      }
      источник = CGImageSourceCreateWithData(данные as CFData, nil)
    }

    guard let s = источник,
      let картинка = CGImageSourceCreateImageAtIndex(s, 0, nil)
    else {
      throw LayerBuildError.изображениеНеЧитается(raw)
    }
    // EXIF-ориентация НЕ применяется: ассеты этого пайплайна приходят из
    // рендера и с камеры не бывают. Если сюда однажды попадёт снимок с
    // телефона, он ляжет боком — и это будет видно сразу, а не «иногда».
    return картинка
  }

  fileprivate static func размыть(_ картинка: CGImage, радиус: Double) throws -> CGImage {
    let исходная = CIImage(cgImage: картинка)
    // clampedToExtent — иначе гаусс подмешает прозрачность за краями и по
    // периметру появится характерная тёмная кайма шириной в радиус.
    guard
      let фильтр = CIFilter(
        name: "CIGaussianBlur",
        parameters: [
          kCIInputImageKey: исходная.clampedToExtent(),
          kCIInputRadiusKey: радиус,
        ]),
      let результат = фильтр.outputImage,
      let готово = ciКонтекст.createCGImage(результат, from: исходная.extent)
    else {
      throw LayerBuildError.изображениеНеЧитается("размытие не удалось")
    }
    return готово
  }

  /// См. пояснение у `LayerStyle.blurRadius`: на iOS `filters` композитором
  /// игнорируется. Запись остаётся единственным местом, где радиус зафиксирован
  /// в дереве, и точкой входа для macOS-сборки рендера. Эффекта в экспорте
  /// с iOS она НЕ даёт — не принимайте её за размытие.
  fileprivate static func записатьНамерениеРазмытия(_ радиус: Double, на слой: CALayer) {
    guard радиус > 0,
      let фильтр = CIFilter(name: "CIGaussianBlur", parameters: [kCIInputRadiusKey: радиус])
    else { return }
    слой.filters = [фильтр]
  }
}

// MARK: - Содержимое: текст

extension LayerBuilder {
  fileprivate static func текстовыйСлой(
    _ ст: TextStyle, текст: String, вМесте размер: CGSize
  ) throws -> CATextLayer {
    let шрифт = CTFontCreateWithName(ст.fontName as CFString, CGFloat(ст.fontSize), nil)

    var атрибуты: [NSAttributedString.Key: Any] = [
      NSAttributedString.Key(kCTFontAttributeName as String): шрифт,
      NSAttributedString.Key(kCTForegroundColorAttributeName as String):
        try цвет(ст.colorCSS),
      NSAttributedString.Key(kCTParagraphStyleAttributeName as String): абзац(ст),
    ]

    if ст.tracking != 0 {
      // CSS letter-spacing в пикселях = kern в точках: единицы дерева слоёв и
      // есть пиксели композиции, поэтому пересчёта нет.
      атрибуты[NSAttributedString.Key(kCTKernAttributeName as String)] = CGFloat(ст.tracking)
    }

    if let обводка = ст.strokeColorCSS, ст.strokeWidth > 0 {
      атрибуты[NSAttributedString.Key(kCTStrokeColorAttributeName as String)] =
        try цвет(обводка)
      // kCTStrokeWidth задаётся В ПРОЦЕНТАХ от кегля, а не в пикселях, и знак
      // несёт смысл: ПОЛОЖИТЕЛЬНОЕ значение рисует только контур (буквы
      // становятся полыми), ОТРИЦАТЕЛЬНОЕ — заливку И контур, как
      // `-webkit-text-stroke` в вебе. Перепутанный знак не ломает сборку, он
      // делает титры прозрачными.
      атрибуты[NSAttributedString.Key(kCTStrokeWidthAttributeName as String)] =
        CGFloat(-ст.strokeWidth / max(ст.fontSize, 0.0001) * 100)
    }

    let строка = NSAttributedString(string: текст, attributes: атрибуты)

    // МЕТРИКА. CATextLayer рисует текст от ВЕРХА своих границ вниз и не умеет
    // вертикального выравнивания. В вебе блок с flex-центрированием ставит
    // текст по центру бокса. Поэтому высоту меряем сами и двигаем слой, а не
    // растягиваем его на всю обёртку — иначе одно- и двухстрочный титр
    // окажутся на разной высоте, что в ролике читается как дрожание.
    let каркас = CTFramesetterCreateWithAttributedString(строка)
    let нужно = CTFramesetterSuggestFrameSizeWithConstraints(
      каркас,
      CFRange(location: 0, length: 0),
      nil,
      CGSize(width: размер.width, height: .greatestFiniteMagnitude),
      nil)
    let высота = min(ceil(нужно.height), размер.height)

    let смещение: CGFloat
    switch ст.verticalAlignment {
    case .top: смещение = 0
    case .center: смещение = (размер.height - высота) / 2
    case .bottom: смещение = размер.height - высота
    }

    let слой = CATextLayer()
    слой.string = строка
    слой.isWrapped = true
    слой.truncationMode = .none
    слой.contentsScale = 1
    switch ст.alignment {
    case .left: слой.alignmentMode = .left
    case .center: слой.alignmentMode = .center
    case .right: слой.alignmentMode = .right
    }
    слой.frame = CGRect(x: 0, y: смещение, width: размер.width, height: высота)
    return слой
  }

  /// CoreText-абзац. `NSParagraphStyle` не используется намеренно: на iOS он
  /// живёт в UIKit, а этот файл обязан собираться без UIKit — слои офлайн-
  /// рендера не имеют права быть связанными с вьюхами (AVVideoComposition.h,
  /// пункт (c)).
  private static func абзац(_ ст: TextStyle) -> CTParagraphStyle {
    var выравнивание: CTTextAlignment
    switch ст.alignment {
    case .left: выравнивание = .left
    case .center: выравнивание = .center
    case .right: выравнивание = .right
    }

    // CTParagraphStyleCreate копирует значения по указателям, поэтому память
    // достаточно держать до конца вызова.
    let укВыравнивание = UnsafeMutablePointer<CTTextAlignment>.allocate(capacity: 1)
    укВыравнивание.initialize(to: выравнивание)
    defer {
      укВыравнивание.deinitialize(count: 1)
      укВыравнивание.deallocate()
    }

    var настройки: [CTParagraphStyleSetting] = [
      CTParagraphStyleSetting(
        spec: .alignment,
        valueSize: MemoryLayout<CTTextAlignment>.size,
        value: укВыравнивание)
    ]

    let укВысота = UnsafeMutablePointer<CGFloat>.allocate(capacity: 1)
    укВысота.initialize(to: CGFloat(ст.lineHeight ?? 0))
    defer {
      укВысота.deinitialize(count: 1)
      укВысота.deallocate()
    }

    if ст.lineHeight != nil {
      // CSS line-height задаёт ТОЧНУЮ высоту строки, поэтому минимум и
      // максимум ставятся равными: одного `lineSpacingAdjustment` мало —
      // он добавляет к естественной метрике шрифта, а она у разных
      // начертаний разная, и титр уехал бы при смене шрифта.
      настройки.append(
        CTParagraphStyleSetting(
          spec: .minimumLineHeight, valueSize: MemoryLayout<CGFloat>.size, value: укВысота))
      настройки.append(
        CTParagraphStyleSetting(
          spec: .maximumLineHeight, valueSize: MemoryLayout<CGFloat>.size, value: укВысота))
    }

    return CTParagraphStyleCreate(&настройки, настройки.count)
  }
}

// MARK: - Содержимое: градиент и цвет

extension LayerBuilder {
  fileprivate struct РазборГрадиента {
    let начало: CGPoint
    let конец: CGPoint
    let цвета: [CGColor]
    let позиции: [NSNumber]
  }

  /**
   * CSS `linear-gradient` → параметры `CAGradientLayer`.
   *
   * Угол в CSS отсчитывается ОТ НАПРАВЛЕНИЯ ВВЕРХ ПО ЧАСОВОЙ: 0deg — вверх,
   * 90deg — вправо, 180deg (умолчание) — вниз. Направляющий вектор в
   * экранных координатах с осью y вниз: (sin A, −cos A).
   *
   * Длина линии градиента по CSS — |w·sin A| + |h·cos A|: именно она делает
   * так, что крайние остановки попадают точно в углы прямоугольника.
   * Наивное «из угла в угол» (0,0)→(1,1) даёт похожую, но другую картинку —
   * заметно на неквадратных клипах, а тут все клипы 1080×1920.
   */
  fileprivate static func разобратьГрадиент(_ css: String, размер: CGSize) throws
    -> РазборГрадиента
  {
    let подрезанный = css.trimmingCharacters(in: .whitespacesAndNewlines)
    guard подрезанный.lowercased().hasPrefix("linear-gradient("),
      подрезанный.hasSuffix(")")
    else { throw LayerBuildError.градиентНеРазобран(css) }

    let начало = подрезанный.index(подрезанный.startIndex, offsetBy: "linear-gradient(".count)
    let нутро = String(подрезанный[начало..<подрезанный.index(before: подрезанный.endIndex)])
    var части = разбитьПоЗапятым(нутро)
    guard !части.isEmpty else { throw LayerBuildError.градиентНеРазобран(css) }

    var уголГрад = 180.0  // CSS-умолчание: сверху вниз.
    if let угол = разобратьУгол(части[0], размер: размер) {
      уголГрад = угол
      части.removeFirst()
    }
    guard части.count >= 2 else { throw LayerBuildError.градиентНеРазобран(css) }

    var цвета: [CGColor] = []
    var позиции: [Double?] = []
    for часть in части {
      let (c, p) = try разобратьОстановку(часть)
      цвета.append(c)
      позиции.append(p)
    }

    let радианы = уголГрад * .pi / 180
    let dx = sin(радианы)
    let dy = -cos(радианы)  // экранная ось y смотрит вниз
    let длина = abs(размер.width * dx) + abs(размер.height * dy)
    let половина = длина / 2
    let точкаКонца = CGPoint(
      x: 0.5 + (половина * dx) / max(размер.width, 0.0001),
      y: 0.5 + (половина * dy) / max(размер.height, 0.0001))
    let точкаНачала = CGPoint(
      x: 0.5 - (половина * dx) / max(размер.width, 0.0001),
      y: 0.5 - (половина * dy) / max(размер.height, 0.0001))

    return РазборГрадиента(
      начало: точкаНачала,
      конец: точкаКонца,
      цвета: цвета,
      позиции: достроитьПозиции(позиции).map { NSNumber(value: $0) })
  }

  /// Остановки без явного процента CSS распределяет равномерно между
  /// ближайшими заданными. Пропустить это — значит на градиенте из трёх цветов,
  /// где процент указан только у крайних, получить сдвинутую середину.
  private static func достроитьПозиции(_ исходные: [Double?]) -> [Double] {
    var позиции = исходные
    if позиции.first! == nil { позиции[0] = 0 }
    if позиции.last! == nil { позиции[позиции.count - 1] = 1 }

    var i = 0
    while i < позиции.count {
      if позиции[i] != nil {
        i += 1
        continue
      }
      var j = i
      while j < позиции.count, позиции[j] == nil { j += 1 }
      let слева = позиции[i - 1]!
      let справа = позиции[j]!
      let шаг = (справа - слева) / Double(j - i + 1)
      for k in i..<j { позиции[k] = слева + шаг * Double(k - i + 1) }
      i = j
    }

    // Монотонность: CAGradientLayer требует неубывающих locations, а CSS
    // разрешает «съехавшие» остановки и сам их подтягивает.
    var результат: [Double] = []
    var предыдущая = 0.0
    for значение in позиции {
      let v = max(min(значение ?? 0, 1), предыдущая)
      результат.append(v)
      предыдущая = v
    }
    return результат
  }

  private static func разобратьУгол(_ часть: String, размер: CGSize) -> Double? {
    let s = часть.trimmingCharacters(in: .whitespaces).lowercased()

    if s.hasPrefix("to ") {
      let слова = Set(s.dropFirst(3).split(separator: " ").map(String.init))
      // Для угловых ключевых слов CSS требует, чтобы линия градиента была
      // перпендикулярна диагонали между двумя другими углами. Отсюда atan2.
      let диагональ = atan2(размер.width, размер.height) * 180 / .pi
      switch (
        слова.contains("top"), слова.contains("bottom"), слова.contains("left"),
        слова.contains("right")
      ) {
      case (true, false, false, true): return диагональ
      case (false, true, false, true): return 180 - диагональ
      case (false, true, true, false): return 180 + диагональ
      case (true, false, true, false): return 360 - диагональ
      case (true, false, false, false): return 0
      case (false, false, false, true): return 90
      case (false, true, false, false): return 180
      case (false, false, true, false): return 270
      default: return nil
      }
    }

    for (суффикс, множитель) in [
      ("deg", 1.0), ("grad", 0.9), ("turn", 360.0), ("rad", 180 / Double.pi),
    ] {
      if s.hasSuffix(суффикс), let число = Double(s.dropLast(суффикс.count)) {
        return число * множитель
      }
    }
    return nil
  }

  private static func разобратьОстановку(_ часть: String) throws -> (CGColor, Double?) {
    let s = часть.trimmingCharacters(in: .whitespaces)
    // Позиция — последнее «слово», если оно похоже на длину. Цвет может сам
    // содержать пробелы (`rgb(255 0 0 / 50%)`), поэтому режем с конца.
    if let пробел = s.range(of: " ", options: .backwards) {
      let хвост = String(s[пробел.upperBound...]).trimmingCharacters(in: .whitespaces)
      if let позиция = разобратьДолю(хвост) {
        let голова = String(s[..<пробел.lowerBound]).trimmingCharacters(in: .whitespaces)
        return (try цвет(голова), позиция)
      }
    }
    return (try цвет(s), nil)
  }

  private static func разобратьДолю(_ s: String) -> Double? {
    if s.hasSuffix("%"), let число = Double(s.dropLast()) { return число / 100 }
    return nil
  }

  private static func разбитьПоЗапятым(_ s: String) -> [String] {
    var результат: [String] = []
    var буфер = ""
    var глубина = 0
    for символ in s {
      switch символ {
      case "(":
        глубина += 1
        буфер.append(символ)
      case ")":
        глубина -= 1
        буфер.append(символ)
      case "," where глубина == 0:
        результат.append(буфер.trimmingCharacters(in: .whitespacesAndNewlines))
        буфер = ""
      default:
        буфер.append(символ)
      }
    }
    let последний = буфер.trimmingCharacters(in: .whitespacesAndNewlines)
    if !последний.isEmpty { результат.append(последний) }
    return результат
  }

  /// CSS-цвет → CGColor в sRGB. Неизвестное имя — это `throw`, а не «чёрный по
  /// умолчанию»: подстановка чёрного даёт валидный ролик с невидимым титром,
  /// то есть отказ, который обнаружит только человек.
  fileprivate static func цвет(_ css: String) throws -> CGColor {
    let s = css.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if s == "transparent" { return CGColor(srgbRed: 0, green: 0, blue: 0, alpha: 0) }
    if let именованный = именованныеЦвета[s] {
      return CGColor(
        srgbRed: именованный.0, green: именованный.1, blue: именованный.2, alpha: 1)
    }

    if s.hasPrefix("#") {
      var hex = String(s.dropFirst())
      if hex.count == 3 || hex.count == 4 {
        hex = hex.map { "\($0)\($0)" }.joined()
      }
      guard hex.count == 6 || hex.count == 8, let число = UInt64(hex, radix: 16) else {
        throw LayerBuildError.неизвестныйЦвет(css)
      }
      if hex.count == 6 {
        return CGColor(
          srgbRed: CGFloat((число >> 16) & 0xFF) / 255,
          green: CGFloat((число >> 8) & 0xFF) / 255,
          blue: CGFloat(число & 0xFF) / 255,
          alpha: 1)
      }
      return CGColor(
        srgbRed: CGFloat((число >> 24) & 0xFF) / 255,
        green: CGFloat((число >> 16) & 0xFF) / 255,
        blue: CGFloat((число >> 8) & 0xFF) / 255,
        alpha: CGFloat(число & 0xFF) / 255)
    }

    if s.hasPrefix("rgb") {
      guard let открывающая = s.firstIndex(of: "("), s.hasSuffix(")") else {
        throw LayerBuildError.неизвестныйЦвет(css)
      }
      let нутро = String(s[s.index(after: открывающая)..<s.index(before: s.endIndex)])
        .replacingOccurrences(of: "/", with: ",")
        .replacingOccurrences(of: ",", with: " ")
      let куски = нутро.split(separator: " ").map(String.init)
      guard куски.count >= 3 else { throw LayerBuildError.неизвестныйЦвет(css) }

      func канал(_ кусок: String) -> CGFloat? {
        if кусок.hasSuffix("%"), let v = Double(кусок.dropLast()) { return CGFloat(v / 100) }
        if let v = Double(кусок) { return CGFloat(v / 255) }
        return nil
      }
      guard let r = канал(куски[0]), let g = канал(куски[1]), let b = канал(куски[2]) else {
        throw LayerBuildError.неизвестныйЦвет(css)
      }
      var a: CGFloat = 1
      if куски.count >= 4 {
        if куски[3].hasSuffix("%"), let v = Double(куски[3].dropLast()) {
          a = CGFloat(v / 100)
        } else if let v = Double(куски[3]) {
          a = CGFloat(v)
        } else {
          throw LayerBuildError.неизвестныйЦвет(css)
        }
      }
      return CGColor(srgbRed: r, green: g, blue: b, alpha: a)
    }

    throw LayerBuildError.неизвестныйЦвет(css)
  }

  /// Только те имена, что реально встречаются в стилях композиций. Полная
  /// таблица CSS здесь была бы 148 строками мёртвого кода.
  private static let именованныеЦвета: [String: (CGFloat, CGFloat, CGFloat)] = [
    "black": (0, 0, 0),
    "white": (1, 1, 1),
    "red": (1, 0, 0),
    "lime": (0, 1, 0),
    "blue": (0, 0, 1),
    "yellow": (1, 1, 0),
    "cyan": (0, 1, 1),
    "magenta": (1, 0, 1),
    "gray": (128 / 255, 128 / 255, 128 / 255),
    "grey": (128 / 255, 128 / 255, 128 / 255),
    "silver": (192 / 255, 192 / 255, 192 / 255),
    "gold": (1, 215 / 255, 0),
    "orange": (1, 165 / 255, 0),
  ]
}
