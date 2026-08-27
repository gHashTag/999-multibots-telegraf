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
const out = {}
for (const [name, cfg] of CFGS) {
  const vals = []
  for (let f = 0; f <= 60; f++) {
    vals.push(springCalculation({frame: f, fps, config: cfg}).current)
  }
  out[name] = {config: cfg, values: vals}
}
console.log(JSON.stringify(out))
