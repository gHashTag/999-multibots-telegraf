import AVFoundation
import Foundation
import QuartzCore

/**
 * ЗАПЕКАНИЕ АНИМАЦИЙ REMOTION В CORE ANIMATION.
 *
 * Здесь три слоя, и порядок между ними важен:
 *
 *   1. `interpolate` и `spring` — побуквенные порты Remotion 4.0.388
 *      (`dist/cjs/interpolate.js`, `dist/cjs/spring/`). Не «физически
 *      правильная пружина», а ровно та арифметика, которую выполняет
 *      рендерер. Эталон — не учебник по колебаниям, эталон — кадр, который
 *      выдаёт Remotion.
 *   2. `Easing` — порт React-Native Easing, на который Remotion ссылается.
 *   3. `CABaker` — сэмплирование ИТОГОВОГО свойства слоя по каждому кадру
 *      композиции и укладка в `CAKeyframeAnimation`.
 *
 * ПОЧЕМУ ЗАПЕКАНИЕ, А НЕ `CASpringAnimation` И НЕ ПОДБОР `timingFunction`.
 *
 *  • `CASpringAnimation` решает честное ОДУ. Remotion — нет: при
 *    ζ = damping / (2·√(stiffness·mass)) ≥ 1 он применяет критически
 *    затухающую формулу ко ВСЕМУ диапазону, то есть damping перестаёт
 *    влиять вообще. Численно: stiffness 380, mass 1, damping 39 / 50 / 200 /
 *    1000 / 100000 дают на кадре 6 при 30 fps одно и то же
 *    0.900713359446, а честное передемпфированное решение — 0.311987.
 *    Это ровно конфиг NoirReel {damping: 200, stiffness: 380}. Расхождение
 *    0.589 по значению — слово появляется в другой момент, это видно глазом.
 *  • Выход пружины в этом проекте трижды идёт ВХОДОМ в `interpolate`
 *    (Captions.tsx:212 и :235, NoirReel scale = 0.92 + pop·0.08). Одна
 *    `CASpringAnimation` не умеет кормить два свойства двумя разными
 *    отображениями от одной пружины.
 *  • `CAMediaTimingFunction` перекраивает ВРЕМЯ между двумя ключами. В
 *    перечисленных случаях нелинейно не время, а само отображение значения;
 *    timing-функцией это не выражается в принципе, а не «плохо выражается».
 *  • `Easing.out(Easing.cubic)` = 1−(1−t)³ — полином, а не кривая Безье.
 *    Кубический Безье не выражает его точно ни при каком выборе контрольных
 *    точек (разная параметризация). Ближайшая CSS-константа
 *    (0.215, 0.61, 0.355, 1) врёт до ~0.006 по прогрессу — на смещении
 *    200 px это 1.2 px дрожания.
 *
 * ЧЕГО ЭТОТ ФАЙЛ НЕ ДАЁТ (чтобы не искали):
 *  • он ничего не рисует и не рендерит — только считает значения и собирает
 *    `CAAnimation`; дерево слоёв и порядок sublayers строит вызывающий код;
 *  • он не воспроизводит `extrapolate: 'extend'` средствами CoreAnimation —
 *    его там нет; «extend» существует только внутри запечённых значений,
 *    потому что запекается итоговое свойство (см. `PropertyAnimation`);
 *  • он не интерполирует нечисловые величины: для смены текста, кадра
 *    зерна или раскладки есть `CABaker.bakeDiscrete(keyPath:values:…)`,
 *    и только `.discrete` — смешивать два соседних состояния нельзя.
 */

// MARK: - Remotion interpolate

/// Поведение за пределами `inputRange`. Значения и имена — как в Remotion.
public enum Extrapolation: String, Codable, Sendable {
  /// Продолжить прямую за границей диапазона (ДЕФОЛТ Remotion).
  case extend
  /// Удержать крайнее значение.
  case clamp
  /// Вернуть вход как есть, без отображения в outputRange.
  case identity
  /// Завернуть вход обратно в диапазон по модулю.
  case wrap
}

/**
 * Порт `interpolate` из Remotion (сам он — порт RN AnimatedInterpolation).
 *
 * Порядок операций сохранён буквально, включая два неочевидных места:
 *  • ранний выход при `identity` происходит ДО проверки
 *    `outputMin == outputMax`;
 *  • easing применяется к УЖЕ нормированному входу, то есть после
 *    экстраполяции, а не до неё.
 * Переставить их местами — значит получить другую кривую там, где
 * exprapolate и easing встречаются вместе.
 *
 * Невалидный `inputRange` — ошибка автора композиции, а не входные данные
 * пользователя, поэтому здесь `precondition`, а не «молча починить».
 * Молча починенный диапазон даёт правдоподобный, но неверный кадр — худший
 * из возможных исходов, потому что он не всплывает в тесте.
 */
public func interpolate(
  _ input: Double,
  _ inputRange: [Double],
  _ outputRange: [Double],
  easing: Easing = .linear,
  extrapolateLeft: Extrapolation = .extend,
  extrapolateRight: Extrapolation = .extend
) -> Double {
  precondition(
    inputRange.count == outputRange.count,
    "interpolate: inputRange (\(inputRange.count)) и outputRange (\(outputRange.count)) разной длины")
  precondition(inputRange.count >= 2, "interpolate: нужно минимум 2 точки")
  for i in 1..<inputRange.count {
    precondition(
      inputRange[i] > inputRange[i - 1],
      "interpolate: inputRange должен строго возрастать, получен \(inputRange)")
  }
  precondition(input.isFinite, "interpolate: вход не является конечным числом")

  let диапазон = найтиДиапазон(input, inputRange)
  return интерполироватьОтрезок(
    input,
    inputMin: inputRange[диапазон], inputMax: inputRange[диапазон + 1],
    outputMin: outputRange[диапазон], outputMax: outputRange[диапазон + 1],
    easing: easing,
    extrapolateLeft: extrapolateLeft,
    extrapolateRight: extrapolateRight)
}

private func найтиДиапазон(_ input: Double, _ inputRange: [Double]) -> Int {
  var i = 1
  while i < inputRange.count - 1 {
    if inputRange[i] >= input { break }
    i += 1
  }
  return i - 1
}

