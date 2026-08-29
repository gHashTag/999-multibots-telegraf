#!/usr/bin/env node
/**
 * ЧТО СЛОМАЛОСЬ, ПОКА МЕНЯ НЕ БЫЛО — одна команда.
 *
 * ЗАЧЕМ. Каждая крупная находка этого цикла обнаруживалась случайно и поздно:
 * у FAL кончился баланс — узнали, когда пошли смотреть ключи; профиль ни у
 * кого не показывал работы — увидели глазами на экране; лента могла бы
 * перестать пополняться, и это заметил бы только человек. Ни логи, ни сборка,
 * ни тесты про такое не говорят: там нет ошибок, там неверные ЗНАЧЕНИЯ.
 *
 * Здесь собраны инварианты продукта — утверждения, которые должны быть верны
 * всегда. Проверка живая: она ходит в прод, а не читает код.
 *
 *   node .claude/loop-opus/anomalies.mjs
 *
 * Код возврата 1, если найдена хоть одна аномалия, — чтобы это можно было
 * поставить в начало витка и не гадать, с чего начинать.
 *
 * ПОЧЕМУ НЕ ГЕЙТ В lefthook. Эти проверки сетевые и медленные, а часть из
 * них зависит от чужих сервисов. Гейт, который падает из-за чужого таймаута,
 * выключат через день — и вместе с ним пропадут настоящие находки.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/**
 * FOUR SEAMS, SO THIS CHECKER CAN BE PROVEN ABLE TO FAIL.
 *
 * Each is `env || <the exact expression that was here>`, so with nothing set
 * the behaviour is byte-for-byte what it was. They exist for one caller —
 * anomalies-selftest.mjs — which points this script at a local server serving
 * deliberately broken payloads and asserts the ⚠️ lines appear.
 *
 * WHY THIS WAS WORTH THE FOUR LINES. Nothing here could tell a working detector
 * from a dead one. This script prints OK per section, and OK is exactly what a
 * check that no longer checks anything prints too. Both defects found in this
 * file on 2026-08-29 -- stderr inherited past the section-6 parser, and a
 * head-of-main comparison that cried over docs commits -- were caught by eye,
 * late, and only because someone happened to look. An alarm nobody can make
 * ring is not an alarm.
 *
 * ANOMALIES_MEMORY IS NOT COSMETIC. Without it a self-test run pushes its two
 * dozen invented states into the eight-slot history in anomalies-last.json --
 * the very baseline the NEW / GONE diff is computed from. That file is
 * gitignored, so the damage would never appear in a diff: the self-test would
 * silently destroy the one signal this script exists to produce.
 */
const MEMORY =
  process.env.ANOMALIES_MEMORY || path.join(HERE, 'anomalies-last.json')

const RENDER =
  process.env.ANOMALIES_RENDER_URL ||
  'https://vibee-render-production.up.railway.app'
const APP = process.env.ANOMALIES_APP_URL || 'https://app.t27.ai'

/** Сколько часов без нового ролика считаем остановкой конвейера. */
const FEED_STALE_HOURS = 6

const anomalies = []
const notes = []

function ok(msg) {
  console.log(`  OK   ${msg}`)
}
function bad(msg) {
  console.log(`  ⚠️   ${msg}`)
  anomalies.push(msg)
}
function note(msg) {
  console.log(`  ·    ${msg}`)
  notes.push(msg)
}

async function get(url, ms = 20000) {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try {
    const r = await fetch(url, { signal: c.signal })
    const text = await r.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      /* не JSON — вернём как текст */
    }
    return { status: r.status, ok: r.ok, text, json }
  } finally {
    clearTimeout(t)
  }
}

/**
 * Список сломанных провайдеров — заполняется проверкой 1 и читается
 * проверкой 2.
 *
 * ЗАЧЕМ. «Конвейер стоит 7 часов» выводилось крупно, красным и со словом
 * НОВОЕ — при том, что двумя строками выше уже сказано: у FAL исчерпан
 * баланс, а у владельца 0 токенов. Рендерить нечем, стоять конвейеру
 * положено. Это не новость, это ПОСЛЕДСТВИЕ, и оно будет повторяться
 * каждые 15 минут, пока баланс не пополнят.
 *
 * Тревога, которая звучит верно, но предсказуемо, за неделю превращается
 * в фон — ровно как постоянные «46 ошибок типов», внутри которых лежали
 * два настоящих ReferenceError. Поэтому следствие показывается рядом с
 * причиной и НЕ попадает в список нового.
 */
