#!/usr/bin/env node
/**
 * A CONTROL A PERSON CANNOT PRESS IS NOT SHIPPED, AND A SCRIPTED CLICK CANNOT
 * TELL YOU THAT.
 *
 * This census cost two cycles. A probe reported 11 of 11 TRI controls working
 * while nobody could press a single one of them, because it called
 * `element.click()`: that dispatches to the handler directly and proves the
 * handler exists, never that the pixel belongs to the element. The second cycle
 * was the feed card's action rail, where the star button sat under the app's own
 * header on a short viewport -- visible, drawn, and inert.
 *
 * So the question here is the one a finger asks: at the centre of this control,
 * which element does the document hand back?
 *
 *   node scripts/reachability-live.mjs <url> [--size WxH ...] [--gate]
 *   node scripts/reachability-live.mjs --self-check
 *
 * THREE RULES THIS PROBE HAD TO LEARN, EACH FROM A WRONG ANSWER:
 *
 * 1. elementFromPoint returns null for any point OUTSIDE the viewport, so a
 *    miss is only a defect when the centre was actually on screen. A rail
 *    taller than a short window reports its off-screen buttons as "not
 *    reachable" -- true, and not a bug. Blocked (covered by something) and
 *    offscreen (scrolled past the edge) are reported as different things.
 *
 * 2. An element with `display: contents` has a 0x0 rect. Its own centre is
 *    meaningless, so it is measured through its first child box instead.
 *
 * 3. A hit on a DESCENDANT of the control counts as a hit: an <svg> inside a
 *    button is the button as far as a finger is concerned.
 *
 * WHY THE SELF-CHECK IS NOT OPTIONAL. This file's whole value is its ability to
 * say "no". A ruler that can only report success is not a ruler, and half the
 * probes in this repository were written after one lied. `--self-check` renders
 * a page with one clear button and one deliberately covered button and demands
 * exactly one finding, naming the coverer.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const DEFAULT_SIZES = ['1723x720', '1440x900', '1087x430', '390x844']

const argv = process.argv.slice(2)
const selfCheck = argv.includes('--self-check')
const gate = argv.includes('--gate')
const sizes = argv.reduce(
  (acc, a, i) => (a === '--size' && argv[i + 1] ? [...acc, argv[i + 1]] : acc),
  []
)
const url = argv.find(a => !a.startsWith('--') && !sizes.includes(a))

const wait = ms => new Promise(r => setTimeout(r, ms))

// The page-side census. Kept as a string because it is evaluated inside the
// document under test, which may be a cross-origin frame we only reach through
// an isolated world.
const CENSUS = `(() => {
  const SEL = 'button, a[href], [role="button"], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  const box = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return r
    // display: contents has no box of its own; measure the first child that does.
    for (const c of el.children) { const cr = c.getBoundingClientRect(); if (cr.width > 0 && cr.height > 0) return cr }
    return null
  }
  const name = (el) => {
    if (!el) return null
    const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '').trim()
    return (el.tagName.toLowerCase() + (cls ? '.' + cls.split(/\\s+/).slice(0, 3).join('.') : '')).slice(0, 60)
  }
  const out = []
  for (const el of document.querySelectorAll(SEL)) {
    const r = box(el)
    if (!r) continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue
    const x = r.left + r.width / 2, y = r.top + r.height / 2
    const inView = x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight
    const hit = inView ? document.elementFromPoint(x, y) : null
    const hitsSelf = !!hit && (hit === el || el.contains(hit))
    out.push({
      control: name(el),
      label: (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      inView,
      hitsSelf,
      coveredBy: inView && !hitsSelf ? name(hit) : null,
    })
  }
  return { href: location.href, viewport: { w: innerWidth, h: innerHeight }, controls: out }
})()`

async function connect(width, height) {
  const dir = mkdtempSync(join(tmpdir(), 'reach-'))
  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${dir}`,
      '--no-first-run',
      `--window-size=${width},${height}`,
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  )
  const endpoint = await new Promise((resolve, reject) => {
    let buf = ''
    const timer = setTimeout(
      () => reject(new Error('chrome did not open a debugging port')),
      30000
    )
    chrome.stderr.on('data', d => {
      buf += d
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/)
      if (m) {
        clearTimeout(timer)
        resolve(m[1])
      }
    })
  })
  const ws = new WebSocket(endpoint)
  await new Promise(r => (ws.onopen = r))
  let id = 0
  const pending = new Map()
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m.result ?? { error: m.error })
      pending.delete(m.id)
    }
  }
  const send = (method, params = {}, sessionId) =>
    new Promise(r => {
      const k = ++id
      pending.set(k, r)
      ws.send(
        JSON.stringify({
          id: k,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        })
      )
    })
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await send('Target.attachToTarget', {
    targetId,
    flatten: true,
  })
  await send('Page.enable', {}, sessionId)
  await send('Runtime.enable', {}, sessionId)
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width, height, deviceScaleFactor: 1, mobile: width < 768 },
    sessionId
  )
  const close = () => {
    try {
      chrome.kill('SIGKILL')
    } catch {}
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {}
  }
  return { send, sessionId, close }
}

async function census(target, sessionId, send, settleMs) {
  await send('Page.navigate', { url: target }, sessionId)
  await wait(settleMs)
  const res = await send(
    'Runtime.evaluate',
    { expression: CENSUS, returnByValue: true, awaitPromise: true },
    sessionId
  )
  return res.result?.value ?? null
}

async function runSelfCheck() {
  // One button is clear, one is covered by an overlay that is NOT its ancestor.
  // The probe must find exactly the second, and must name the overlay.
  const page =
    'data:text/html,' +
    encodeURIComponent(`<!doctype html><style>
    body { margin: 0 } button { position: absolute; width: 80px; height: 30px }
    #clear { left: 20px; top: 20px } #covered { left: 20px; top: 120px }
    #lid { position: absolute; left: 0; top: 110px; width: 300px; height: 60px; background: rgba(0,0,0,.4); z-index: 5 }
  </style><button id="clear">clear</button><button id="covered">covered</button><div id="lid" class="overlay"></div>`)
  const { send, sessionId, close } = await connect(400, 300)
  try {
    const report = await census(page, sessionId, send, 400)
    const blocked = (report?.controls || []).filter(
      c => c.inView && !c.hitsSelf
    )
    const ok =
      blocked.length === 1 &&
      /covered/.test(blocked[0].label) &&
      /overlay|lid|div/.test(String(blocked[0].coveredBy))
    console.log(
      JSON.stringify(
        {
          selfCheck: ok ? 'PASS' : 'FAIL',
          controlsSeen: report?.controls?.length ?? 0,
          blocked,
        },
        null,
        1
      )
    )
    return ok ? 0 : 1
  } finally {
    close()
  }
}

async function runSizes() {
  const wanted = sizes.length ? sizes : DEFAULT_SIZES
  const findings = []
  for (const size of wanted) {
    const [w, h] = size.split('x').map(Number)
    if (!w || !h) {
      console.error(`bad --size ${size}`)
      return 2
    }
    const { send, sessionId, close } = await connect(w, h)
    try {
      const report = await census(url, sessionId, send, 12000)
      if (!report) {
        findings.push({ size, error: 'no report' })
        continue
      }
      const controls = report.controls
      findings.push({
        size,
        href: report.href,
        seen: controls.length,
        offscreen: controls.filter(c => !c.inView).length,
        blocked: controls.filter(c => c.inView && !c.hitsSelf),
      })
    } finally {
      close()
    }
  }
  const blockedTotal = findings.reduce(
    (n, f) => n + (f.blocked?.length || 0),
    0
  )
  console.log(JSON.stringify({ url, findings, blockedTotal }, null, 1))
  return gate && blockedTotal > 0 ? 1 : 0
}

if (selfCheck) process.exit(await runSelfCheck())
if (!url) {
  console.error(
    'usage: reachability-live.mjs <url> [--size WxH ...] [--gate] | --self-check'
  )
  process.exit(2)
}
process.exit(await runSizes())