private func интерполироватьОтрезок(
  _ input: Double,
  inputMin: Double, inputMax: Double,
  outputMin: Double, outputMax: Double,
  easing: Easing,
  extrapolateLeft: Extrapolation,
  extrapolateRight: Extrapolation
) -> Double {
  var result = input

  if result < inputMin {
    switch extrapolateLeft {
    case .identity: return result
    case .clamp: result = inputMin
    case .wrap:
      let ширина = inputMax - inputMin
      result =
        (((result - inputMin).truncatingRemainder(dividingBy: ширина) + ширина)
          .truncatingRemainder(dividingBy: ширина)) + inputMin
    case .extend: break
    }
  }

  if result > inputMax {
    switch extrapolateRight {
    case .identity: return result
    case .clamp: result = inputMax
    case .wrap:
      let ширина = inputMax - inputMin
      result =
        (((result - inputMin).truncatingRemainder(dividingBy: ширина) + ширина)
          .truncatingRemainder(dividingBy: ширина)) + inputMin
    case .extend: break
    }
  }

  if outputMin == outputMax {
    return outputMin
  }

  result = (result - inputMin) / (inputMax - inputMin)
  result = easing.evaluate(result)
  result = result * (outputMax - outputMin) + outputMin
  return result
}

// MARK: - Remotion Easing (порт RN Easing + bezier)

/// Функция прогресса `t → t'`, как `Easing` в Remotion.
public struct Easing {
  public let evaluate: (Double) -> Double

  public init(_ f: @escaping (Double) -> Double) { self.evaluate = f }

  public static let linear = Easing { $0 }
  public static let step0 = Easing { $0 > 0 ? 1 : 0 }
  public static let step1 = Easing { $0 >= 1 ? 1 : 0 }
  /**
   * Clamp to [0,1] — exactly where Remotion does it, and only there.
   *
   * Remotion's easing.js runs `clampUnit(t)` before `circle`, `bounce` and
   * the bezier solver. Without it Swift diverged hard OUTSIDE the unit
   * interval, which is precisely where the springs in this project land:
   * they overshoot past 1 and feed `interpolate` with `extend`.
   *
   * Measured before the fix: `circle` returned NaN for |t| > 1 (negative
   * radicand) where Remotion returns 1 — 30 NaNs in a 161-point sweep, and
   * a NaN in a layer transform silently blanks the layer. `bounce(1.5)`
   * returned 3.234 against Remotion's 1.0.
   *
   * Clamping everything would be wrong in the other direction: `quad`,
   * `cubic` and `sin` are NOT clamped in Remotion, and their values outside
   * [0,1] are used.
   */
  @inline(__always)
  static func clampUnit(_ t: Double) -> Double { Swift.min(Swift.max(t, 0), 1) }

  public static let quad = Easing { $0 * $0 }
  public static let cubic = Easing { $0 * $0 * $0 }
  public static let sin = Easing { 1 - Foundation.cos(($0 * Double.pi) / 2) }
  public static let circle = Easing { let u = clampUnit($0); return 1 - (1 - u * u).squareRoot() }
  public static let exp = Easing { Foundation.pow(2, 10 * ($0 - 1)) }
  public static let ease = Easing.bezier(0.42, 0, 1, 1)

  public static func poly(_ n: Double) -> Easing {
    Easing { Foundation.pow($0, n) }
  }

  public static func elastic(_ bounciness: Double = 1) -> Easing {
    let p = bounciness * Double.pi
    return Easing { t in
      1 - Foundation.pow(Foundation.cos((t * Double.pi) / 2), 3) * Foundation.cos(t * p)
    }
  }

  public static func back(_ s: Double = 1.70158) -> Easing {
    Easing { t in t * t * ((s + 1) * t - s) }
  }

  public static let bounce = Easing { raw in
    let t = clampUnit(raw)
    if t < 1 / 2.75 { return 7.5625 * t * t }
    if t < 2 / 2.75 {
      let t2 = t - 1.5 / 2.75
      return 7.5625 * t2 * t2 + 0.75
    }
    if t < 2.5 / 2.75 {
      let t2 = t - 2.25 / 2.75
      return 7.5625 * t2 * t2 + 0.9375
    }
    let t2 = t - 2.625 / 2.75
    return 7.5625 * t2 * t2 + 0.984375
  }

  public static func bezier(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double) -> Easing {
    // Кламп ДО решателя: RN/Remotion делают это первой строкой возвращаемой
    // функции. Без него solve уходит за пределы кривой и даёт значения,
    // которых у Безье на [0,1] нет вовсе.
    {
      let b = UnitBezier(x1: x1, y1: y1, x2: x2, y2: y2)
      return Easing { b.solve(clampUnit($0)) }
    }()
  }

  public static func `in`(_ easing: Easing) -> Easing { easing }

  public static func out(_ easing: Easing) -> Easing {
    Easing { t in 1 - easing.evaluate(1 - t) }
  }

  public static func inOut(_ easing: Easing) -> Easing {
    Easing { t in
      if t < 0.5 { return easing.evaluate(t * 2) / 2 }
      return 1 - easing.evaluate((1 - t) * 2) / 2
    }
  }
}

/**
 * Единичная кубическая кривая Безье — порт RN `bezier.js`, тот же решатель,
 * что у Remotion.
 *
 * ЗАЧЕМ СВОЙ РЕШАТЕЛЬ, если есть `CAMediaTimingFunction(controlPoints:)`.
 * Он нужен ровно тогда, когда easing применяется НЕ к времени между двумя
 * ключами, а внутри запекаемого значения. Для чистого случая «одна
 * анимация, одна кривая по времени» `CAMediaTimingFunction(controlPoints:)`
 * эквивалентен (расхождение решателей порядка 1e-6 по прогрессу — ниже
 * кванта 8-битного цвета и субпиксельной сетки) и дешевле.
 *
 * ТОНКОСТЬ: таблица предвычисленных сэмплов в JS — `Float32Array`, то есть
 * ОДИНАРНАЯ точность. Здесь она тоже `[Float]`. Это влияет только на
 * начальное приближение Ньютона, но повторено намеренно: если когда-нибудь
 * начнём ловить расхождение на 1e-12, разница в стартовой точке итерации
 * станет единственным необъяснённым источником, и искать её будет дорого.
 */
public struct UnitBezier {
  private static let newtonIterations = 4
  private static let newtonMinSlope = 0.001
  private static let subdivisionPrecision = 0.0000001
  private static let subdivisionMaxIterations = 10
  private static let splineTableSize = 11
  private static let sampleStepSize = 1.0 / (11.0 - 1.0)

  private let x1: Double, y1: Double, x2: Double, y2: Double
  private let линейная: Bool
  private let сэмплы: [Float]

  public init(x1: Double, y1: Double, x2: Double, y2: Double) {
    precondition(
      x1 >= 0 && x1 <= 1 && x2 >= 0 && x2 <= 1,
      "bezier: x-координаты контрольных точек должны лежать в [0, 1]")
    self.x1 = x1
    self.y1 = y1
    self.x2 = x2
    self.y2 = y2
    self.линейная = (x1 == y1 && x2 == y2)
    if линейная {
      self.сэмплы = []
    } else {
      var t: [Float] = []
      t.reserveCapacity(Self.splineTableSize)
      for i in 0..<Self.splineTableSize {
        t.append(Float(Self.calcBezier(Double(i) * Self.sampleStepSize, x1, x2)))
      }
      self.сэмплы = t
    }
  }