const провайдерыСломаны = []

console.log('\nАНОМАЛИИ — живая проверка прода\n')

// ─── 1. Провайдеры ───────────────────────────────────────────────────────
console.log('Провайдеры')
try {
  const r = await get(`${RENDER}/api/providers`, 30000)
  if (!r.ok || !r.json) {
    bad(`страница здоровья провайдеров не ответила: HTTP ${r.status}`)
  } else {
    const d = r.json
    const мёртвые = (d['провайдеры'] || []).filter(
      p => !p.ok && !String(p['провайдер']).includes('не обязателен')
    )
    if (мёртвые.length) {
      for (const p of мёртвые) {
        bad(`${p['провайдер']} — ${String(p['детали']).slice(0, 120)}`)
        провайдерыСломаны.push(String(p['провайдер']).split(' — ')[0])
      }
    } else if (!(Number(d['всего']) > 0)) {
      /**
       * AN EMPTY LIST OF DEAD PROVIDERS IS NOT HEALTH IF NOTHING WAS READ.
       *
       * Found by the fake on 2026-08-29: feed this section a payload with LATIN
       * keys ({providers, working, total}) and it printed a success line whose
       * denominator was the literal word `undefined`, then exited green -- over
       * a payload that declared a provider DEAD.
       * `(d['провайдеры'] || [])` turns a renamed field into an empty list, and
       * an empty list of dead providers reads exactly like everything working.
       * The success line even printed the word `undefined` as its denominator
       * and still counted as success.
       *
       * Its own sibling states the rule this broke: verify-landed.mjs refuses to
       * report a clean run at zero files checked, because an empty violation
       * list at zero checked is indistinguishable from a check that never ran.
       * Same trap, same file family. Require the denominator before the green.
       */
      bad(
        `ответ провайдеров не разобран: нет счётчика «всего» — ключи ${Object.keys(d).slice(0, 6).join(', ') || 'отсутствуют'}`
      )
    } else {
      ok(`все обязательные отвечают (${d['работает']} из ${d['всего']})`)
    }
  }
} catch (e) {
  bad(`провайдеры: ${e.message}`)
}

// ─── 2. Конвейер: лента пополняется? ─────────────────────────────────────
console.log('\nКонвейер')
try {
  const r = await get(`${RENDER}/api/feed?page=0&limit=1&sort=recent`)
  const t = r.json?.templates?.[0]
  if (!t) {
    bad('лента пуста или не ответила — конвейер не проверить')
  } else {
    // createdAt приходит как «2026-08-26 05:12:33.123+00»: пробел вместо T и
    // смещение без двоеточия. Date.parse на таком даёт NaN — уже обжигались,
    // и «0 роликов за сутки» тогда было ошибкой замера, а не фактом.
    const raw = String(t.createdAt || '')
    const iso = raw.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00')
    const at = Date.parse(iso)
    if (Number.isNaN(at)) {
      bad(`не разобрал дату последнего ролика: «${raw}»`)
    } else {
      const hours = (Date.now() - at) / 3_600_000
      const s = `последний ролик ${hours.toFixed(1)} ч назад — «${String(t.name).slice(0, 44)}»`
      // Which providers the produced reel ACTUALLY needs.
      //
      // Any broken provider used to mute the stall alarm. But the autopilot
      // makes TrinityBlogReel -- a text engraving from the t27.ai RSS. It needs
      // only the text model (GLM): the image is optional with a FAL->Replicate
      // fallback, and it uses no voice at all. FAL and ElevenLabs are broken
      // indefinitely, so they muted the stall ALWAYS and hid the real cause
      // behind "providers are down". This was fixed once in #877 and silently
      // reverted by #914; restored 2026-08-29 after a 51-hour stall passed
      // unreported.
      const HARD_DEPS = ['GLM']
      const broken = провайдерыСломаны // cyrillic-ok: existing identifier
      const blockingProduction = broken.filter(p =>
        HARD_DEPS.some(dep => p.includes(dep))
      )
      if (hours < -0.1) {
        /**
         * THERE WAS AN UPPER BOUND ON THE AGE AND NO LOWER ONE.
         *
         * A future-dated createdAt gives a NEGATIVE age, which sails through
         * `hours <= FEED_STALE_HOURS` and prints as success. Measured with the
         * fake on 2026-08-29: a row dated 2027 produced a success line stating
         * an age of MINUS 2992 hours.
         * One such row -- clock skew, a bad backfill, a timezone bug in the
         * writer -- mutes the stall alarm PERMANENTLY, and the line it prints
         * reads healthy. That is the same shape as the 51-hour stall: not a
         * wrong number, a wrong number that looks right.
         *
         * The tolerance is 0.1 h rather than 0, because the writer's clock and
         * this one are not the same clock and a few seconds of skew is normal.
         */
        bad(
          `дата последнего ролика в БУДУЩЕМ (${hours.toFixed(1)} ч) — часы разъехались или запись битая: ${s}`
        )
      } else if (hours <= FEED_STALE_HOURS) {
        ok(s)
      } else if (blockingProduction.length) {
        // Mute ONLY when a provider the reel cannot be made without is down.
        note(
          `конвейер стоит ОЖИДАЕМО: без ${blockingProduction.join(', ')} ролик не написать. ${s}`
        )
      } else {
        // The providers this reel type needs are alive and the pipeline is
        // still stopped -- a real anomaly. Do not look at FAL/ElevenLabs: look
        // at whether the autopilot ran (schedule, topic queue, crash, tokens).
        bad(`конвейер стоит ПРИ ЖИВЫХ провайдерах: ${s}`)
      }
    }
  }
} catch (e) {
  bad(`лента: ${e.message}`)
}

