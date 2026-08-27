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
print("{\(out.joined(separator: ","))}")