  private static func a(_ a1: Double, _ a2: Double) -> Double { 1.0 - 3.0 * a2 + 3.0 * a1 }
  private static func b(_ a1: Double, _ a2: Double) -> Double { 3.0 * a2 - 6.0 * a1 }
  private static func c(_ a1: Double) -> Double { 3.0 * a1 }

  private static func calcBezier(_ t: Double, _ a1: Double, _ a2: Double) -> Double {
    ((a(a1, a2) * t + b(a1, a2)) * t + c(a1)) * t
  }

  private static func getSlope(_ t: Double, _ a1: Double, _ a2: Double) -> Double {
    3.0 * a(a1, a2) * t * t + 2.0 * b(a1, a2) * t + c(a1)
  }

  private func newtonRaphson(_ aX: Double, _ guess: Double) -> Double {
    var t = guess
    for _ in 0..<Self.newtonIterations {
      let наклон = Self.getSlope(t, x1, x2)
      if наклон == 0.0 { return t }
      let текущий = Self.calcBezier(t, x1, x2) - aX
      t -= текущий / наклон
    }
    return t
  }

  private func binarySubdivide(_ aX: Double, _ начало: Double, _ конец: Double) -> Double {
    var a = начало
    var b = конец
    var t = 0.0
    var x = 0.0
    var i = 0
    repeat {
      t = a + (b - a) / 2.0
      x = Self.calcBezier(t, x1, x2) - aX
      if x > 0.0 { b = t } else { a = t }
      i += 1
    } while abs(x) > Self.subdivisionPrecision && i < Self.subdivisionMaxIterations
    return t
  }

  private func tForX(_ aX: Double) -> Double {
    var началоИнтервала = 0.0
    var сэмпл = 1
    let последний = Self.splineTableSize - 1
    while сэмпл != последний && Double(сэмплы[сэмпл]) <= aX {
      началоИнтервала += Self.sampleStepSize
      сэмпл += 1
    }
    сэмпл -= 1

    let доля =
      (aX - Double(сэмплы[сэмпл])) / (Double(сэмплы[сэмпл + 1]) - Double(сэмплы[сэмпл]))
    let догадка = началоИнтервала + доля * Self.sampleStepSize
    let наклон = Self.getSlope(догадка, x1, x2)

    if наклон >= Self.newtonMinSlope { return newtonRaphson(aX, догадка) }
    if наклон == 0.0 { return догадка }
    return binarySubdivide(aX, началоИнтервала, началоИнтервала + Self.sampleStepSize)
  }

  public func solve(_ x: Double) -> Double {
    if линейная { return x }
    if x == 0 { return 0 }
    if x == 1 { return 1 }
    return Self.calcBezier(tForX(x), y1, y2)
  }

  /// Тот же Безье средствами CoreAnimation — для случая, когда кривая
  /// действительно управляет ВРЕМЕНЕМ между двумя ключами.
  public var timingFunction: CAMediaTimingFunction {
    CAMediaTimingFunction(controlPoints: Float(x1), Float(y1), Float(x2), Float(y2))
  }
}

// MARK: - Remotion spring

/// Конфиг пружины. Дефолты — как в `spring-utils.js`.
public struct SpringConfig: Equatable, Codable, Sendable {
  public var damping: Double
  public var mass: Double
  public var stiffness: Double
  public var overshootClamping: Bool

  public init(
    damping: Double = 10, mass: Double = 1, stiffness: Double = 100,
    overshootClamping: Bool = false
  ) {
    self.damping = damping
    self.mass = mass
    self.stiffness = stiffness
    self.overshootClamping = overshootClamping
  }

  /// ζ = c / (2·√(k·m)). Ветку формулы Remotion выбирает именно по нему.
  public var zeta: Double { damping / (2 * (stiffness * mass).squareRoot()) }
  /// ω₀ = √(k/m).
  public var omega0: Double { (stiffness / mass).squareRoot() }
}

/// Состояние пружины после очередного шага — как объект `animation` в Remotion.
public struct SpringState: Equatable, Sendable {
  public var toValue: Double
  public var prevPosition: Double
  /// Время последнего шага в МИЛЛИСЕКУНДАХ (Remotion считает в мс).
  public var lastTimestamp: Double
  public var current: Double
  public var velocity: Double

  public static let начальное = SpringState(
    toValue: 1, prevPosition: 0, lastTimestamp: 0, current: 0, velocity: 0)
}

/**
 * Один шаг пружины — побуквенный порт `advance()`.
 *
 * ТРИ МЕСТА, ГДЕ ЛЕГКО «УЛУЧШИТЬ» И РАЗОЙТИСЬ:
 *
 *  1. `deltaTime = min(now − lastTimestamp, 64)` — кламп на 64 мс. Он
 *     срабатывает при 1000/fps > 64, то есть при fps < 15.625: тогда
 *     пружина в реальном времени идёт МЕДЛЕННЕЕ, чем предсказывает
 *     непрерывное решение. Проверено: fps 10, 12 и 15 дают на кадре 6 одно
 *     и то же 0.998844833 (это 6 × 64 мс), а fps 16 — уже 0.999352906.
 *     Проект идёт на 30 fps, но кламп оставлен: чужая композиция на 12 fps
 *     не должна тихо разъехаться.
 *  2. При ζ ≥ 1 берётся КРИТИЧЕСКИ затухающая ветка независимо от того,
 *     насколько сильно передемпфирована пружина. Это не наша ошибка, это
 *     поведение Remotion, и повторять его обязательно (см. шапку файла).
 *  3. `v0 = −velocity` и `x0 = toValue − current` — знаки такие в оригинале;
 *     формула написана относительно ОСТАТКА до цели, а не абсолютной
 *     координаты.
 *
 * `advance` — точный аналитический пропагатор линейного ОДУ, а не численный
 * шаг: композиция шагов даёт точное непрерывное решение. Отсюда и право на
 * замкнутую формулу в `springClosedForm`.
 */