/**
 * ДЕПЛОЙ ДОЕХАЛ? Зелёный мерж — это не выкладка.
 *
 * ЗАЧЕМ. Рендер-сервис не разворачивался семнадцать минут до того, как я это
 * заметил, и заметил случайно: ждал свой маршрут и не дождался. Всё, что
 * влито после поломки, лежало на main и не существовало для людей.
 *
 * Признак не требует знания причины: если последний коммит main НОВЕЕ того,
 * что отвечает прод, значит выкладка отстала. Спрашиваем сам сервис — он
 * отдаёт версию в /health.
 */
console.log('\nДеплой')
try {
  const r = await get(`${RENDER}/health`, 20000)
  const prodVersion = r.json?.version || r.json?.commit || null
  if (!r.ok) {
    bad(`здоровье сервиса не ответило: HTTP ${r.status}`)
  } else if (!prodVersion) {
    // Не ошибка: /health может не отдавать версию. Но и проверить нечего —
    // говорим об этом прямо, а не молчим с видом успеха.
    note('/health не отдаёт версию — сверить выкладку нечем')
  } else {
    const { execFileSync } = await import('node:child_process')
    const repoDir = path.dirname(fileURLToPath(import.meta.url))
    /**
     * ОБНОВИТЬ ССЫЛКУ ПЕРЕД СРАВНЕНИЕМ.
     *
     * Первая версия читала `origin/main` как есть — то есть каким он был на
     * момент последнего fetch в этом клоне. Ворота тут же дали ЛОЖНУЮ
     * тревогу: прод стоял на голове main, а локальная ссылка отставала на
     * коммит, и разница читалась как невыложенная правка.
     *
     * Ложная тревога в детекторе хуже отсутствия детектора: её один раз
     * объясняют, второй раз пролистывают, а третий — уже не читают вовсе.
     */
    try {
      execFileSync('git', ['fetch', 'origin', 'main', '--quiet'], {
        cwd: repoDir,
        encoding: 'utf8',
        timeout: 20000,
      })
    } catch {
      // Сеть могла не ответить. Сравнение всё равно проведём, но скажем, что
      // ссылка может быть несвежей — молчать об этом значит врать числом.
      note('origin/main не обновлён, сравнение может отставать')
    }
    /**
     * COMPARE AGAINST THE LAST COMMIT THIS SERVICE ACTUALLY BUILDS.
     *
     * The head of main is the wrong reference point. Railway rebuilds the
     * render service only when a push touched its paths, so a docs commit on
     * top rebuilds nothing -- correctly. The previous version compared against
     * the head, so every report commit of mine raised "deploy behind" while the
     * service had not one unshipped line. Measured 2026-08-29: prod b48d1e2,
     * head eac7e396, and the diff between them under apps/vibee-editor/render
     * is empty.
     *
     * Exactly the failure class that already cost 51 hours: an alarm that cries
     * over the harmless teaches you not to read it. Count as behind only a gap
     * in the paths the service builds from -- then the "render fix, docs-only on
     * top, deploy skipped" trap stays visible and the noise goes away.
     */
    // The `:/` prefix is required: git pathspecs resolve against the CURRENT
    // directory, and this script runs from its own (.claude/loop-opus). Without
    // it the filter matches nothing, `git log` returns empty, and the check
    // silently falls back to the head of main -- looking healthy while doing
    // nothing. Caught by mutation: swapping the paths for unrelated ones did
    // not change the output.
    const BUILD_PATHS = [':/apps/vibee-editor/render']
    const mainHead = execFileSync(
      'git',
      ['rev-parse', '--short', 'origin/main'],
      {
        cwd: repoDir,
        encoding: 'utf8',
      }
    ).trim()
    let expected = mainHead
    try {
      const own = execFileSync(
        'git',
        ['log', '-1', '--format=%h', 'origin/main', '--', ...BUILD_PATHS],
        { cwd: repoDir, encoding: 'utf8' }
      ).trim()
      if (own) expected = own
    } catch {
      // History unreadable -- compare against the head as before. Worse, but
      // it errs on the cautious side: a spare alarm, not a missed one.
    }
    if (!String(prodVersion).startsWith(expected.slice(0, 7))) {
      bad(
        `выкладка отстала: на проде ${prodVersion}, а рендер собирается из ${expected}` +
          (expected === mainHead
            ? ''
            : ` (голова main ${mainHead} рендера не трогает)`)
      )
    } else if (expected === mainHead) {
      ok(`прод на ${prodVersion} — совпадает с main`)
    } else {
      ok(
        `прод на ${prodVersion} — это последняя правка рендера (main ушёл дальше, но мимо него)`
      )
    }
  }
} catch (e) {
  bad(`проверка выкладки: ${e.message}`)
}

