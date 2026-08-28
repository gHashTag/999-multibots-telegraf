import Foundation
let fps = 30.0
let cfgs: [(String, SpringConfig)] = [
  ("captions_pop",      SpringConfig(damping: 12, mass: 0.4, stiffness: 180)),
  ("captions_bounce",   SpringConfig(damping: 8,  mass: 0.3, stiffness: 200)),
  ("captions_slide",    SpringConfig(damping: 15, mass: 1,   stiffness: 150)),
  ("captions_scaleRot", SpringConfig(damping: 10, mass: 0.3, stiffness: 200)),
  ("noir_word",         SpringConfig(damping: 200, mass: 1,  stiffness: 380)),
  ("promoV3_title",     SpringConfig(damping: 16, mass: 1,   stiffness: 170)),
  ("promoV3_cta",       SpringConfig(damping: 14, mass: 1,   stiffness: 100)),
  ("promoV2_title",     SpringConfig(damping: 14, mass: 1,   stiffness: 160)),
  ("promoV2_cta",       SpringConfig(damping: 13, mass: 1,   stiffness: 100)),
]
var out: [String] = []
for (name, cfg) in cfgs {
  var v: [String] = []
  for f in 0...60 {
    v.append(String(format: "%.15g", springCalculation(frame: Double(f), fps: fps, config: cfg).current))
  }
  out.append("\"\(name)\":[\(v.joined(separator: ","))]")
}
// Easing и interpolate на том же наборе входов, включая выход за [0,1].
var T: [Double] = []
for i in -30...130 { T.append(Double(i) / 100) }

let easings: [(String, Easing)] = [
  ("bezier_0_4_0_0_2_1", Easing.bezier(0.4, 0, 0.2, 1)),
  ("circle", Easing.circle),
  ("bounce", Easing.bounce),
  ("cubic", Easing.cubic),
  ("out_cubic", Easing.out(Easing.cubic)),
  ("ease", Easing.ease),
  ("quad", Easing.quad),
  ("sin", Easing.sin),
]
for (name, e) in easings {
  let v = T.map { String(format: "%.15g", e.evaluate($0)) }
  out.append("\"ease_\(name)\":[\(v.joined(separator: ","))]")
}
func row(_ name: String, _ f: (Double) -> Double) {
  let v = T.map { String(format: "%.15g", f($0)) }
  out.append("\"\(name)\":[\(v.joined(separator: ","))]")
}
row("interp_default") { interpolate($0 * 12, [0, 12], [0, 1]) }
row("interp_clamp") {
  interpolate($0 * 12, [0, 12], [0, 1], extrapolateLeft: .clamp, extrapolateRight: .clamp)
}
row("interp_multi") { interpolate($0 * 12, [0, 4, 8, 12], [0, 1, 0.2, 1]) }

let measure: [(String, SpringConfig)] = [
  ("m_captions_pop",    SpringConfig(damping: 12, mass: 0.4, stiffness: 180)),
  ("m_captions_bounce", SpringConfig(damping: 8,  mass: 0.3, stiffness: 200)),
  ("m_captions_slide",  SpringConfig(damping: 15, mass: 1,   stiffness: 150)),
  ("m_noir_word",       SpringConfig(damping: 200, mass: 1,  stiffness: 380)),
  ("m_promoV3_cta",     SpringConfig(damping: 14, mass: 1,   stiffness: 100)),
  ("m_bouncy",          SpringConfig(damping: 3,  mass: 2,   stiffness: 120)),
  ("m_very_bouncy",     SpringConfig(damping: 1,  mass: 3,   stiffness: 100)),
]
for (name, cfg) in measure {
  let v = measureSpring(fps: fps, config: cfg, threshold: 0.005)
  out.append("\"\(name)\":[\(v)]")
}

print("{\(out.joined(separator: ","))}")
