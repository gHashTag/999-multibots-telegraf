#!/usr/bin/env node
/**
 * tri shot [story-palette] [--width 390] [--lang ru|en] [--out DIR]
 *
 * A screen measured on a phone, not described. The player's own dev server
 * serves harness/<name>.html -- the real component, the page's wrapper, the
 * app's sheets -- and real Chromium opens it as a phone would: narrow,
 * touch, a coarse pointer (the page's finger-sized rules are written for
 * `pointer: coarse` and never apply on a desktop viewport). The panel's
 * tool calls are answered by the host's own functions
 * (shot-story-answer.ts), so the refusal and its three options on the
 * picture are the server's, not a fixture's.
 *
 * WHY. Four turns (8-11) built the palette panel and checked it with DOM
 * tests only; jsdom has no layout, so "the button is there" passed for a
 * button 32 px tall that a thumb misses. The page states its own target --
 * `--touch-target: 44px` in index.css -- and this reads it FROM THE PAGE
 * rather than hard-coding a number that could drift from it.
 *
 * Each state is a PNG plus four measurements, all inside the panel:
 *   - wider: the page scrolls sideways (documentElement.scrollWidth);
 *   - small: a button, input or link under the target on either side;
 *   - cut: text clipped by its own box (scrollWidth > clientWidth);
 *   - overlap: two controls whose boxes intersect;
 *   - order: what a harness says must be read first (its `before` pairs:
 *     the price above the button, spec v16) stands higher on the screen.
 *     A pair whose first element is missing is out of order too: "the
 *     price is above the button" is not true of a price that is not there.
 * Exit 0 clean, 1 something measured wrong, 2 could not measure. The
 * verdict goes to `tri gate`. Nothing is written or started: keeping and
 * start are refused by the answer script.
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const HERE = import.meta.dirname
const ROOT = resolve(HERE, '../..')
const PLAYER = join(ROOT, 'apps/vibee-editor/player')
const RENDER = join(ROOT, 'apps/vibee-editor/render')
const CRM_CLIENT_FIXTURES = JSON.parse(
  readFileSync(join(PLAYER, 'src/harness/crmClientFixtures.json'), 'utf8')
)

// tri gate: the tree as this check found it; record compares it at the end.
process.env.TRI_GATE_START = spawnSync(
  'node',
  [join(HERE, 'gate.mjs'), 'tree'],
  {
    encoding: 'utf8',
  }
).stdout.trim()

const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}
const flags = new Set(['--width', '--lang', '--out'])
const positional = argv.filter(
  (a, i) => !a.startsWith('--') && !flags.has(argv[i - 1])
)
const name = positional[0] ?? 'story-palette'
const width = Number(opt('width', '390'))
const lang = opt('lang', 'ru')
const gitDir = spawnSync('git', ['rev-parse', '--git-dir'], {
  cwd: ROOT,
  encoding: 'utf8',
}).stdout.trim()
// --git-dir is absolute in a worktree; resolve keeps it, join glued it on.
const out = resolve(opt('out', resolve(ROOT, gitDir || '.git', 'tri-shot')))

/*
 * Every harness is a story: the answers its panel gets and the presses that
 * walk it from state to state. The card is a real refusal: a dark call on a
 * dark ground, the case the three options exist for (spec v12-v14).
 */
/* Two reels of hers: one made, one that failed and says why. */
const JOBS = [
  {
    id: 2,
    topic: 'Одна ваза — три комнаты',
    status: 'done',
    url: 'https://example.invalid/reel.mp4',
    created_at: '2026-09-27T10:00:00Z',
  },
  {
    id: 1,
    topic: 'Весенняя коллекция',
    status: 'failed',
    error: 'голос не ответил, токены возвращены',
    created_at: '2026-09-26T10:00:00Z',
  },
]