public func springAdvance(_ animation: SpringState, now: Double, config: SpringConfig)
  -> SpringState
{
  precondition(
    config.damping > 0,
    "spring: damping должен быть больше 0, иначе анимация никогда не закончится")

  let deltaTime = min(now - animation.lastTimestamp, 64)

  let c = config.damping
  let m = config.mass
  let k = config.stiffness

  let v0 = -animation.velocity
  let x0 = animation.toValue - animation.current

  let zeta = c / (2 * (k * m).squareRoot())
  let omega0 = (k / m).squareRoot()
  let t = deltaTime / 1000

  let позиция: Double
  let скорость: Double

  if zeta < 1 {
    let omega1 = omega0 * (1 - zeta * zeta).squareRoot()
    let sin1 = Foundation.sin(omega1 * t)
    let cos1 = Foundation.cos(omega1 * t)
    let огибающая = Foundation.exp(-zeta * omega0 * t)
    let frag1 = огибающая * (sin1 * ((v0 + zeta * omega0 * x0) / omega1) + x0 * cos1)
    позиция = animation.toValue - frag1
    скорость =
      zeta * omega0 * frag1
      - огибающая * (cos1 * (v0 + zeta * omega0 * x0) - omega1 * x0 * sin1)
  } else {
    // ВНИМАНИЕ: damping здесь не участвует вообще — только ω₀. Так в Remotion.
    let огибающая = Foundation.exp(-omega0 * t)
    позиция = animation.toValue - огибающая * (x0 + (v0 + omega0 * x0) * t)
    скорость = огибающая * (v0 * (t * omega0 - 1) + t * x0 * omega0 * omega0)
  }

  return SpringState(
    toValue: animation.toValue,
    prevPosition: animation.current,
    lastTimestamp: now,
    current: позиция,
    velocity: скорость)
}

/**
 * Порт `springCalculation` — цикл шагов от кадра 0 до `frame`.
 *
 * Дробный кадр обрабатывается так же криво, как в оригинале: последний
 * целый шаг СЛИВАЕТСЯ с дробным остатком, поэтому dt последнего шага равен
 * (1 + остаток)/fps секунд и может превысить кламп 64 мс даже на 24 fps.
 * Проверено: frame 9.6 при 24 fps даёт 0.996215792 вместо 0.996386127,
 * которые дала бы честная непрерывная кривая. Мы запекаем по целым кадрам,
 * так что в проекте это не встретится, но порт обязан быть портом.
 *
 * frame < 0 → ровно 0 (в Remotion `Math.max(0, frame)`).
 *
 * ПРЕДОХРАНИТЕЛЬ НА НЕКОНЕЧНЫЙ КАДР. Цикл идёт `while f <= целых`; при
 * frame = +∞ величина `целых` тоже бесконечна, и цикл не кончается НИКОГДА —
 * это не неверный кадр, а намертво зависший рендер без стека и без лога.
 * В JS ровно та же дыра, но там она недостижима, потому что вызывающий
 * `spring()` отсекает `durationInFrames: 0` truthy-проверкой. Мы держим
 * проверку и здесь: единственная строка, отделяющая опечатку в конфиге от
 * подвисшего процесса, должна стоять там, где крутится цикл.
 */
public func springCalculation(frame: Double, fps: Double, config: SpringConfig = SpringConfig())
  -> SpringState
{
  precondition(fps > 0, "springCalculation: fps должен быть > 0, получен \(fps)")
  precondition(
    frame.isFinite, "springCalculation: кадр должен быть конечным числом, получен \(frame)")

  var animation = SpringState.начальное
  let frameClamped = max(0, frame)
  let целых = frameClamped.rounded(.down)
  let остаток = frameClamped - целых

  var f: Double = 0
  while f <= целых {
    if f == целых { f += остаток }
    let время = (f / fps) * 1000
    animation = springAdvance(animation, now: время, config: config)
    f += 1
  }
  return animation
}

/**
 * Замкнутая формула той же пружины.
 *
 * Годится ТОЛЬКО когда каждый шаг короче клампа, то есть при fps ≥ 15.625,
 * и только для целых кадров. За этими границами она разойдётся с
 * рендерером — поэтому здесь не «оптимизация по вкусу», а функция с явной
 * проверкой применимости: `isApplicable`.
 *
 * Совпадение проверено численно на всех 9 конфигах проекта, кадры 0…200:
 * максимальное расхождение с цикличным `springCalculation` — 2.220e-16,
 * то есть машинный ноль double.
 */
public enum SpringClosedForm {
  public static func isApplicable(fps: Double, frame: Double) -> Bool {
    fps >= 1000.0 / 64.0 && frame == frame.rounded(.down) && frame >= 0
  }

  public static func value(frame: Double, fps: Double, config: SpringConfig) -> Double {
    let t = max(0, frame) / fps
    let zeta = config.zeta
    let w0 = config.omega0
    if zeta < 1 {
      let w1 = w0 * (1 - zeta * zeta).squareRoot()
      return 1
        - Foundation.exp(-zeta * w0 * t)
        * (Foundation.cos(w1 * t) + (zeta * w0 / w1) * Foundation.sin(w1 * t))
    }
    // ζ ≥ 1: damping выброшен — это воспроизведение поведения Remotion,
    // а не физика передемпфированного осциллятора.
    return 1 - Foundation.exp(-w0 * t) * (1 + w0 * t)
  }
}

/**
 * Значения пружины для кадров `0..<frameCount` за один проход.
 *
 * Наивный путь — звать `springCalculation` для каждого кадра — это O(N²)
 * шагов. Здесь O(N), и результат БИТ В БИТ тот же: последовательность
 * операций над состоянием совпадает, потому что `springCalculation` для
 * кадра F выполняет ровно те же шаги 0…F с теми же `now`.
 *
 * Это и есть основной вход запекателя.
 */
public func springSeries(frameCount: Int, fps: Double, config: SpringConfig = SpringConfig())
  -> [Double]
{
  precondition(frameCount > 0, "springSeries: нужен хотя бы один кадр")
  var animation = SpringState.начальное
  var результат: [Double] = []
  результат.reserveCapacity(frameCount)
  for f in 0..<frameCount {
    animation = springAdvance(animation, now: (Double(f) / fps) * 1000, config: config)
    результат.append(animation.current)
  }
  return результат
}

/**
 * Порт `measureSpring` — сколько кадров пружина оседает.
 *
 * Нужен только для `spring(durationInFrames:)` и `reverse: true`: Remotion
 * растягивает время в отношении durationInFrames / naturalDuration.
 *
 * Оригинал крутит `while` без верхней границы. Здесь стоит потолок в
 * `limit` кадров: при damping > 0 цикл завершается всегда, но потолок
 * превращает опечатку в конфиге (например mass = 1e9) из зависшего рендера
 * в внятное падение на месте ошибки.
 *
 * Remotion при threshold = 0 возвращает Infinity. Здесь такой вход
 * запрещён: «бесконечная длительность» дальше по коду всё равно
 * превращается в NaN, и лучше поймать это здесь.
 */