// ─── 3. Мини-апп отвечает и отдаёт приложение ────────────────────────────
console.log('\nМини-апп')
for (const path of ['/', '/feed', '/chat']) {
  try {
    const r = await get(`${APP}${path}`)
    // Не только код: SPA обязана отдать html с точкой монтирования. 200 с
    // чужой страницей — это тоже отказ, просто молчаливый.
    if (!r.ok) bad(`${APP}${path} → HTTP ${r.status}`)
    else if (!r.text.includes('<div id="root"'))
      bad(`${APP}${path} → 200, но это не приложение (нет #root)`)
    else ok(`${path} отвечает приложением`)
  } catch (e) {
    bad(`${APP}${path}: ${e.message}`)
  }
}

// ─── 4. Маршруты не отдают чужой ресурс с кодом 200 ──────────────────────
console.log('\nМаршруты (лишний сегмент должен давать 404)')
for (const p of [
  '/api/feed/чепуха',
  '/api/users/t27_dev/чепуха',
  '/api/users/id/144022504/чепуха',
]) {
  try {
    const r = await get(`${RENDER}${p}`)
    if (r.status === 404) ok(`${p} → 404`)
    else
      bad(
        `${p} → HTTP ${r.status}, а должен быть 404 (маршрут глотает подпуть)`
      )
  } catch (e) {
    bad(`${p}: ${e.message}`)
  }
}

// ─── 5. Профиль показывает работы ────────────────────────────────────────
console.log('\nПрофиль')
try {
  const prof = await get(`${RENDER}/api/users/t27_dev`)
  const tpl = await get(`${RENDER}/api/users/t27_dev/templates?limit=50`)
  const заявлено = Number(prof.json?.templates_count ?? -1)
  const отдано = Array.isArray(tpl.json?.templates)
    ? tpl.json.templates.length
    : -1
  if (заявлено < 0 || отдано < 0) {
    bad('не удалось сверить счётчик работ с их списком')
  } else if (отдано === 0 && заявлено > 0) {
    bad(`счётчик обещает ${заявлено} работ, а список пуст — маршрут снова врёт`)
  } else {
    ok(`счётчик ${заявлено}, список отдал ${отдано}`)
  }
} catch (e) {
  bad(`профиль: ${e.message}`)
}