/*
 * The palette lives under the story panel's closed "More" since #3242 (the
 * dark panel). A stand that waited for it to be visible measured nothing --
 * every run "NOT MEASURED", never red (found 2026-10-02). Open it the way a
 * thumb does: one press on its summary, once.
 */
const openMore = async p => {
  const more = p.locator('.story-reel__more')
  await more.waitFor({ state: 'attached' })
  if (!(await more.evaluate(d => d.open)))
    await more.locator(':scope > summary').click()
}

const HARNESSES = {
  'story-palette': {
    tool: 'crm_story_reel',
    fixture: {
      profile: {
        bg: '#10182a',
        title: '#1d2a4a',
        text: '#f5f5f5',
        accent: '#23305a',
        button: 'Записаться на примерку',
      },
      jobs: JOBS,
    },
    open: openMore,
    root: '[data-testid=story-palette]',
    scope: '.crm-client',
    // The whole story panel around the palette: its start row and reels too.
    within: 'section',
    // Spec v16: the seller's press is paid by the seller -- price first.
    before: [
      ['[data-testid=story-reel-price]', 'section .crm-client__duet-go'],
    ],
    states: [
      {
        id: 'load',
        ready: async p =>
          p.locator('[data-testid=story-palette-fix]').waitFor(),
      },
      {
        id: 'refused',
        ready: async p => {
          await p.locator('[data-testid=story-palette] > button').click()
          await p.locator('[data-action=check]').click()
          await p.locator('[data-testid=story-palette-verdict]').waitFor()
          await p
            .locator('.crm-client__palette-edit [data-action=take]')
            .waitFor()
        },
      },
      {
        id: 'taken',
        ready: async p => {
          await p
            .locator('.crm-client__palette-edit [data-action=take]')
            .click()
          await p
            .locator('[data-testid=story-palette-verdict].crm__counts')
            .waitFor()
        },
      },
    ],
  },
  /*
   * THE WHOLE CLIENT CARD (/crm/:id): six panels and the story panel, as the
   * seller sees them on a phone. The story tool is the host's; the other six
   * answer with the shapes CrmClient.test.tsx holds against the page's
   * mappers, filled to real lengths (a long name, a long message) -- layout
   * breaks on length, not on "Leela". Invented people only.
   */
  'crm-client': {
    tool: 'crm_story_reel',
    fixture: {
      profile: {
        bg: '#1b1b1f',
        title: '#f5f5f5',
        text: '#f5f5f5',
        accent: '#ffd700',
        button: 'Записаться на примерку',
      },
      jobs: JOBS,
    },
    // One source with the harness page, which answers them itself when
    // nothing intercepts (the preview browser, no chrome-headless-shell).
    fixtures: CRM_CLIENT_FIXTURES,
    root: '.crm-client',
    scope: '.crm-client',
    within: 'root',
    states: [
      {
        id: 'load',
        ready: async p => {
          await p.locator('.crm-client__chat').waitFor()
          // Measured open: the closed panel is a strict subset of it.
          await openMore(p)
          await p.locator('[data-testid=story-palette]').waitFor()
          await p.locator('section:has(select) .crm-client__duet-go').waitFor()
        },
      },
      {
        // Dry run off, then start: the one step on the page that asks a
        // second question before real messages go to the client.
        id: 'duet-confirm',
        ready: async p => {
          await p.locator('section:has(select) input[type=checkbox]').uncheck()
          await p.locator('section:has(select) .crm-client__duet-go').click()
          await p.locator('.crm-client__duet-confirm').waitFor()
        },
      },
    ],
  },

  /*
   * THE CRM LIST (/crm): the owner's contact book, opened on a phone to find
   * one person. The harness answers its own tool calls in the page
   * (src/harness/crmFixtures.ts) so the same fixtures serve `tri shot` and a
   * preview pane with no Chromium of its own; `tool` is never reached.
   */
  crm: {
    tool: 'crm_clients',
    root: '.crm',
    scope: '.crm',
    within: 'root',
    states: [
      {
        id: 'load',
        ready: async p => p.locator('.crm__row').first().waitFor(),
      },
      {
        // The owner's complaint, 2026-10-01: finding one contact on a phone.
        // Open the contacts section where there is one, then type.
        id: 'search',
        ready: async p => {
          const tab = p.locator('.section-strip__item', {
            hasText: /Контакты|Contacts/, // cyrillic-ok: the RU label
          })
          if (await tab.count()) await tab.first().click()
          const box = p.locator('.crm input[type=search]')
          await box.scrollIntoViewIfNeeded()
          await box.fill('ан')
          await p.waitForTimeout(400)
        },
      },
    ],
  },

  /*
   * HER OWN PAGE (/story): the client presses here with her thumb, from her
   * bot. The answers are my_story_reel's shape and the host's price; "make"
   * is refused by the answer script, so the refusal line is shot too.
   */
  'my-story': {
    tool: 'my_story_reel',
    fixture: { next_topic: 'Как выбрать вазу под свой интерьер', jobs: JOBS },
    root: '.story',
    scope: '.story',
    within: 'root',
    // Spec v16: her price (or that it is a gift) is read before her press.
    before: [['[data-testid=story-price]', '.story .crm-client__duet-go']],
    states: [
      {
        id: 'load',
        ready: async p => p.locator('.story .crm-client__duet-go').waitFor(),
      },
      {
        id: 'pressed',
        ready: async p => {
          await p.locator('.story input[type=text]').fill('Весенний букет')
          await p.locator('.story .crm-client__duet-go').click()
          await p.locator('.story [role=status]').waitFor()
        },
      },
    ],
  },
  /*
   * Her reels inside the chat with the agent (owner, 2026-10-02): the same
   * widget, open before the talk and folded after. The summary is the
   * press that unfolds it, so it is held to the page's touch target.
   */
  'chat-story': {
    tool: 'my_story_reel',
    fixture: { next_topic: 'Как выбрать вазу под свой интерьер', jobs: JOBS },
    root: '.chat-story-stand',
    scope: '.chat-story-stand',
    within: 'root',
    states: [
      {
        id: 'load',
        ready: async p =>
          p.locator('.chat-story .crm-client__duet-go').first().waitFor(),
      },
    ],
  },
}