public func measureSpring(
  fps: Double, config: SpringConfig = SpringConfig(), threshold: Double = 0.005,
  limit: Int = 100_000
) -> Int {
  precondition(threshold > 0 && threshold < 1 && threshold.isFinite,
    "measureSpring: threshold должен лежать в (0, 1), получен \(threshold)")

  var frame = 0
  var animation = springCalculation(frame: 0, fps: fps, config: config)
  var разница = abs(animation.current - animation.toValue)

  while разница >= threshold {
    frame += 1
    precondition(frame < limit, "measureSpring: пружина не оседает за \(limit) кадров — проверь конфиг")
    animation = springCalculation(frame: Double(frame), fps: fps, config: config)
    разница = abs(animation.current - animation.toValue)
  }

  // Пружина пружинит: уход под порог ещё не означает, что она встала.
  // Оригинал требует 20 кадров подряд под порогом.
  var финальный = frame
  var i = 0
  while i < 20 {
    frame += 1
    precondition(frame < limit, "measureSpring: пружина не оседает за \(limit) кадров — проверь конфиг")
    animation = springCalculation(frame: Double(frame), fps: fps, config: config)
    разница = abs(animation.current - animation.toValue)
    if разница >= threshold {
      i = 0
      финальный = frame + 1
    } else {
      i += 1
    }
  }
  return финальный
}

/**
 * Порт публичного `spring()` из Remotion, со всеми аргументами.
 *
 * В композициях проекта используется только простая форма
 * `spring({frame, fps, config})`, но `durationInFrames`, `delay`, `reverse`,
 * `from`/`to` и `overshootClamping` портированы целиком: как только их
 * добавят в композицию, расхождение появится молча, и найти его будет
 * дороже, чем написать эти двадцать строк сейчас.
 *
 * `overshootClamping` обрезает перелёт именно ЗДЕСЬ, а не внутри
 * `springCalculation` — важно, потому что в цикле шагов состояние остаётся
 * необрезанным и продолжает влиять на следующие шаги.
 */
public func spring(
  frame: Double,
  fps: Double,
  config: SpringConfig = SpringConfig(),
  from: Double = 0,
  to: Double = 1,
  durationInFrames: Int? = nil,
  durationRestThreshold: Double = 0.005,
  delay: Double = 0,
  reverse: Bool = false
) -> Double {
  let нуженЗамер = reverse || durationInFrames != nil
  let естественная: Int? =
    нуженЗамер
    ? measureSpring(fps: fps, config: config, threshold: durationRestThreshold) : nil

  let послеРеверса: Double
  if reverse {
    // durationInFrames приоритетнее естественной длительности — так в оригинале.
    let база = durationInFrames ?? естественная!
    послеРеверса = Double(база) - frame
  } else {
    послеРеверса = frame
  }

  let послеЗадержки = послеРеверса + (reverse ? delay : -delay)

  let итоговыйКадр: Double
  // Проверка в оригинале написана через truthy: `durationInFrames` равный
  // НУЛЮ считается «не задан» — и в раннем выходе, и в масштабировании
  // времени, потому что в JS обе строки стоят под одним и тем же `if
  // (durationInFrames)`. Поэтому `d != 0` обязано быть УСЛОВИЕМ ВЕТКИ, а не
  // проверкой внутри неё.
  //
  // Что было, пока оно стояло внутри: при d == 0 множитель
  // `Double(d) / Double(естественная!)` равен нулю, деление на него даёт
  // ±∞, и `springCalculation(frame: ∞)` крутит `while f <= ∞` вечно.
  // Не «кадр разошёлся с Remotion», а зависший рендер: проверено, процесс
  // не завершается и его приходится убивать.
  if let d = durationInFrames, d != 0 {
    if послеЗадержки > Double(d) { return to }
    итоговыйКадр = послеЗадержки / (Double(d) / Double(естественная!))
  } else {
    итоговыйКадр = послеЗадержки
  }

  let spr = springCalculation(frame: итоговыйКадр, fps: fps, config: config)

  var внутреннее = spr.current
  if config.overshootClamping {
    внутреннее = to >= from ? min(spr.current, to) : max(spr.current, to)
  }

  if from == 0 && to == 1 { return внутреннее }
  return interpolate(внутреннее, [0, 1], [from, to])
}

// MARK: - Описание анимации свойства

/// Как CoreAnimation обязан вести себя МЕЖДУ покадровыми сэмплами.
public enum SamplingMode: String, Codable, Sendable {
  /// Числовые свойства: сэмплы попадают ровно в узлы, между ними — прямая.
  case linear
  /// Неинтерполируемые состояния (зерно, подмена текста, раскладка):
  /// смешивать соседние значения нельзя ни на йоту.
  case discrete
}

/**
 * Во времени какого слоя живёт анимация.
 *
 * ЛОВУШКА, из-за которой кадр уезжает ровно на `from` кадров:
 * `<Sequence from={N}>` переносится в `layer.beginTime`, и после этого
 * вложенные анимации ОТСЧИТЫВАЮТСЯ ОТ ЛОКАЛЬНОГО НУЛЯ слоя — прибавлять
 * им ещё раз N/fps нельзя. И наоборот: NoirReel рисует Masthead и Captions
 * СНАРУЖИ Sequence, TrinityBlogReel держит снаружи Paper/Frame/Caption —
 * этим слоям сдвиг не положен.
 */
public enum AnimationTimebase: Equatable, Sendable {
  /// Слой живёт в абсолютном времени композиции.
  case absolute
  /// Слой уже сдвинут своим `beginTime` (аналог `<Sequence from>`).
  case sequenceLocal(from: Int)

  /// Кадр композиции → кадр в системе отсчёта слоя.
  func локальныйКадр(_ абсолютный: Int) -> Int {
    switch self {
    case .absolute: return абсолютный
    case .sequenceLocal(let from): return абсолютный - from
    }
  }
}

/**
 * Описание одной анимируемой величины: какое свойство слоя, какие кадры
 * композиции и как получить значение на каждом из них.
 *
 * `sample` принимает АБСОЛЮТНЫЙ кадр композиции и возвращает значение
 * ИТОГОВОГО свойства — не пружины, не промежуточного прогресса. Это
 * принципиально: `translateX = interpolate(spring(f), [0,1], [-50,0])` с
 * дефолтным `extrapolate: 'extend'` уходит в ПЛЮС до +4.362 px на кадрах
 * 7–16, потому что пружина {damping: 15, stiffness: 150} перелетает до
 * 1.08724 на кадре 10. Запекать пружину отдельно и «дотягивать» её
 * timing-функцией — значит потерять этот отскок. Запечённое итоговое
 * свойство содержит его само собой.
 */
