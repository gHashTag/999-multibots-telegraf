#!/usr/bin/env node
/**
 * CAN anomalies.mjs ACTUALLY FAIL? Thirty-one assertions that answer it.
 *
 * WHY. anomalies.mjs is the only thing standing between "production broke" and
 * "somebody noticed a week later". It had never been observed to fire. It
 * printed OK per section -- and OK is exactly what a check that stopped
 * checking prints too. Both defects found in it on 2026-08-29 (stderr inherited
 * past the section-6 parser; a head-of-main comparison that cried over docs
 * commits) were caught by eye, late, and both had looked like a green report.
 *
 *   node .claude/loop-opus/anomalies-selftest.mjs      # or: tri scan-check
 *
 * Non-zero exit if any bad() site has stopped being reachable. All 22 bad()
 * call sites in anomalies.mjs are covered, across all six sections plus the
 * deploy check -- two of them only because the fake found the holes: section 1
 * called a renamed payload healthy, and section 2 read a future-dated row as
 * fresh forever. Neither could fire before 2026-08-29.
 *
 * COST, measured 2026-08-29 over four runs: 23-47 s. All of the variance is the
 * `git fetch origin` calls against the real remote -- one probe plus one inside
 * the real verify-landed.mjs of each section-6 scenario. Every HTTP scenario
 * costs 0.1 s. That is why the fake's /health omits `version` by default: with
 * a version present the deploy check shells out to git, and twenty-eight
 * scenarios each doing that would put the suite well past the point where
 * anyone runs it.
 *
 * HOW. anomalies-fake.mjs comes up on a random port and plays BOTH hosts at
 * once (the RENDER and APP path spaces do not overlap). Four seams --
 * ANOMALIES_RENDER_URL, _APP_URL, _MEMORY, _VERIFY_SCRIPT -- point the checker
 * at it and feed it a deliberately broken answer.
 *
 * ASSERT ON THE CHANNEL, NOT ON THE WORDS. This cost an iteration. The first
 * version matched a substring against the whole output. Swapping bad() for ok()
 * changes no words -- only the marker -- and two mutations out of three stayed
 * GREEN. A harness that reports PASS over a neutered check is worth nothing. So
 * what is parsed below is the list of lines carrying the warning marker, and
 * the final tally line is excluded from it: it carries the same marker and
 * would restore the same hole, because it prints whether or not any individual
 * check still works.
 *
 * WHAT THIS DOES NOT PROVE. A fake proves the LOGIC, never the TARGET: a typo
 * in the RENDER constant would leave all of it green. Hence the source
 * assertion at the end. And nothing here can prove production still emits the
 * shapes assumed -- only a live run does that, which is why this does not
 * replace `tri scan`.
 */

import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { K } from './anomalies-keys.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CHECKER = path.join(HERE, 'anomalies.mjs')
const FAKE = path.join(HERE, 'anomalies-fake.mjs')
const FIX = path.join(HERE, 'fixtures')
const QUIET_VERIFY = path.join(FIX, 'verify-quiet.mjs')
const REAL_VERIFY = path.join(HERE, 'verify-landed.mjs')
const REAL_MEMORY = path.join(HERE, 'anomalies-last.json')

/** createdAt in production's own shape: space instead of T, offset without colon. */
const ago = hours =>
  new Date(Date.now() - hours * 3_600_000)
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d+Z$/, '+00')

// Computed keys, not literal ones -- see anomalies-keys.mjs for why neither
// bare nor quoted Cyrillic keys survive this repo's two parallel gates.
const dead = (name, why) => ({
  json: {
    [K.providers]: [{ [K.provider]: name, ok: false, [K.details]: why }],
    [K.working]: 1,
    [K.total]: 2,
  },
})