/*
 * tri shot all: every harness at the matrix a gate needs -- 390 px in both
 * languages and the narrowest phone, 320 px. Three turns ran this by hand
 * in a shell loop; a loop is where one line gets forgotten. Each run records
 * itself in tri gate as usual. Exit: 1 if any is red, else 2 if any could
 * not measure, else 0.
 *
 * One dev server serves every run (TRI_SHOT_BASE): a Vite start per run was
 * most of the cost -- twelve starts took over ten minutes on a loaded
 * machine, which is how a gate gets switched off. Runs go TRI_SHOT_JOBS at a
 * time (default 3); each still has its own browser and its own verdict, and
 * the report keeps the matrix order whatever finishes first.
 */
const freePort = () =>
  new Promise((ok, fail) => {
    const s = createServer()
    s.unref()
    s.on('error', fail)
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address()
      s.close(() => ok(port))
    })
  })

/** The player's dev server, answered at `probe` before it is handed out. */
const startVite = async probe => {
  const port = await freePort()
  const server = spawn(
    join(PLAYER, 'node_modules/.bin/vite'),
    ['--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: PLAYER, stdio: ['ignore', 'pipe', 'pipe'], detached: true }
  )
  let log = ''
  server.stdout.on('data', c => (log += c))
  server.stderr.on('data', c => (log += c))
  const base = `http://127.0.0.1:${port}`
  const until = Date.now() + 120_000
  for (;;) {
    const ok = await fetch(base + probe)
      .then(r => r.ok)
      .catch(() => false)
    if (ok) return { server, base }
    if (Date.now() > until || server.exitCode !== null) {
      stopVite(server)
      throw new Error(`dev server did not answer ${probe}\n${log.slice(-1500)}`)
    }
    await new Promise(r => setTimeout(r, 500))
  }
}

const stopVite = server => {
  if (!server?.pid) return
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {
    /* already gone */
  }
}

if (name === 'all') {
  const MATRIX = [
    ['390', 'ru'],
    ['390', 'en'],
    ['320', 'ru'],
  ]
  const runs = Object.keys(HARNESSES).flatMap(each =>
    MATRIX.map(([w, l]) => [each, w, l])
  )
  let vite
  try {
    vite = await startVite(`/harness/${runs[0][0]}.html`)
  } catch (e) {
    console.log(`== shot NOT MEASURED -- all: ${e.message}`)
    process.exit(2)
  }
  const one = ([each, w, l]) =>
    new Promise(done => {
      const child = spawn(
        'node',
        [process.argv[1], each, '--width', w, '--lang', l],
        {
          env: { ...process.env, TRI_SHOT_BASE: vite.base },
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      )
      let stdout = ''
      child.stdout.on('data', c => (stdout += c))
      // Drain stderr even though only stdout carries the verdict: an unread
      // pipe fills at ~64 KB and the child then blocks forever on a write.
      child.stderr.resume()
      // A child that cannot start is "not measured", not a crash of the matrix.
      child.on('error', () => done({ stdout, status: 2 }))
      child.on('close', status => done({ stdout, status }))
    })
  const results = new Array(runs.length)
  let next = 0
  const lanes = Math.max(1, Number(process.env.TRI_SHOT_JOBS) || 3)
  await Promise.all(
    Array.from({ length: Math.min(lanes, runs.length) }, async () => {
      while (next < runs.length) {
        const i = next++
        results[i] = await one(runs[i])
      }
    })
  )
  stopVite(vite.server)
  let worst = 0
  runs.forEach(([each, w, l], i) => {
    const r = results[i]
    const verdict = r.stdout
      .split('\n')
      .filter(x => /^== shot|^\s+(small|cut|overlap|order|error) /.test(x))
    for (const x of verdict) console.log(x)
    if (!verdict.length)
      console.log(`== shot NOT MEASURED -- ${each} ${w} ${l}`)
    const c = r.status ?? 2
    worst = c === 1 || worst === 1 ? 1 : Math.max(worst, c)
  })
  process.exit(worst)
}

const h = HARNESSES[name]
if (
  !h ||
  !Number.isInteger(width) ||
  width < 240 ||
  !['ru', 'en'].includes(lang)
) {
  console.log(
    `usage: tri shot [${Object.keys(HARNESSES).join('|')}|all] [--width 390] [--lang ru|en] [--out DIR]`
  )
  process.exit(2)
}

const answer = (tool, args) => {
  const r = spawnSync(
    join(RENDER, 'node_modules/.bin/tsx'),
    [
      join(HERE, 'shot-story-answer.ts'),
      JSON.stringify({ ...h.fixture, tool, args }),
    ],
    { cwd: RENDER, encoding: 'utf8' }
  )
  if (r.status !== 0) throw new Error(`answer script: ${r.stderr.trim()}`)
  return JSON.parse(r.stdout.trim().split('\n').pop())
}

/* Measured in the page: the target is the page's own --touch-target. */
function measure({ root, scope, within: area, before = [] }) {
  const target =
    parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        '--touch-target'
      )
    ) || 44
  const box = document.querySelector(scope) ?? document.body
  const panel = document.querySelector(root)
  const within =
    (area === 'section' ? panel?.closest('section') : panel) ?? panel ?? box
  const name = el => {
    const tag = el.tagName.toLowerCase()
    const tagged =
      el.getAttribute('data-action') ??
      el.getAttribute('data-field') ??
      el.getAttribute('type') ??
      ''
    const text = (el.textContent || el.getAttribute('aria-label') || '')
      .trim()
      .slice(0, 24)
    return `${tag}${tagged ? `[${tagged}]` : ''}${text ? ` «${text}»` : ''}`
  }
  const shown = el => {
    const r = el.getBoundingClientRect()
    return (
      r.width > 0 &&
      r.height > 0 &&
      getComputedStyle(el).visibility !== 'hidden'
    )
  }
  const controls = [
    ...within.querySelectorAll('button, input, select, textarea, a[href]'),
  ].filter(shown)
  // A checkbox or radio is pressed through its label: the label is the
  // target a thumb meets (turn 14: a 13 px box inside a 44 px label is fine).
  const hit = el =>
    (el.matches('input[type=checkbox], input[type=radio]') &&
      el.closest('label')) ||
    el
  const small = controls
    .map(el => ({ el, r: hit(el).getBoundingClientRect() }))
    .filter(({ r }) => r.height < target - 0.5 || r.width < target - 0.5)
    .map(
      ({ el, r }) =>
        `${name(el)} ${Math.round(r.width)}×${Math.round(r.height)}`
    )
  const cut = [...within.querySelectorAll('*')]
    .filter(shown)
    .filter(el => {
      const s = getComputedStyle(el)
      return (
        s.overflowX !== 'visible' &&
        el.scrollWidth > el.clientWidth + 1 &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
      )
    })
    .map(el => `${name(el)} ${el.scrollWidth}>${el.clientWidth}`)
  const overlap = []
  const rects = controls.map(el => ({ el, r: el.getBoundingClientRect() }))
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i].r
      const b = rects[j].r
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (x > 1 && y > 1)
        overlap.push(`${name(rects[i].el)} ∩ ${name(rects[j].el)}`)
    }
  const wider = document.documentElement.scrollWidth - window.innerWidth
  // Whether this is still a phone: the finger rules are `pointer: coarse`.
  const coarse = matchMedia('(pointer: coarse)').matches
  const order = before
    .map(([first, then]) => {
      const a = document.querySelector(first)
      const b = document.querySelector(then)
      if (!b) return null
      if (!a) return `${first} missing, ${then} is there`
      return a.getBoundingClientRect().bottom <= b.getBoundingClientRect().top
        ? null
        : `${first} is not above ${then}`
    })
    .filter(x => x !== null)
  return {
    order,
    target,
    controls: controls.length,
    wider,
    small,
    cut,
    overlap,
    coarse,
  }
}