public struct PropertyAnimation {
  /// keyPath слоя: "opacity", "transform.scale", "transform.translation.x", …
  public var keyPath: String
  /// Первый кадр композиции, для которого есть сэмпл.
  public var startFrame: Int
  /// Сколько кадров запекаем. Ровно столько сэмплов и будет.
  public var frameCount: Int
  public var mode: SamplingMode
  /// Абсолютный кадр композиции → значение свойства.
  public var sample: (Int) -> Double

  public init(
    keyPath: String, startFrame: Int, frameCount: Int, mode: SamplingMode = .linear,
    sample: @escaping (Int) -> Double
  ) {
    precondition(frameCount > 0, "PropertyAnimation(\(keyPath)): frameCount должен быть > 0")
    self.keyPath = keyPath
    self.startFrame = startFrame
    self.frameCount = frameCount
    self.mode = mode
    self.sample = sample
  }

  /// Все значения по кадрам — то, что уйдёт в `values` и в JSON-сверку.
  public func values() -> [Double] {
    (0..<frameCount).map { sample(startFrame + $0) }
  }
}

extension PropertyAnimation {
  /**
   * Свойство, ведомое пружиной: `map` превращает выход пружины в само
   * свойство (`s → 0.92 + s * 0.08` для NoirReel, `s → -50 + s * 50` для
   * слайда титра, `s → min(1, s * 1.6)` для прозрачности PromoV2).
   *
   * Пружина считается ОДИН раз на весь отрезок (`springSeries`, O(N)), а не
   * заново на каждый кадр.
   *
   * Кадр `startFrame` соответствует кадру пружины 0 — так и работает
   * `spring({frame: useCurrentFrame()})` внутри `<Sequence from>`. Если в
   * композиции пружина считается от АБСОЛЮТНОГО кадра (Masthead и Captions
   * NoirReel — снаружи Sequence), то `startFrame` должен быть 0.
   */
  public static func springDriven(
    keyPath: String,
    startFrame: Int,
    frameCount: Int,
    fps: Int,
    config: SpringConfig,
    mode: SamplingMode = .linear,
    map: @escaping (Double) -> Double
  ) -> PropertyAnimation {
    let ряд = springSeries(frameCount: frameCount, fps: Double(fps), config: config)
    return PropertyAnimation(
      keyPath: keyPath, startFrame: startFrame, frameCount: frameCount, mode: mode
    ) { кадр in
      let i = кадр - startFrame
      // За пределами отрезка держим края: сам отрезок и есть область
      // определения, а `bake` дальше него ничего не спрашивает.
      if i <= 0 { return map(ряд[0]) }
      if i >= ряд.count { return map(ряд[ряд.count - 1]) }
      return map(ряд[i])
    }
  }

  /// Свойство, ведомое `interpolate` от номера кадра.
  ///
  /// `inputRange` задаётся в той же системе отсчёта, в какой приходит
  /// аргумент `sample`, то есть в кадрах КОМПОЗИЦИИ. Если в TSX стоит
  /// `interpolate(frame, [0, 12], …)` внутри `<Sequence from={90}>`, то
  /// сюда идёт `[90, 102]` — либо `startFrame: 90` и вычитание снаружи.
  public static func interpolated(
    keyPath: String,
    startFrame: Int,
    frameCount: Int,
    inputRange: [Double],
    outputRange: [Double],
    easing: Easing = .linear,
    extrapolateLeft: Extrapolation = .extend,
    extrapolateRight: Extrapolation = .clamp,
    mode: SamplingMode = .linear
  ) -> PropertyAnimation {
    PropertyAnimation(
      keyPath: keyPath, startFrame: startFrame, frameCount: frameCount, mode: mode
    ) { кадр in
      interpolate(
        Double(кадр), inputRange, outputRange, easing: easing,
        extrapolateLeft: extrapolateLeft, extrapolateRight: extrapolateRight)
    }
  }
}

// MARK: - Запекатель

/// Снимок запечённых значений — для численной сверки с node-прогоном.
public struct BakedTrack: Codable, Equatable {
  public let keyPath: String
  public let startFrame: Int
  public let fps: Int
  public let mode: SamplingMode
  public let values: [Double]

  public func json() throws -> Data {
    let enc = JSONEncoder()
    enc.outputFormatting = [.sortedKeys]
    return try enc.encode(self)
  }

  /// Максимальное расхождение с эталоном (значения из Remotion), покадрово.
  /// Порог сверки, объявленный заранее: 1e-9.
  public func maxDeviation(from эталон: [Double]) -> Double {
    precondition(
      эталон.count == values.count,
      "maxDeviation: длины не совпали — \(values.count) против \(эталон.count); "
        + "сверять надо кадр в кадр, а не «примерно тот же отрезок»")
    var максимум = 0.0
    for i in 0..<values.count { максимум = max(максимум, abs(values[i] - эталон[i])) }
    return максимум
  }
}

public enum CABaker {

  /// Соглашение по длине `keyTimes` для `.discrete`.
  ///
  /// Источники расходятся: заголовок `CAAnimation.h` (строки 182–186)
  /// утверждает соответствие `keyTimes` и `values` один к одному,
  /// документация Apple для `discrete` требует `values.count + 1`.
  /// Выбирать по вере нельзя — надо измерить на первом же прогоне
  /// (отрендерить кадр, где значение меняется, и посмотреть, на каком кадре
  /// оно фактически сменилось). Дефолт здесь — версия документации.
  public enum DiscreteKeyTimes: Sendable {
    case valuesPlusOne
    case oneToOne
  }

