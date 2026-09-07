#!/usr/bin/env node
/**
 * EVERY BUTTON THAT CAN BE DRAWN, AGAINST EVERY PRESS THAT CAN BE CAUGHT.
 *
 * A rendered callback id with no catcher is a press into silence: Telegram
 * shows a clock on the button for about half a minute and then stops, which to
 * the person is indistinguishable from a dead bot.
 *
 * WHY THIS IS A SCRIPT AND NOT A GREP. The answer depends entirely on the shape
 * of the matcher, and the first three shapes were all wrong:
 *
 *     pass 1: 87 orphans   — knew only bot.action and scene.action
 *     pass 2: 75 orphans   — added switch/case and .startsWith
 *     pass 3: 45 orphans   — added `<anything> === 'id'`, because the variable
 *                            is often named `action`, not `data`
 *
 * Each pass found a REAL catching shape, not a way to make the number smaller.
 * Published at pass one, "87 dead buttons" would have been a false accusation
 * of forty-two working ones. The self-check below carries the fixture that
 * caught the third miss, so a future edit cannot quietly lose it.
 *
 * Usage:  node scripts/button-census.cjs [--json]
 * Exit:   0 always for a successful measurement (this reports, it does not gate)
 *         2 if the self-check fails — then the numbers mean nothing
 */
const fs = require('fs')
const { execSync } = require('child_process')

const JSON_OUT = process.argv.includes('--json')