/**
 * Which render commit the deploy check expects -- computed with the same two
 * git commands the checker uses.
 *
 * HONEST ABOUT THE WEAKNESS: this does NOT prove the reference point is the
 * right one, because the test repeats the script's choice. It proves something
 * narrower and still worth having -- that the comparison is live and that a
 * matching version keeps the alarm SILENT. The negative case (D02) carries the
 * real weight.
 */
function expectedRenderCommit() {
  const g = a => execFileSync('git', a, { cwd: HERE, encoding: 'utf8' }).trim()
  const own = g([
    'log',
    '-1',
    '--format=%h',
    'origin/main',
    '--',
    ':/apps/vibee-editor/render',
  ])
  return own || g(['rev-parse', '--short', 'origin/main'])
}

// ── Scenarios ─────────────────────────────────────────────────────────────
// expect — substring that MUST appear in at least one warning line
// forbid — substring that must NOT appear in any warning line
// clean  — output must carry no warning line at all, and exit 0
const SCENARIOS = [
  // ─── Section 1. Providers — all 4 bad() sites ──────────────────────────
  {
    id: 'P01',
    why: 'провайдеры отвечают 500',
    scenario: { providers: { status: 500, json: {} } },
    expect: 'страница здоровья провайдеров не ответила',
  },
  {
    id: 'P02',
    why: '200, но тело не JSON — вторая ветка того же сайта',
    scenario: { providers: { raw: '<html>proxy error</html>' } },
    expect: 'страница здоровья провайдеров не ответила',
  },
  {
    id: 'P03',
    why: 'обязательный провайдер лежит',
    scenario: { providers: dead('FAL — картинки', 'Exhausted balance') },
    expect: 'FAL — картинки',
  },
  {
    id: 'P04',
    why: 'лежит НЕОБЯЗАТЕЛЬНЫЙ провайдер — тревоги быть не должно',
    scenario: { providers: dead('OpenAI (не обязателен)', 'нет ключа') },
    clean: true,
  },
  {
    id: 'P05',
    why: 'соединение с провайдерами оборвано',
    scenario: { providers: { kill: true } },
    expect: 'провайдеры: ',
  },
  {
    // Found BY THIS FAKE, not by reading the code. Before the fix this printed
    // a success line whose denominator was the literal word `undefined` and
    // exited 0 -- over a payload that declares a provider dead.
    id: 'P06',
    why: 'ключи ответа переименованы в латиницу: разобрать нечего, но провайдер объявлен мёртвым — молчать нельзя',
    scenario: {
      providers: {
        json: {
          providers: [{ provider: 'FAL', ok: false, details: 'dead' }],
          working: 0,
          total: 2,
        },
      },
    },
    expect: 'ответ провайдеров не разобран',
  },

  // ─── Section 2. Pipeline — all 5 bad() sites ───────────────────────────
  {
    id: 'F01',
    why: 'лента пуста',
    scenario: { feed: { json: { templates: [] } } },
    expect: 'лента пуста',
  },
  {
    id: 'F02',
    why: 'дату последнего ролика не разобрать',
    scenario: {
      feed: { json: { templates: [{ name: 'x', createdAt: 'позавчера' }] } },
    },
    expect: 'не разобрал дату последнего ролика',
  },
  {
    id: 'F03',
    why: 'конвейер стоит 48 ч при живых провайдерах',
    scenario: {
      feed: { json: { templates: [{ name: 'stale', createdAt: ago(48) }] } },
    },
    expect: 'конвейер стоит ПРИ ЖИВЫХ',
  },
  {
    // The direct regression test for the #877 fix that #914 silently reverted
    // and which cost 51 hours of unreported stall: ANY broken provider used to
    // mute this alarm, and FAL has been broken indefinitely.
    id: 'F04',
    why: 'стоит 48 ч, лежит FAL — но ролик от него не зависит: тревога обязана прозвучать (регрессия #877→#914)',
    scenario: {
      providers: dead('FAL — картинки', 'Exhausted balance'),
      feed: { json: { templates: [{ name: 'stale', createdAt: ago(48) }] } },
    },
    expect: 'конвейер стоит ПРИ ЖИВЫХ',
  },
  {
    // The paired negative. Without it, "always fire" would pass F03 and F04 and
    // the muting rule would be untested in the other direction.
    id: 'F05',
    why: 'стоит 48 ч и лежит GLM — без него ролик не написать: это заметка, а не тревога',
    scenario: {
      providers: dead('GLM — агент', 'rate limited'),
      feed: { json: { templates: [{ name: 'stale', createdAt: ago(48) }] } },
    },
    expect: 'GLM — агент',
    forbid: 'конвейер стоит ПРИ ЖИВЫХ',
  },
  {
    id: 'F06',
    why: 'соединение с лентой оборвано',
    scenario: { feed: { kill: true } },
    expect: 'лента: ',
  },
  {
    // The other hole the fake found: the age had an upper bound and no lower
    // one, so one future-dated row muted the stall alarm for good while
    // printing a success line stating an age of MINUS 2992 hours.
    id: 'F07',
    why: 'дата последнего ролика в будущем: отрицательный возраст навсегда глушил тревогу о простое',
    scenario: {
      feed: {
        json: { templates: [{ name: 'future', createdAt: ago(-720) }] },
      },
    },
    expect: 'в БУДУЩЕМ',
  },

  // ─── Deploy — all 3 bad() sites ────────────────────────────────────────
  {
    id: 'D01',
    why: '/health отвечает 503',
    scenario: { health: { status: 503, json: {} } },
    expect: 'здоровье сервиса не ответило',
  },
  {
    id: 'D02',
    why: 'на проде версия, которой нет ни в одном коммите',
    scenario: { health: { json: { version: '0000000' } } },
    expect: 'выкладка отстала',
  },
  {
    id: 'D03',
    why: 'соединение с /health оборвано',
    scenario: { health: { kill: true } },
    expect: 'проверка выкладки: ',
  },
  {
    id: 'D04',
    why: 'на проде именно тот коммит рендера, которого ждут — молчим',
    scenario: () => ({ health: { json: { version: expectedRenderCommit() } } }),
    forbid: 'выкладка отстала',
  },

  // ─── Section 3. Mini-app — all 3 bad() sites ───────────────────────────
  {
    id: 'A01',
    why: 'мини-апп отдаёт 502',
    scenario: { spa: { status: 502, html: 'bad gateway' } },
    expect: 'HTTP 502',
  },
  {
    id: 'A02',
    why: '200, но это чужая страница без точки монтирования',
    scenario: { spa: { html: '<html><body>parked domain</body></html>' } },
    expect: '200, но это не приложение',
  },
  {
    id: 'A03',
    why: 'соединение с мини-аппом оборвано',
    scenario: { spa: { kill: true } },
    expect: '/chat: ',
  },

  // ─── Section 4. Routes — all 2 bad() sites ─────────────────────────────
  {
    id: 'R01',
    why: 'маршрут глотает лишний сегмент и отдаёт 200',
    scenario: { extra404: { status: 200, json: { templates: [] } } },
    expect: 'маршрут глотает подпуть',
  },
  {
    id: 'R02',
    why: 'соединение на лишнем сегменте оборвано',
    scenario: { extra404: { kill: true } },
    expect: '/api/feed/чепуха: ',
  },

  // ─── Section 5. Profile — all 3 bad() sites ────────────────────────────
  {
    id: 'U01',
    why: 'в профиле нет счётчика работ — сверять нечем',
    scenario: { profile: { json: {} } },
    expect: 'не удалось сверить счётчик работ',
  },
  {
    id: 'U02',
    why: 'счётчик обещает 17 работ, а список пуст',
    scenario: {
      profile: { json: { templates_count: 17 } },
      profileTemplates: { json: { templates: [] } },
    },
    expect: 'счётчик обещает 17 работ',
  },
  {
    id: 'U03',
    why: 'соединение с профилем оборвано',
    scenario: { profile: { kill: true } },
    expect: 'профиль: ',
  },

  // ─── Section 6. Landed edits — both bad() sites ────────────────────────
  //
  // NO HTTP FAKE CAN REACH THESE TWO. The section reads a CHILD PROCESS's exit
  // code and streams, not the network. So the real verify-landed.mjs is run
  // against a fixture manifest: real `git show origin/main:...`, real needle
  // comparison, real console.error. Costs a `git fetch` each -- which is why
  // every other scenario gets the dumb stub instead.
  {
    id: 'L01',
    // The miss line is written to STDERR. Put stdio back to 'inherit' and it
    // sails past this parser: the checker then prints the meaningless "check
    // did not run" instead of naming the file. That is verbatim the defect
    // measured on 2026-08-29, and `forbid` below is the trap set for its return.
    why: 'след правки пропал с origin/main — и назван поимённо',
    verify: REAL_VERIFY,
    manifest: path.join(FIX, 'landed-lost.json'),
    expect: 'перезаписано:',
    forbid: 'проверка следов не отработала',
    needsFetch: true,
  },
  {
    id: 'L02',
    why: 'манифест пуст: ноль проверенных неотличим от «проверка не состоялась»',
    verify: REAL_VERIFY,
    manifest: path.join(FIX, 'landed-empty.json'),
    expect: 'проверка следов не отработала',
    needsFetch: true,
  },

  // ─── Control: everything healthy ───────────────────────────────────────
  {
    id: 'G00',
    why: 'все шесть разделов отвечают здорово — обязан быть код 0 и ни одной ⚠️',
    scenario: {},
    clean: true,
  },
]