  /**
   * Собрать `CAKeyframeAnimation` по покадровым сэмплам.
   *
   * ПОЧЕМУ РОВНО ОДИН СЭМПЛ НА КАДР. Эталон — кадры, которые выдаёт
   * Remotion, а он вычисляет `useCurrentFrame()` только в целых кадрах.
   * Сэмплировать чаще (каждые 1/60 с, каждые 16 мс) — значит создать
   * значения, которых в эталоне не существует; любое расхождение станет
   * неотличимо от ошибки интерполяции. Сэмплировать реже — значит внести
   * ровно ту ошибку, ради устранения которой всё и затевалось. Данных это
   * стоит немного: 1020 Double на трек — около 8 КБ, десяток треков —
   * сотня килобайт. Прореживать НЕ НАДО.
   *
   * ПОЧЕМУ `.linear`, А НЕ `.discrete`, ДЛЯ ЧИСЕЛ. Рендер-тул сэмплирует
   * композицию в моменты предъявления кадров, то есть ровно в `keyTimes`.
   * Линейная интерполяция, вычисленная точно в узле, возвращает сам узел —
   * то есть в узлах она точна. Если сэмпл придёт на эпсилон раньше или
   * позже, `.linear` ошибётся на порядок эпсилона (незаметно), а
   * `.discrete` откатится на целый шаг назад (заметно).
   *
   * ПОЧЕМУ `timingFunction = nil`. Дефолт `CABasicAnimation`/
   * `CAKeyframeAnimation` — `.easeInEaseOut`. Он исказит даже правильно
   * запечённые values, притом тихо: сборка не ломается, ошибка видна только
   * на глаз в движении.
   *
   * РАСХОЖДЕНИЕ СО СПЕЦИФИКАЦИЕЙ, СОЗНАТЕЛЬНОЕ. В ТЗ для `.linear` стоит
   * `duration = N/fps` при `keyTimes[i] = i/(N−1)`. Эти две строки
   * несовместимы: сэмпл i должен предъявляться в момент i/fps, значит
   * keyTime[i] = (i/fps)/duration, и при `keyTimes[i] = i/(N−1)` из этого
   * следует `duration = (N−1)/fps`. С `N/fps` вся дорожка растягивается в
   * N/(N−1) раз — на 810 кадрах NoirReel последний сэмпл приезжает почти на
   * целый кадр позже, чем должен. Здесь взято `(N−1)/fps`; хвост после
   * конца держит `fillMode = .both`, так что ничего не теряется.
   * Для `.discrete` формула ТЗ верна и оставлена как есть: там каждый сэмпл
   * ЗАНИМАЕТ кадр целиком, поэтому дорожка длится N кадров, а keyTimes
   * идут шагом 1/N.
   */
  public static func bake(
    _ animation: PropertyAnimation,
    fps: Int,
    timebase: AnimationTimebase = .absolute,
    discreteKeyTimes: DiscreteKeyTimes = .valuesPlusOne
  ) -> CAKeyframeAnimation {
    let значения = animation.values()
    return собрать(
      keyPath: animation.keyPath,
      значения: значения.map { NSNumber(value: $0) },
      startFrame: animation.startFrame,
      fps: fps,
      mode: animation.mode,
      timebase: timebase,
      discreteKeyTimes: discreteKeyTimes)
  }

  /**
   * То же для НЕЧИСЛОВЫХ покадровых значений: `contents` (кадр зерна),
   * `string` у `CATextLayer` (подмена текста), `hidden` у слоя раскладки.
   * Режим всегда `.discrete` — смешивать два соседних состояния нельзя, и
   * CoreAnimation для таких типов всё равно не умеет интерполировать.
   *
   * `values` идут по одному на кадр, начиная с `startFrame`, как и в
   * числовом случае.
   */
  public static func bakeDiscrete(
    keyPath: String,
    values: [Any],
    startFrame: Int,
    fps: Int,
    timebase: AnimationTimebase = .absolute,
    discreteKeyTimes: DiscreteKeyTimes = .valuesPlusOne
  ) -> CAKeyframeAnimation {
    precondition(!values.isEmpty, "bakeDiscrete(\(keyPath)): нет значений")
    return собрать(
      keyPath: keyPath,
      значения: values,
      startFrame: startFrame,
      fps: fps,
      mode: .discrete,
      timebase: timebase,
      discreteKeyTimes: discreteKeyTimes)
  }

  private static func собрать(
    keyPath: String,
    значения: [Any],
    startFrame: Int,
    fps: Int,
    mode: SamplingMode,
    timebase: AnimationTimebase,
    discreteKeyTimes: DiscreteKeyTimes
  ) -> CAKeyframeAnimation {
    precondition(fps > 0, "bake(\(keyPath)): fps должен быть > 0")
    let anim = CAKeyframeAnimation(keyPath: keyPath)
    let N = значения.count

    switch mode {
    case .linear:
      if N == 1 {
        // Один сэмпл — это не анимация, а константа. Дублируем его, чтобы
        // не делить на (N−1) = 0 и чтобы CoreAnimation получил валидную
        // пару ключей; смысл (удержать значение) сохраняется.
        anim.values = [значения[0], значения[0]]
        anim.keyTimes = [0, 1]
        anim.duration = 1.0 / Double(fps)
      } else {
        anim.values = значения
        anim.keyTimes = (0..<N).map { NSNumber(value: Double($0) / Double(N - 1)) }
        anim.duration = Double(N - 1) / Double(fps)
      }
      anim.calculationMode = .linear

    case .discrete:
      anim.values = значения
      anim.duration = Double(N) / Double(fps)
      switch discreteKeyTimes {
      case .valuesPlusOne:
        anim.keyTimes = (0...N).map { NSNumber(value: Double($0) / Double(N)) }
      case .oneToOne:
        anim.keyTimes = (0..<N).map { NSNumber(value: Double($0) / Double(N)) }
      }
      anim.calculationMode = .discrete
    }

    anim.beginTime = beginTime(startFrame: startFrame, fps: fps, timebase: timebase)
    // `.both` держит и левый край (до beginTime), и правый (после duration).
    // Правый край — это и есть `extrapolateRight: 'clamp'`, который стоит
    // почти во всех interpolate проекта.
    anim.fillMode = .both
    // Без этого CoreAnimation снимет анимацию по истечении duration, и
    // свойство скакнёт обратно к model value слоя — ровно случай (b) из
    // AVVideoComposition.h:779.
    anim.isRemovedOnCompletion = false
    // Явно: дефолт .easeInEaseOut исказил бы запечённые значения.
    anim.timingFunction = nil
    return anim
  }

  /**
   * `beginTime` анимации.
   *
   * ПОЧЕМУ ВЕЗДЕ `AVCoreAnimationBeginTimeAtZero`, А НЕ ЛИТЕРАЛЬНЫЙ НОЛЬ —
   * включая случай, когда слой уже сдвинут своим `beginTime`. CoreAnimation
   * трактует `beginTime == 0` как «начать в текущий момент» и подменяет его
   * на `CACurrentMediaTime()` при добавлении анимации; в офлайн-рендере это
   * даёт непредсказуемый сдвиг. `AVCoreAnimationBeginTimeAtZero` — крошечное
   * положительное число (1e-100), существующее ровно для обхода этой
   * подмены, и в сумме с любым осмысленным временем оно неотличимо от нуля.
   * То есть для `.sequenceLocal` мы прибавляем «ноль», но безопасный.
   */
  public static func beginTime(startFrame: Int, fps: Int, timebase: AnimationTimebase)
    -> CFTimeInterval
  {
    let кадровОтНуляСлоя = Double(timebase.локальныйКадр(startFrame))
    return AVCoreAnimationBeginTimeAtZero + кадровОтНуляСлоя / Double(fps)
  }