const RENDER =
  /(?:callback_data:\s*|\.callback\(\s*[\s\S]{0,300}?,\s*)(['"`])([a-zA-Z0-9_:\-.]{2,64})\1/g
const BOT_ACT = /\bbot\.action\(\s*(?:\[\s*)?(['"`])([a-zA-Z0-9_:\-.]{2,64})\1/g
const SCENE_ACT =
  /\b(?!bot\b)[A-Za-z_$][\w$]*\.action\(\s*(?:\[\s*)?(['"`])([a-zA-Z0-9_:\-.]{2,64})\1/g
/** Inside a file that reads ctx.callbackQuery, any equality against a literal counts. */
const ANY_EQ = /\b[A-Za-z_$][\w$]*\s*===?\s*(['"`])([a-zA-Z0-9_:\-.]{2,64})\1/g
const CASE = /case\s+(['"`])([a-zA-Z0-9_:\-.]{2,64})\1\s*:/g
const PREFIX = /\.startsWith\(\s*(['"`])([a-zA-Z0-9_:\-.]{1,40})\1/g
const REGEX = /\/(\^?)([a-zA-Z0-9_]{2,40})[^/\s]{0,40}\//g

const grab = (re, text) => [...text.matchAll(re)].map(m => m[2])

/**
 * Self-check, on a fixture that carries every shape this has been wrong about.
 * `fx_named_action` is the one that mattered: an earlier version required the
 * comparison variable to be called `data` and declared a live button dead.
 */
function selfCheck() {
  const FIXTURE = [
    "Markup.button.callback('x', 'fx_render')",
    "bot.action('fx_bot', h)",
    "someScene.action('fx_scene', h)",
    'const action = (ctx.callbackQuery as any).data',
    "if (action === 'fx_named_action') {}",
    "switch (action) { case 'fx_case': break }",
    "if (action.startsWith('fx_pre_')) {}",
    'const m = action.match(/fx_rx_(\\d+)/)',
  ].join('\n')

  const want = [
    ['render', RENDER, 'fx_render'],
    ['bot.action', BOT_ACT, 'fx_bot'],
    ['scene.action', SCENE_ACT, 'fx_scene'],
    ['named comparison', ANY_EQ, 'fx_named_action'],
    ['switch/case', CASE, 'fx_case'],
    ['startsWith', PREFIX, 'fx_pre_'],
    ['regex literal', REGEX, 'fx_rx_'],
  ]
  const missed = want.filter(([, re, id]) => !grab(re, FIXTURE).includes(id))
  if (missed.length) {
    console.error(
      'SELF-CHECK FAILED: these shapes are invisible to the matcher:'
    )
    for (const [name, , id] of missed)
      console.error(`  ${name}  (expected to find ${id})`)
    console.error(
      'Every count below would be an accusation of working code. Refusing to print one.'
    )
    process.exit(2)
  }
  // The other direction: a bot handler must not pass as a scene handler, or
  // "only reachable inside a scene" would be reported for buttons that work
  // everywhere.
  if (grab(SCENE_ACT, FIXTURE).includes('fx_bot')) {
    console.error(
      'SELF-CHECK FAILED: bot.action counted as a scene handler; the two are not separable.'
    )
    process.exit(2)
  }
  return want.length
}

const shapes = selfCheck()

const files = execSync(
  'grep -rl --include=\'*.ts\' -E "callback_data|button\\.callback|\\.action\\(|callbackQuery" src 2>/dev/null || true',
  { maxBuffer: 256 * 1024 * 1024 }
)
  .toString()
  .split('\n')
  .filter(Boolean)
  .filter(f => !f.includes('__tests__') && !f.endsWith('.test.ts'))

const rendered = new Map()
const bot = new Set()
const scene = new Map()
const byHand = new Set()
const prefixes = new Set()
const push = (map, key, where) => {
  if (!map.has(key)) map.set(key, [])
  map.get(key).push(where)
}

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8')
  for (const id of grab(RENDER, text)) push(rendered, id, file)
  for (const id of grab(BOT_ACT, text)) bot.add(id)
  for (const id of grab(SCENE_ACT, text)) push(scene, id, file)
  if (!/callbackQuery/.test(text)) continue
  for (const id of grab(ANY_EQ, text)) byHand.add(id)
  for (const id of grab(CASE, text)) byHand.add(id)
  for (const p of grab(PREFIX, text)) prefixes.add(p)
  for (const p of grab(REGEX, text)) prefixes.add(p)
}

const byPrefix = id =>
  [...prefixes].some(p => p.length >= 4 && id.startsWith(p))
const caught = id =>
  bot.has(id) || scene.has(id) || byHand.has(id) || byPrefix(id)
const orphans = [...rendered.keys()].filter(id => !caught(id))

/** Caught only by a scene handler, and drawn somewhere that scene is not. */
const crossFile = [...rendered.keys()].filter(id => {
  if (bot.has(id) || byHand.has(id) || byPrefix(id) || !scene.has(id))
    return false
  const drawn = [...new Set(rendered.get(id))]
  const caughtIn = [...new Set(scene.get(id))]
  return !drawn.every(d => caughtIn.includes(d))
})

if (JSON_OUT) {
  console.log(
    JSON.stringify(
      {
        files: files.length,
        rendered: rendered.size,
        botAction: bot.size,
        sceneAction: scene.size,
        byHand: byHand.size,
        prefixes: prefixes.size,
        orphans,
        crossFile,
      },
      null,
      1
    )
  )
  process.exit(0)
}

console.log(`self-check ok: ${shapes} catching shapes found in the fixture`)
console.log('')
console.log(`files scanned          ${files.length}`)
console.log(`rendered callback ids  ${rendered.size}`)
console.log(`  caught by bot.action   ${bot.size}   (fires anywhere)`)
console.log(`  caught by a scene      ${scene.size}   (fires only inside it)`)
console.log(`  compared by hand       ${byHand.size}`)
console.log(`  prefix / regex rules   ${prefixes.size}`)
console.log('')
console.log(`NO CATCHER OF ANY SHAPE: ${orphans.length} of ${rendered.size}`)
const grouped = {}
for (const id of orphans)
  for (const f of new Set(rendered.get(id)))
    (grouped[f] = grouped[f] || []).push(id)
for (const [file, ids] of Object.entries(grouped).sort(
  (a, b) => b[1].length - a[1].length
))
  console.log(
    `  ${file.replace('src/', '')}  (${ids.length}): ${ids.slice(0, 6).join(', ')}${ids.length > 6 ? ' …' : ''}`
  )
console.log('')
console.log(`DRAWN OUTSIDE THE SCENE THAT CATCHES THEM: ${crossFile.length}`)
for (const id of crossFile) console.log(`  ${id}`)
console.log('')
console.log('A number here is a LEAD, not a verdict: an id may be caught by a')
console.log('shape this does not know, or never drawn to a person at all. Open')
console.log('the file before calling a button dead.')