// ── Runner ────────────────────────────────────────────────────────────────

function startFake(scenario) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [FAKE], {
      env: { ...process.env, SCENARIO: JSON.stringify(scenario) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let err = ''
    p.stderr.on('data', d => (err += d))
    const timer = setTimeout(() => {
      p.kill('SIGKILL')
      reject(new Error(`подделка не поднялась за 5 с: ${err}`))
    }, 5000)
    p.stdout.on('data', d => {
      const m = String(d).match(/FAKE_PORT=(\d+)/)
      if (m) {
        clearTimeout(timer)
        resolve({ proc: p, port: Number(m[1]) })
      }
    })
    p.on('error', e => {
      clearTimeout(timer)
      reject(e)
    })
  })
}

function runChecker(env) {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [CHECKER], {
      env: { ...process.env, ...env },
      cwd: HERE,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    p.stdout.on('data', d => (out += d))
    p.stderr.on('data', d => (out += d))
    p.on('close', code => resolve({ code, out }))
  })
}

/**
 * Only the lines bad() printed.
 *
 * The tally line carries the same marker and would land here too -- and with it
 * the green-mutation hole would come back, because the tally prints regardless
 * of whether any particular check still works.
 */
const WARN = '⚠️'
const badLines = out =>
  out
    .split('\n')
    .filter(l => l.includes(WARN) && !l.includes('АНОМАЛИЙ:'))
    .map(l => l.trim())

