// Эталон: значения ИЗ САМОГО Remotion, а не из моей реконструкции формулы.
const {springCalculation} = require('/Users/playom/999-multibots-telegraf/apps/vibee-editor/render/node_modules/remotion/dist/cjs/spring/spring-utils.js')
const fps = 30
const CFGS = [
  ['captions_pop',       {damping:12, stiffness:180, mass:0.4}],
  ['captions_bounce',    {damping:8,  stiffness:200, mass:0.3}],
  ['captions_slide',     {damping:15, stiffness:150}],
  ['captions_scaleRot',  {damping:10, stiffness:200, mass:0.3}],
  ['noir_word',          {damping:200, stiffness:380}],
  ['promoV3_title',      {damping:16, stiffness:170}],
  ['promoV3_cta',        {damping:14}],
  ['promoV2_title',      {damping:14, stiffness:160}],
  ['promoV2_cta',        {damping:13}],
]
// Easing и interpolate: те же входы, включая ВЫХОД ЗА ДИАПАЗОН.
// Remotion клампит вход у части функций; расхождение проявляется только за
// границами [0,1], поэтому пробуем именно их.
const {Easing, interpolate} = require('/Users/playom/999-multibots-telegraf/apps/vibee-editor/render/node_modules/remotion/dist/cjs/index.js')
const T = []
for (let i = -30; i <= 130; i++) T.push(i / 100)   // от -0.3 до 1.3

const EASINGS = [
  ['bezier_0_4_0_0_2_1', Easing.bezier(0.4, 0, 0.2, 1)],
  ['circle',             Easing.circle],
  ['bounce',             Easing.bounce],
  ['cubic',              Easing.cubic],
  ['out_cubic',          Easing.out(Easing.cubic)],
  ['ease',               Easing.ease],
  ['quad',               Easing.quad],
  ['sin',                Easing.sin],
]

const out = {}
out.__easing = {inputs: T}
for (const [name, fn] of EASINGS) {
  out['ease_' + name] = {values: T.map(t => fn(t))}
}
// interpolate БЕЗ options — дефолт Remotion для extrapolate — 'extend'.
out.interp_default = {values: T.map(t => interpolate(t * 12, [0, 12], [0, 1]))}
out.interp_clamp = {values: T.map(t => interpolate(t * 12, [0, 12], [0, 1],
  {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}))}
out.interp_multi = {values: T.map(t => interpolate(t * 12, [0, 4, 8, 12], [0, 1, 0.2, 1]))}

for (const [name, cfg] of CFGS) {
  const vals = []
  for (let f = 0; f <= 60; f++) {
    vals.push(springCalculation({frame: f, fps, config: cfg}).current)
  }
  out[name] = {config: cfg, values: vals}
}
console.log(JSON.stringify(out))