// ─── 6. Мои правки на месте? ─────────────────────────────────────────────
/**
 * ПОЧЕМУ ЭТО ЗДЕСЬ, А НЕ ОТДЕЛЬНОЙ КОМАНДОЙ.
 *
 * verify-landed.mjs существует с витка 12, но я запускал его В КОНЦЕ витка —
 * и перезапись PR #696 чужим мержем заметил не он, а мой собственный взгляд
 * на скриншот, случайно, по другому поводу. Правка пролежала утраченной
 * меньше суток только потому, что я в тот день открыл ленту глазами.
 *
 * Порядок должен быть: сначала «что сломалось», потом «что у меня отняли», и
 * только затем новая работа. Одна команда вместо двух — иначе вторую забудут.
 */
console.log('\nПравки на месте')
try {
  const { execFileSync } = await import('node:child_process')
  const out = execFileSync(
    process.execPath,
    // The fourth seam. §6 reads a CHILD PROCESS's exit code and streams, so no
    // HTTP fake can reach it — the two branches below are only testable by
    // swapping the child. anomalies-selftest.mjs points this at the real
    // verify-landed.mjs with a manifest fixture, which is what keeps the
    // stderr-capture rule below honest.
    [
      process.env.ANOMALIES_VERIFY_SCRIPT ||
        path.join(HERE, 'verify-landed.mjs'),
    ],
    // stderr MUST be captured, not inherited: the script prints the names of
    // the vanished fixes through console.error, and when inherited they go
    // straight to the screen, past this branch. The parser below then finds no
    // miss line in stdout and, instead of the precise "overwritten: routes.ts
    // has no resolveIdentity", prints the nonsense "check did not run: checked
    // 79 of 79" -- losing exactly what the check exists for. Measured
    // 2026-08-29.
    {
      encoding: 'utf8',
      cwd: path.resolve(HERE, '..', '..'),
      // 'pipe', not 'inherit' -- and this line has now been flipped back to
      // 'inherit' once, by an edit that kept the comment above demanding the
      // opposite. The self-test's L01 case is what caught it; a comment cannot
      // enforce anything, only a check can.
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )
  const m = out.match(/проверено следов: (\d+) из (\d+)/)
  ok(`ни одна правка не перезаписана${m ? ` (следов ${m[1]})` : ''}`)
} catch (e) {
  // Ненулевой код возврата — значит след пропал. Печатаем строки с пропажами:
  // они уже названы поимённо, повторять разбор незачем.
  const out = `${e.stdout || ''}\n${e.stderr || ''}`.trim() || String(e.message)
  const пропали = out
    .split('\n')
    .filter(l => l.includes('нет «'))
    .map(l => l.trim())
  if (пропали.length) {
    for (const l of пропали) bad(`перезаписано: ${l}`)
  } else {
    bad(`проверка следов не отработала: ${out.slice(0, 160)}`)
  }
}

// ─── Итог ────────────────────────────────────────────────────────────────
/**
 * ЧТО ИЗМЕНИЛОСЬ С ПРОШЛОГО РАЗА.
 *
 * Список аномалий сам по себе быстро превращается в фон: две строки про FAL
 * и ElevenLabs висят несколько витков подряд, и глаз перестаёт их читать —
 * ровно так же, как «46 ошибок типов, как на main» несколько циклов
 * закрывало проверку и ничего не значило.
 *
 * Значение имеет ИЗМЕНЕНИЕ. Новая аномалия — это регрессия, случившаяся,
 * пока меня не было, и заниматься надо ей. Ушедшая — подтверждение, что
 * правка или действие владельца сработали. Держащаяся — то, что ждёт не
 * меня.
 *
 * Ключ строки — до первого тире: сам текст отказа от чужого сервиса меняется
 * (таймеры, идентификаторы запросов), а «FAL — картинки» остаётся.
 */
const key = s =>
  String(s)
    .split(' — ')[0]
    // ЧИСЛА ИЗ КЛЮЧА ВЫКИДЫВАЕМ. Первая версия брала всё до тире — и
    // «конвейер стоит: последний ролик 6.4 ч назад» каждый запуск считался
    // НОВЫМ, а прошлый «6.2 ч назад» — УШЕДШИМ. Одна и та же поломка мигала
    // как две, то есть дифф врал ровно там, где должен был отделять новое от
    // старого. Час, размер, код ответа — это подробности, а не суть.
    .replace(/[\d.,]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
/**
 * ИСТОРИЯ, А НЕ ОДНО СОСТОЯНИЕ.
 *
 * Память хранила последний запуск. Я прогнал сканер дважды за виток — и
 * сообщение «🟢 УШЛО: конвейер стоит» показалось только в первом выводе,
 * который я не дочитал. Второй запуск уже сравнивал новое с новым и молчал.
 * Инструмент, сделанный чтобы не пропустить изменение, сам его прятал.
 *
 * Теперь храним несколько последних запусков и показываем изменение
 * относительно последнего ОТЛИЧАЮЩЕГОСЯ состояния. Повтор в тот же виток
 * больше ничего не съедает: пока набор аномалий не менялся, сообщение
 * остаётся на экране вместе с датой, когда это случилось.
 */
const HISTORY_LIMIT = 8
let history = []
try {
  const raw = JSON.parse(fs.readFileSync(MEMORY, 'utf8'))
  history = Array.isArray(raw.history)
    ? raw.history
    : raw.anomalies // старый формат — одно состояние
      ? [{ at: raw.at, anomalies: raw.anomalies }]
      : []
} catch {
  /* первый запуск — сравнивать не с чем */
}
// The most recent state that DIFFERS from the current one -- compare to it.
const currentKey = JSON.stringify(anomalies.map(x => String(x)).sort())
const previous = history
  .slice()
  .reverse()
  .find(
    h =>
      JSON.stringify((h.anomalies || []).map(x => String(x)).sort()) !==
      currentKey
  )
/**
 * THREE DIFFERENT CASES, not two.
 *
 * This used to read `previous ? ... : []`, and that was a defect in exactly the
 * place the tool was written for. `find` returns undefined in TWO incompatible
 * situations:
 *
 *   1. there is no history at all -- genuinely nothing to compare against;
 *   2. no past state DIFFERS from the current one, i.e. the anomaly set has
 *      been holding steady.
 *
 * The second case is the quietest possible: nothing changed. The code treated
 * the past as empty and declared every current anomaly NEW. Eight identical
 * records in a row, with "NEW: FAL, ElevenLabs" printed over them.
 *
 * The trap is that the bug wakes up ONLY once things settle: while the state
 * kept changing, a differing past was found and the diff was right. The tool
 * lied precisely when lying costs most -- on a calm day, teaching you not to
 * trust red.
 */
const hasHistory = history.length > 0
const unchanged = hasHistory && !previous
// On a first run there is nothing to compare against, and painting everything
// red is dishonest: "new" means "appeared while I was away", not "I am seeing
// this for the first time".
const quiet = unchanged || !hasHistory
const prevList = previous ? previous.anomalies || [] : []
const current = anomalies.map(key)
const before = prevList.map(key)
const fresh = quiet ? [] : current.filter(k => !before.includes(k))
const gone = quiet ? [] : before.filter(k => !current.includes(k))

console.log('')
if (fresh.length) {
  console.log('🔴 НОВОЕ с прошлого запуска:')
  for (const k of fresh) console.log(`     ${k}`)
}
if (gone.length) {
  console.log('🟢 УШЛО с прошлого запуска:')
  for (const k of gone) console.log(`     ${k}`)
}
if (previous && (fresh.length || gone.length)) {
  console.log(
    `   (изменилось с ${String(previous.at).slice(0, 16).replace('T', ' ')})`
  )
}
if (!fresh.length && !gone.length) {
  console.log(
    unchanged
      ? `   набор аномалий не менялся (${history.length} прогон(ов) подряд)`
      : hasHistory
        ? '   набор аномалий не менялся'
        : '   первый запуск, сравнивать не с чем'
  )
}

try {
  history.push({ at: new Date().toISOString(), anomalies })
  fs.writeFileSync(
    MEMORY,
    JSON.stringify({ history: history.slice(-HISTORY_LIMIT) }, null, 2) + '\n'
  )
} catch (e) {
  console.log(`   (не удалось запомнить результат: ${e.message})`)
}

console.log('')
if (anomalies.length) {
  const tailLine = fresh.length
    ? 'Начинать надо с НОВОГО — остальное ждёт владельца.'
    : 'Всё это держится с прошлого раза и ждёт владельца, а не меня.'
  // Notes are printed here too. They are the third outcome -- "could not
  // measure" -- and it is lost precisely when there are real failures: those
  // are visible, while the unmeasured slips quietly into the green background.
  const unmeasured = notes.length ? `, не измерено: ${notes.length}` : ''
  console.log(`⚠️  АНОМАЛИЙ: ${anomalies.length}${unmeasured}. ${tailLine}\n`)
  process.exit(1)
}
console.log(
  `✅ аномалий нет${notes.length ? ` (заметок: ${notes.length})` : ''}\n`
)