/**
 * CAN THE TWO SECTION-6 SCENARIOS BE MEASURED AT ALL RIGHT NOW?
 *
 * They are the only ones that reach the network for real: each runs the actual
 * verify-landed.mjs, which opens with `git fetch origin` and exits 2 with
 * "НЕ ИЗМЕРЕНО" when it cannot. Measured with GIT_ALLOW_PROTOCOL=none on
 * 2026-08-29, and both arms were wrong in the way that matters:
 *
 *   L01 went RED. It says "the alarm no longer sounds" while the alarm is fine
 *       and the network is not. A false alarm inside a detector is explained
 *       once, skimmed the second time and unread by the third -- this file's own
 *       subject matter, reproduced in the tool meant to guard against it.
 *   L02 went GREEN FOR THE WRONG REASON, which is worse. It asserts the string
 *       "проверка следов не отработала", and a dead fetch prints that string
 *       verbatim. So it passed on a machine where the logic under test never ran.
 *
 * Hence the probe: an unmeasurable scenario is reported as a THIRD outcome, not
 * folded into either of the other two. The same convention anomalies.mjs already
 * uses for note() -- "не измерено" beside the tally, never inside the green.
 */
const canFetch = (() => {
  try {
    execFileSync('git', ['fetch', 'origin', '-q'], {
      cwd: HERE,
      timeout: 30000,
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
})()

const memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anom-selftest-'))
const memoryFile = path.join(memoryDir, 'memory.json')

// Snapshot the REAL memory before the run. If the ANOMALIES_MEMORY seam ever
// stops working, this self-test would bury the NEW/GONE baseline under two
// dozen invented states -- silently, because that file is gitignored. Compared
// again at the end.
const memoryBefore = fs.existsSync(REAL_MEMORY)
  ? fs.readFileSync(REAL_MEMORY, 'utf8')
  : null

let failed = 0
let passed = 0
const unmeasured = []
const t0 = Date.now()

console.log('\nСАМОПРОВЕРКА anomalies.mjs — может ли он вообще сработать\n')

for (const s of SCENARIOS) {
  if (s.needsFetch && !canFetch) {
    unmeasured.push(s.id)
    console.log(`  ?    ${s.id}  НЕ ИЗМЕРЕНО (нет связи с origin) — ${s.why}`)
    continue
  }
  let fake = null
  const problems = []
  try {
    const body = typeof s.scenario === 'function' ? s.scenario() : s.scenario
    fake = await startFake(body || {})
    const base = `http://127.0.0.1:${fake.port}`
    // A fresh memory file per scenario, otherwise the NEW/GONE diff starts
    // depending on scenario order and the output stops being reproducible.
    fs.rmSync(memoryFile, { force: true })

    const env = {
      ANOMALIES_RENDER_URL: base,
      ANOMALIES_APP_URL: base,
      ANOMALIES_MEMORY: memoryFile,
      ANOMALIES_VERIFY_SCRIPT: s.verify || QUIET_VERIFY,
    }
    if (s.manifest) env.ANOMALIES_LANDED_MANIFEST = s.manifest

    const { code, out } = await runChecker(env)
    const bads = badLines(out)

    if (s.clean) {
      if (bads.length) problems.push(`ждали тишины, а получили: ${bads[0]}`)
      if (code !== 0) problems.push(`ждали код возврата 0, получили ${code}`)
    }
    if (s.expect) {
      if (!bads.some(l => l.includes(s.expect)))
        problems.push(
          `в канале тревог нет «${s.expect}» — там: ${bads.join(' | ') || 'пусто'}`
        )
      // bad() must also break the exit code, or the alarm cannot be put at the
      // head of an iteration -- which is the only reason the script exists.
      if (code !== 1) problems.push(`ждали код возврата 1, получили ${code}`)
    }
    if (s.forbid && bads.some(l => l.includes(s.forbid)))
      problems.push(`в канале тревог оказалось запрещённое «${s.forbid}»`)
  } catch (e) {
    problems.push(`сценарий не отработал: ${e.message}`)
  } finally {
    if (fake) fake.proc.kill('SIGKILL')
  }

  if (problems.length) {
    failed++
    console.log(`  ✗    ${s.id}  ${s.why}`)
    for (const p of problems) console.log(`         ${p}`)
  } else {
    passed++
    console.log(`  OK   ${s.id}  ${s.why}`)
  }
}

// ── What the fake cannot prove ────────────────────────────────────────────
//
// A fake proves the LOGIC, never the TARGET. A typo in the RENDER or APP
// constant would leave every scenario above green, because all of them talk to
// 127.0.0.1. The only thing available here is to read the source and confirm
// the defaults have not moved.
console.log('')
const src = fs.readFileSync(CHECKER, 'utf8')
for (const host of ['vibee-render-production.up.railway.app', 'app.t27.ai']) {
  if (src.includes(`'https://${host}`)) {
    passed++
    console.log(`  OK   C1   умолчание всё ещё боевое: ${host}`)
  } else {
    failed++
    console.log(`  ✗    C1   боевой хост пропал из умолчаний: ${host}`)
  }
}

const memoryAfter = fs.existsSync(REAL_MEMORY)
  ? fs.readFileSync(REAL_MEMORY, 'utf8')
  : null
if (memoryBefore === memoryAfter) {
  passed++
  console.log('  OK   C2   настоящая память прогонов не тронута')
} else {
  failed++
  console.log('  ✗    C2   самопроверка ЗАТЁРЛА anomalies-last.json: база для')
  console.log('         диффа НОВОЕ/УШЛО испорчена, а файл в .gitignore')
}
fs.rmSync(memoryDir, { recursive: true, force: true })

/**
 * WHAT IS DELIBERATELY MISSING, so this does not read as coverage.
 *
 * 1. THE docs-only NEGATIVE. "A docs commit on top of a render commit must NOT
 *    raise deploy-behind" cannot be asserted here: repoDir in anomalies.mjs is
 *    its own directory, i.e. the REAL clone, so the assertion would only be as
 *    true as origin/main happens to look today. It needs a fifth seam
 *    (ANOMALIES_REPO_DIR) plus a fixture repo with a known commit ladder. A
 *    scenario that passes by accident is worse than a missing one -- it buys
 *    the appearance of a check.
 *
 * 2. THE GREEN CASE OF SECTION 6 against the real landed.json. It costs another
 *    `git fetch` and 79 `git show`, and every live `tri scan` already walks it.
 *    What is asserted here are the two FAILURE arms -- the ones that had never
 *    once been observed to fire.
 *
 * 3. THE SHAPE PRODUCTION ACTUALLY SENDS. The fake emits what we BELIEVE is
 *    true about prod, so a rename on the live side leaves every scenario here
 *    green while the checker goes blind. /api/providers is now the exception --
 *    P06 forced a guard that reports an unparsable payload instead of calling
 *    it healthy -- but the feed, profile and templates shapes still carry the
 *    hole. Only a live run catches that, which is why this does not replace
 *    `tri scan`.
 *
 * 4. SECTION 6 WHEN origin IS UNREACHABLE. L01 and L02 run the real
 *    verify-landed.mjs, which opens with `git fetch`. Offline they are reported
 *    as the third outcome -- not measured -- rather than passed or failed; see
 *    the canFetch probe above for what each of them did before that
 *    distinction existed. So a run on a train proves five sections, not six,
 *    and says so.
 */

const secs = ((Date.now() - t0) / 1000).toFixed(1)
console.log('')
if (failed) {
  console.log(`❌ НЕ СРАБОТАЛО: ${failed} из ${passed + failed} (${secs} с)`)
  console.log(
    '   Красная строка здесь значит: соответствующая тревога в anomalies.mjs'
  )
  console.log('   БОЛЬШЕ НЕ ЗВУЧИТ. Прод при этом может быть цел.\n')
  process.exit(1)
}
// The word meaning "all" is reserved for a run that measured everything.
// Dropping it when something was skipped is the whole point: "all 29 passed"
// printed over 27 actual measurements is how an unmeasured thing gets filed as
// a working one.
if (unmeasured.length) {
  console.log(
    `✅ ${passed} сработали как должны, НО ${unmeasured.length} НЕ ИЗМЕРЕНО: ${unmeasured.join(', ')} (${secs} с)`
  )
  console.log(
    '   Раздел «Правки на месте» требует связи с origin. Этот прогон НЕ доказал,'
  )
  console.log('   что он ещё звучит — повторить там, где есть сеть.\n')
  process.exit(0)
}
console.log(`✅ все ${passed} проверки сработали как должны (${secs} с)\n`)