  /**
   * Перенести `<Sequence from={N}>` на слой-контейнер сцены.
   *
   * ЧЕГО ЭТО НЕ ДЕЛАЕТ: `beginTime` сдвигает только время АНИМАЦИЙ слоя, но
   * не его рисование — слой виден и до `beginTime`, тогда как Sequence
   * попросту не монтирует детей вне окна. Поэтому в паре с этим вызовом
   * почти всегда нужен `sequenceVisibility` — но НА РОДИТЕЛЬСКОМ слое, а не
   * на этом: `CAMediaTiming` наследуется вниз, и окно видимости, повешенное
   * сюда, уехало бы на `from` кадров второй раз. Раскладка описана в
   * `sequenceVisibility`.
   */
  public static func applySequenceBeginTime(_ layer: CALayer, from: Int, fps: Int) {
    precondition(fps > 0, "applySequenceBeginTime: fps должен быть > 0")
    layer.beginTime = AVCoreAnimationBeginTimeAtZero + Double(from) / Double(fps)
  }

  /**
   * Окно видимости `<Sequence from durationInFrames>` через `opacity`.
   *
   * `CAMediaTiming.duration` слой НЕ ПРЯЧЕТ: после конца он остаётся на
   * экране с последним значением. Sequence же выбрасывает поддерево. Забыть
   * об этом легко, потому что первая сцена рисуется правильно, а лишним
   * оказывается ХВОСТ, лежащий поверх следующих сцен.
   *
   * Режим `.discrete` обязателен: включение сцены — это не плавное
   * появление, а факт монтирования.
   *
   * КУДА ЕЁ ВЕШАТЬ — НЕ НА ТОТ ЖЕ СЛОЙ, ЧТО `applySequenceBeginTime`.
   * Анимация строится в АБСОЛЮТНОМ времени композиции: кадр k лежит в
   * `keyTimes[k] = k / totalFrames`. `CAMediaTiming` наследуется вниз по
   * дереву, поэтому у слоя со сдвинутым `beginTime` СВОИ анимации тоже
   * читаются в его локальном времени — окно уехало бы ещё раз на `from`
   * кадров и получилось бы `[2·from, 2·from + duration)`. Ошибка тихая:
   * первая сцена (from = 0) выглядит правильно, а разъезжаются следующие.
   *
   * Правильная раскладка — два слоя на сцену, как это уже сделано в
   * `LayerBuilder`:
   *
   *   обёртка  `beginTime = AVCoreAnimationBeginTimeAtZero` (НЕ сдвинута)
   *            ← сюда `sequenceVisibility`, абсолютное время;
   *   лист     `applySequenceBeginTime(лист, from:fps:)`
   *            ← сюда `bake(..., timebase: .sequenceLocal(from:))`.
   *
   * Поэтому `timebase` здесь и не параметризуется: у этой анимации есть
   * ровно одно верное место, и оно — на несдвинутом родителе.
   *
   * ЧЕГО ЭТО НЕ ДАЁТ: Sequence при повторном входе в окно МОНТИРУЕТ детей
   * заново, и пружины стартуют с нуля. `CALayer` состояния не теряет.
   * Если сцена показывается дважды, второй вход надо описывать своими
   * запечёнными значениями, а не рассчитывать на «оно само перезапустится».
   */
  public static func sequenceVisibility(
    from: Int,
    durationInFrames: Int,
    totalFrames: Int,
    fps: Int,
    discreteKeyTimes: DiscreteKeyTimes = .valuesPlusOne
  ) -> CAKeyframeAnimation {
    precondition(fps > 0 && totalFrames > 0, "sequenceVisibility: пустая композиция")
    precondition(durationInFrames > 0, "sequenceVisibility: durationInFrames должен быть > 0")
    precondition(
      from >= 0 && from + durationInFrames <= totalFrames,
      "sequenceVisibility: окно [\(from), \(from + durationInFrames)) выходит за композицию "
        + "длиной \(totalFrames)")

    // Покадровая маска 0/1 — и есть точное описание монтирования. Строим её
    // именно покадрово, а не тремя ключами: тогда и первый кадр ПОСЛЕ окна
    // (from + durationInFrames) гарантированно нулевой, а это ровно тот
    // кадр, на котором ошибка обычно и обнаруживается.
    let значения: [NSNumber] = (0..<totalFrames).map { f in
      NSNumber(value: (f >= from && f < from + durationInFrames) ? 1.0 : 0.0)
    }
    return собрать(
      keyPath: "opacity",
      значения: значения,
      startFrame: 0,
      fps: fps,
      mode: .discrete,
      timebase: .absolute,
      discreteKeyTimes: discreteKeyTimes)
  }

  /// Снимок значений для численной сверки с node-прогоном (порог 1e-9).
  ///
  /// Порождать значения ПРАВИЛЬНО из Remotion: node-скрипт импортирует
  /// `springCalculation` из установленного пакета и печатает JSON. Тогда
  /// обновление remotion ловится диффом JSON, а не превращается в тихое
  /// расхождение. Swift-реализация выше нужна для запекания на устройстве
  /// без Node — и обязана тестироваться против того же JSON.
  public static func dump(_ animation: PropertyAnimation, fps: Int) -> BakedTrack {
    BakedTrack(
      keyPath: animation.keyPath,
      startFrame: animation.startFrame,
      fps: fps,
      mode: animation.mode,
      values: animation.values())
  }
}

// MARK: - Мост к модели композиции

extension Composition {
  /**
   * Окно видимости клипа — тот же механизм, что у `<Sequence>`: клип
   * существует с `startFrame` и ровно `durationInFrames` кадров, а
   * `opacity` берётся из модели.
   *
   * Возвращает готовую анимацию для слоя клипа. Значение вне окна — ноль,
   * то есть слоя нет; внутри — `clip.opacity`.
   *
   * Как и `sequenceVisibility`, эта анимация в АБСОЛЮТНОМ времени ролика и
   * вешается на ОБЁРТКУ клипа — тот слой, чей `beginTime` равен
   * `AVCoreAnimationBeginTimeAtZero` без сдвига. На листе, сдвинутом на
   * `clip.startFrame`, окно уехало бы на `startFrame` кадров второй раз.
   */
  public func clipVisibility(for clip: Clip) -> CAKeyframeAnimation {
    let всего = max(durationInFrames, clip.startFrame + clip.durationInFrames)
    let значения: [NSNumber] = (0..<всего).map { f in
      let внутри = f >= clip.startFrame && f < clip.startFrame + clip.durationInFrames
      return NSNumber(value: внутри ? clip.opacity : 0)
    }
    return CABaker.bakeDiscrete(
      keyPath: "opacity", values: значения, startFrame: 0, fps: fps, timebase: .absolute)
  }
}
