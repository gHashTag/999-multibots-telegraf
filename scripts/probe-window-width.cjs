#!/usr/bin/env node
/**
 * IS THIS RATCHET'S WINDOW WIDTH CARRYING THE VERDICT?
 *
 * Ratchets keep asking "is X near Y" and answering with a window: N lines or N
 * characters after an anchor. A window is not wrong by itself -- it is wrong
 * when it stands in for a structural unit, and the way to tell is to MOVE it and
 * see whether the answer moves too.
 *
 * Measured over this repository's money ratchets: 7 of 18 flip to red when their
 * window is halved. Two real defects were found this way, both in
 * kie-webhook-charge: an assertion that read 6000 characters after a signature
 * (it fails at 3000, so the constant was the verdict) and one that had been RED
 * on a clean tree for months because a COMMENT mentioning the anchor sat 28
 * lines above the real call.
 *
 * A stable verdict is not proof the window is right -- only that this tree does
 * not currently exercise the difference. A flipped verdict IS proof it is wrong.
 *
 * THIS TOOL REWRITES FILES. It restores them and verifies the restore, but it
 * refuses to start on a dirty tree, because a failed restore on top of unsaved
 * work is unrecoverable.
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')

/** The window forms this repository actually uses, and where the number sits. */
const FORMS = [
  /(\.slice\(\s*\w+\s*,\s*\w+\s*\+\s*)(\d+)(\s*\))/g,
  /(\[\\s\\S\]\{0,)(\d+)(\})/g,
  /(\.\{0,)(\d+)(\})/g,
]

function rescale(src, f) {
  let out = src
  for (const re of FORMS)
    out = out.replace(re, (_m, a, n, c) => a + Math.max(1, f(Number(n))) + c)
  return out
}

function hasWindow(src) {
  return FORMS.some(re => new RegExp(re.source).test(src))
}

function selfCheck() {
  const sample = `const a = s.slice(i, i + 40)\nconst b = /x[\\s\\S]{0,80}y/`
  if (!hasWindow(sample)) throw new Error('window forms no longer recognised')
  const half = rescale(sample, n => Math.floor(n / 2))
  if (!half.includes('i + 20') || !half.includes('{0,40}'))
    throw new Error(`rescale did not rewrite both forms: ${half}`)
  // A rescale that silently changes nothing would report every ratchet stable.
  if (half === sample) throw new Error('rescale was a no-op')
  return true
}

function verdict(file) {
  try {
    execFileSync('npx', ['vitest', 'run', file], {
      cwd: ROOT,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    return 'PASS'
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '')
    return /Tests\s+\d+ failed/.test(out) ? 'FAIL' : 'ERROR'
  }
}

function targets(dir) {
  const out = []
  const walk = d => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }))
      if (e.isDirectory()) walk(`${d}/${e.name}`)
      else if (e.name.endsWith('.ts')) {
        const rel = `${d}/${e.name}`
        if (hasWindow(fs.readFileSync(path.join(ROOT, rel), 'utf8')))
          out.push(rel)
      }
  }
  walk(dir)
  return out.sort()
}

function main() {
  selfCheck()
  console.log('самопроверка: обе формы окна распознаны и пересчитаны')

  const dirty = execFileSync('git', ['status', '--porcelain'], {
    cwd: ROOT,
    encoding: 'utf8',
  }).trim()
  if (dirty) {
    console.error(
      '\nдерево грязное -- проба переписывает файлы и не станет этого делать\n' +
        'поверх несохранённого. Закоммить или отложи изменения и повтори.'
    )
    process.exit(2)
  }

  const dir = process.argv[2] || 'src/__tests__/money'
  const files = targets(dir)
  console.log(`файлов с окном в ${dir}: ${files.length}\n`)

  const sensitive = []
  const unmeasured = []
  for (const file of files) {
    const abs = path.join(ROOT, file)
    const orig = fs.readFileSync(abs, 'utf8')
    let half = '-'
    let dbl = '-'
    const base = verdict(file)
    try {
      if (base === 'PASS') {
        fs.writeFileSync(
          abs,
          rescale(orig, n => Math.floor(n / 2))
        )
        half = verdict(file)
        fs.writeFileSync(
          abs,
          rescale(orig, n => n * 2)
        )
        dbl = verdict(file)
      }
    } finally {
      fs.writeFileSync(abs, orig)
      if (fs.readFileSync(abs, 'utf8') !== orig) {
        console.error(`\nНЕ ВОССТАНОВЛЕН: ${file} -- почини вручную СЕЙЧАС`)
        process.exit(3)
      }
    }
    if (base !== 'PASS') {
      // Not "stable": not measured. A red ratchet has no verdict to move, and
      // calling that stable is how a broken guard reads as a healthy one.
      unmeasured.push(`${file} (base=${base})`)
      console.log(`  НЕ ИЗМЕРЕН   base=${base}  ${file}`)
      continue
    }
    const flips = half !== 'PASS' || dbl !== 'PASS'
    if (flips) sensitive.push(file)
    console.log(
      `  ${flips ? 'ШИРИНА РЕШАЕТ' : 'устойчив     '}  /2=${half} x2=${dbl}  ${file}`
    )
  }

  console.log(
    `\nизмерено ${files.length - unmeasured.length}, ширина решает у ${sensitive.length}` +
      `, не измерено ${unmeasured.length}`
  )
  if (unmeasured.length) {
    console.log('\nне измерены (красные или упавшие ДО мутации):')
    for (const u of unmeasured) console.log('  ' + u)
  }
  console.log(
    '\nустойчивость -- не доказательство правоты окна: этим деревом разница' +
      '\nпросто не задета. А перевернувшийся вердикт -- доказательство ошибки.'
  )
}

if (require.main === module) main()
module.exports = { FORMS, rescale, hasWindow, selfCheck, targets }
