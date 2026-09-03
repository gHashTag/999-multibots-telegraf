// Эталон: значения ИЗ САМОГО Remotion, а не из моей реконструкции формулы.
/**
 * Remotion is resolved RELATIVE TO THIS REPOSITORY, never by absolute path.
 *
 * This line used to name a directory inside one particular person's home
 * folder, so the check below could not run anywhere else -- and a check that
 * cannot run is not a check. It looked wired up: the script exists, the Swift
 * side builds, the comparison is written. It simply died on require() for
 * everyone except its author.
 */
const path = require('path')
/**
 * The package DIRECTORY is located relatively, then the deep file is joined on.
 * require.resolve would honour Remotion's `exports` map, which does not expose
 * these internals -- and reaching past `exports` is the whole point here: the
 * reference has to be the shipping implementation, not the public surface.
 */
const REMOTION = path.join(
  __dirname,
  '..',
  '..',
  'vibee-editor',
  'render',
  'node_modules',
  'remotion',
  'dist',
  'cjs'
)
const { springCalculation } = require(
  path.join(REMOTION, 'spring', 'spring-utils.js')
)
const fps = 30
const CFGS = [
  ['captions_pop', { damping: 12, stiffness: 180, mass: 0.4 }],
  ['captions_bounce', { damping: 8, stiffness: 200, mass: 0.3 }],
  ['captions_slide', { damping: 15, stiffness: 150 }],
  ['captions_scaleRot', { damping: 10, stiffness: 200, mass: 0.3 }],
  ['noir_word', { damping: 200, stiffness: 380 }],
  ['promoV3_title', { damping: 16, stiffness: 170 }],
  ['promoV3_cta', { damping: 14 }],
  ['promoV2_title', { damping: 14, stiffness: 160 }],
  ['promoV2_cta', { damping: 13 }],
]
// Easing и interpolate: те же входы, включая ВЫХОД ЗА ДИАПАЗОН.
// Remotion клампит вход у части функций; расхождение проявляется только за
// границами [0,1], поэтому пробуем именно их.
const { Easing, interpolate } = require(path.join(REMOTION, 'index.js'))
const T = []
for (let i = -30; i <= 130; i++) T.push(i / 100) // от -0.3 до 1.3

const EASINGS = [
  ['bezier_0_4_0_0_2_1', Easing.bezier(0.4, 0, 0.2, 1)],
  ['circle', Easing.circle],
  ['bounce', Easing.bounce],
  ['cubic', Easing.cubic],
  ['out_cubic', Easing.out(Easing.cubic)],
  ['ease', Easing.ease],
  ['quad', Easing.quad],
  ['sin', Easing.sin],
]

const out = {}
out.__easing = { inputs: T }
for (const [name, fn] of EASINGS) {
  out['ease_' + name] = { values: T.map(t => fn(t)) }
}
// interpolate БЕЗ options — дефолт Remotion для extrapolate — 'extend'.
out.interp_default = {
  values: T.map(t => interpolate(t * 12, [0, 12], [0, 1])),
}
out.interp_clamp = {
  values: T.map(t =>
    interpolate(t * 12, [0, 12], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  ),
}
out.interp_multi = {
  values: T.map(t => interpolate(t * 12, [0, 4, 8, 12], [0, 1, 0.2, 1])),
}

for (const [name, cfg] of CFGS) {
  const vals = []
  for (let f = 0; f <= 60; f++) {
    vals.push(springCalculation({ frame: f, fps, config: cfg }).current)
  }
  out[name] = { config: cfg, values: vals }
}
// measureSpring: естественная длительность. От неё считается всё
// масштабирование spring(durationInFrames:), поэтому расхождение здесь
// сдвигает КАЖДУЮ анимацию, а не одну.
const { measureSpring } = require(
  path.join(REMOTION, 'spring', 'measure-spring.js')
)
const MEASURE = [
  ['m_captions_pop', { damping: 12, stiffness: 180, mass: 0.4 }],
  ['m_captions_bounce', { damping: 8, stiffness: 200, mass: 0.3 }],
  ['m_captions_slide', { damping: 15, stiffness: 150 }],
  ['m_noir_word', { damping: 200, stiffness: 380 }],
  ['m_promoV3_cta', { damping: 14 }],
  // Низкое затухание при большой массе — самый «пружинистый» случай, где
  // окно осадки решает.
  ['m_bouncy', { damping: 3, stiffness: 120, mass: 2 }],
  ['m_very_bouncy', { damping: 1, stiffness: 100, mass: 3 }],
]
for (const [name, cfg] of MEASURE) {
  out[name] = {
    values: [measureSpring({ fps, config: cfg, threshold: 0.005 })],
  }
}
console.log(JSON.stringify(out))