let server
let browser
let code = 2
const lines = []
try {
  const require = createRequire(join(PLAYER, 'package.json'))
  const { chromium } = require('playwright')
  // `tri shot all` hands every run its one server; alone, a run starts its own.
  const probe = `/harness/${name}.html`
  let base = process.env.TRI_SHOT_BASE
  if (!base) ({ server, base } = await startVite(probe))
  const url = base + probe

  /* The container's Chromium, whatever revision this playwright expects. */
  // On a Mac with no playwright download, any installed Chromium-family
  // browser opens the page the same way (a fresh temp profile, never the
  // person's own); TRI_SHOT_CHROME names one explicitly.
  const exe = [
    process.env.TRI_SHOT_CHROME,
    '/opt/pw-browsers/chromium',
    chromium.executablePath(),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/BrowserOS.app/Contents/MacOS/BrowserOS',
  ].find(p => p && existsSync(p))
  browser = await chromium.launch({ executablePath: exe })
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: lang === 'ru' ? 'ru-RU' : 'en-US',
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.route('**/mcp', async route => {
    const body = JSON.parse(route.request().postData() || '{}')
    const tool = body?.params?.name
    const args = body?.params?.arguments ?? {}
    // A harness may fix other tools' answers by name (their shapes come
    // from the page's own tests); the harness tool is always the host's.
    const fixed = h.fixtures?.[tool]
    if (fixed)
      return route.fulfill({
        json: {
          jsonrpc: '2.0',
          id: body.id,
          result: { content: [{ type: 'text', text: JSON.stringify(fixed) }] },
        },
      })
    if (tool !== h.tool)
      return route.fulfill({
        json: {
          jsonrpc: '2.0',
          id: body.id,
          error: { message: `tri shot: no ${tool}` },
        },
      })
    const result = answer(tool, args)
    return route.fulfill({
      json: {
        jsonrpc: '2.0',
        id: body.id,
        result: { content: [{ type: 'text', text: JSON.stringify(result) }] },
      },
    })
  })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  // A root behind a closed door (a <details>) is opened first, as a thumb would.
  await h.open?.(page)
  await page.locator(h.root).waitFor({ timeout: 60_000 })

  mkdirSync(out, { recursive: true })
  let bad = 0
  for (const s of h.states) {
    await s.ready(page)
    await page.waitForTimeout(150)
    const m = await page.evaluate(measure, {
      root: h.root,
      scope: h.scope,
      within: h.within,
      before: h.before,
    })
    /*
     * A DESKTOP MEASURED AND CALLED A PHONE. Measured 27.09.2026: after one
     * `screenshot({ fullPage: true })` this Chromium answers
     * `(pointer: coarse)` false for the rest of the page's life, and every
     * later state was measured with the finger rules off -- the fix looked
     * like it worked in one state and not in two. So: no fullPage (a
     * viewport as tall as the page instead, which keeps the emulation), and
     * a state measured without a coarse pointer is not measured at all.
     */
    if (!m.coarse)
      throw new Error(
        `${s.id}: the page no longer has a coarse pointer -- not a phone, not measured`
      )
    const file = join(out, `${name}-${s.id}-${width}-${lang}.png`)
    const tall = await page.evaluate(
      () => document.documentElement.scrollHeight
    )
    await page.setViewportSize({ width, height: Math.max(844, tall) })
    await page.screenshot({ path: file })
    await page.setViewportSize({ width, height: 844 })
    const wrong =
      (m.wider > 0 ? 1 : 0) +
      m.small.length +
      m.cut.length +
      m.overlap.length +
      m.order.length
    bad += wrong
    lines.push(
      `${wrong ? 'RED  ' : 'ok   '}${s.id}: ${m.controls} controls, target ${m.target}px, ` +
        `wider ${m.wider}px, small ${m.small.length}, cut ${m.cut.length}, overlap ${m.overlap.length}, order ${m.order.length} · ${file}`
    )
    for (const x of m.small) lines.push(`       small   ${x}`)
    for (const x of m.cut) lines.push(`       cut     ${x}`)
    for (const x of m.overlap) lines.push(`       overlap ${x}`)
    for (const x of m.order) lines.push(`       order   ${x}`)
  }
  if (errors.length) {
    bad += errors.length
    for (const e of errors) lines.push(`       error   ${e.slice(0, 200)}`)
  }
  code = bad ? 1 : 0
} catch (e) {
  lines.push(`could not measure: ${e instanceof Error ? e.message : e}`)
  code = 2
} finally {
  await browser?.close().catch(() => {})
  stopVite(server)
}

for (const l of lines) console.log(l)
const verdict = code === 0 ? 'green' : code === 1 ? 'RED' : 'NOT MEASURED'
console.log(`== shot ${verdict} -- ${name} at ${width}px (${lang})`)
spawnSync('node', [
  join(HERE, 'gate.mjs'),
  'record',
  // One record per language: English words are shorter, so its targets
  // differ, and a second language must not stand in for the first.
  `shot ${name} ${width} ${lang}`,
  code === 0 ? 'ok' : 'fail',
  lines
    .filter(l => !l.startsWith('       '))
    .join(' | ')
    .slice(0, 400),
])
process.exit(code)
