/**
 * DOES A MISSING ENGRAVING LEAVE A TRACE ANYWHERE A PERSON CAN READ?
 *
 * For weeks it did not. `posterUrl` was absent from every published row, the
 * service log held not one `[Generate]` line, and nobody could say why -- the
 * cause had to be re-derived from outside by counting fields in the feed. Two
 * separate silences produced that: a flag no launcher passed, and a failure
 * path that reported nothing.
 *
 * THE SECOND SILENCE IS THE ONE THIS FILE PINS, and it is subtler than it
 * sounds. `call()` throws only on a JSON-RPC `error`; image_generate answers a
 * provider refusal, an exhausted daily cap and an empty wallet as a NORMAL
 * result -- one whose done-flag is false and whose reason field carries the
 * text. So the autopilot's `if (done && url)` guard was simply false,
 * execution walked on, and the try/catch wrapped around it never saw anything,
 * because nothing was ever thrown. There was no log line to grep for and no
 * exception to count. A swallow that complete is indistinguishable from a
 * feature nobody switched on, which is exactly how it was misdiagnosed.
 *
 * SO THE ASSERTION IS AN ARTEFACT, NOT A LOG LINE. The published recipe --
 * template_settings, the thing that makes a feed entry a template rather than a
 * video -- must carry `poster`: delivered with the provider that served, or
 * refused with the reason in the provider's own words. That row is queryable
 * over HTTP by anyone, and it survives the redeploy that wipes LOOP_STATE.md
 * and stdout out of a container with no volume.
 *
 * WHY IT SPAWNS THE REAL SCRIPT. scripts/agent-autopilot.ts is in no tsconfig
 * include -- `tsc --listFilesOnly` lists zero files under scripts/ -- so
 * typecheck says nothing about the file that does the wiring, and
 * image-chain.test.ts can only prove the chain is correct, never that the
 * factory reads its answer. This runs the same entry point production spawns.
 *
 * THE DOUBLE IS AS DUMB AS THE REAL THING: it returns the shapes the real MCP
 * endpoint returns and decides nothing -- each test writes what image_generate
 * will answer into a file before the run. Nothing reaches a network, a provider
 * or a database. Cyrillic response keys are written as \u escapes because the
 * repository guard cannot strip a multi-line template literal and would read a
 * literal Russian key here as a Russian identifier in code.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync, spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HERE = __dirname
const TSX = path.join(HERE, 'node_modules/.bin/tsx')
const SCRIPT = 'scripts/agent-autopilot.ts'

const POSTER = 'https://stub.invalid/poster.png'

const TOPICS = [
  {
    title: 'Tema ocheredi',
    subtitle: 'podpis',
    lesson: 'urok',
    tags: ['t27'],
    plates: [{ label: 'a', value: '1' }],
  },
]

/** The tool's own Cyrillic response keys, as \u escapes for the stub. */
const DONE = '\\u0441\\u0434\\u0435\\u043b\\u0430\\u043d\\u043e'
const REASON = '\\u043f\\u0440\\u0438\\u0447\\u0438\\u043d\\u0430'
const ENTRIES = '\\u0437\\u0430\\u043f\\u0438\\u0441\\u0438'
const READY = '\\u0433\\u043e\\u0442\\u043e\\u0432\\u043e'
const PUBLISHED =
  '\\u043e\\u043f\\u0443\\u0431\\u043b\\u0438\\u043a\\u043e\\u0432\\u0430\\u043d\\u043e'

const STUB_SOURCE = `
const http = require('node:http')
const fs = require('node:fs')
const [, , portFile, callsFile, planFile] = process.argv
const plan = () => { try { return JSON.parse(fs.readFileSync(planFile, 'utf8')) } catch (e) { return {} } }
const note = (name, args) => fs.appendFileSync(callsFile, JSON.stringify({ name, args }) + '\\n')
const send = (res, obj) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}
const server = http.createServer((req, res) => {
  const url = req.url || ''
  if (url.startsWith('/api/blog')) return send(res, { items: [] })
  let body = ''
  req.on('data', c => (body += c))
  req.on('end', () => {
    const p = plan()
    let name = '', args = {}
    try { const j = JSON.parse(body); name = j.params.name; args = j.params.arguments || {} } catch (e) {}
    note(name, args)
    // What image_generate answers is written by the test, never decided here.
    const image = p.image || { ${DONE}: true, url: ${JSON.stringify(POSTER)}, provider: 'kie/google/nano-banana', tried: [] }
    const result =
      name === 'feed_list' ? { ${ENTRIES}: [] } :
      name === 'image_generate' ? image :
      name === 'reel_render' ? { ${READY}: true, url: 'https://stub.invalid/reel.mp4' } :
      { ${PUBLISHED}: false }
    send(res, { jsonrpc: '2.0', id: 1, result: { structuredContent: result } })
  })
})
server.listen(0, '127.0.0.1', () => fs.writeFileSync(portFile, String(server.address().port)))
`

let stub: ChildProcess
let stubDir = ''
let callsFile = ''
let planFile = ''
let baseUrl = ''

beforeAll(async () => {
  stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poster-stub-'))
  const stubFile = path.join(stubDir, 'stub.cjs')
  const portFile = path.join(stubDir, 'port')
  callsFile = path.join(stubDir, 'calls.ndjson')
  planFile = path.join(stubDir, 'plan.json')
  fs.writeFileSync(stubFile, STUB_SOURCE)
  fs.writeFileSync(callsFile, '')
  fs.writeFileSync(planFile, '{}')
  stub = spawn(process.execPath, [stubFile, portFile, callsFile, planFile], {
    stdio: 'ignore',
  })
  /*
   * ДВА СРОКА НА ОДНО ОЖИДАНИЕ ДОЛЖНЫ СОГЛАСОВЫВАТЬСЯ.
   *
   * Здесь стояло 100 попыток по 50 мс — то есть ожидание сдавалось через ПЯТЬ
   * секунд при бюджете хука в двадцать. Под нагрузкой (у меня рядом шла сборка
   * Xcode) Node не успевал подняться и связать порт, хук бросал, и падал ВЕСЬ
   * файл — четыре теста разом, при том что поодиночке и на повторе они зелёные.
   *
   * Плавающий сторож хуже строгого: его однажды спишут на «перезапусти», и
   * вместе с ним спишут настоящую поломку. Внутренний срок теперь занимает
   * почти весь внешний: сдаться раньше бюджета — значит превратить медленную
   * машину в красный тест.
   */
  for (let i = 0; i < 300 && !fs.existsSync(portFile); i++) {
    await new Promise(r => setTimeout(r, 50))
  }
  if (!fs.existsSync(portFile)) throw new Error('stub server never started')
  baseUrl = `http://127.0.0.1:${fs.readFileSync(portFile, 'utf8').trim()}`
}, 20_000)

afterAll(() => {
  stub?.kill('SIGKILL')
  fs.rmSync(stubDir, { recursive: true, force: true, maxRetries: 5 })
})

interface Call {
  name: string
  args: Record<string, unknown>
}

const calls = (): Call[] =>
  fs
    .readFileSync(callsFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as Call)

const count = (name: string) => calls().filter(c => c.name === name).length
const publishCall = () => calls().find(c => c.name === 'feed_publish')
const settings = () =>
  (publishCall()?.args.template_settings || {}) as Record<string, unknown>
const poster = () => settings().poster as Record<string, unknown> | undefined
const publishedProps = () => (settings().props || {}) as Record<string, unknown>

function run(env: Record<string, string> = {}, plan: unknown = {}) {
  fs.writeFileSync(callsFile, '')
  fs.writeFileSync(planFile, JSON.stringify(plan))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'poster-loop-'))
  try {
    fs.writeFileSync(path.join(dir, 'topics.json'), JSON.stringify(TOPICS))
    // No --with-video: a fresh LOOP_DIR is post number one, so the paid
    // medallion slot is not in play and the only paid layer under test is the
    // engraving. No flag turns the engraving on either -- that is the point.
    return spawnSync(TSX, [SCRIPT], {
      cwd: HERE,
      encoding: 'utf8',
      timeout: 90_000,
      env: {
        ...process.env,
        AGENT_KEYS: 'test-key:1',
        LOOP_DIR: dir,
        SELF_URL: baseUrl,
        RENDER_API_KEY: 'test-render-key', // secret-guard-ok: literal test placeholder
        // Never a developer's own database, never a real channel token.
        DATABASE_URL: '',
        TELEGRAM_CHANNEL_BOT_TOKEN: '',
        TG_POST_BOT_TOKEN: '',
        TG_POST_MAX_PER_DAY: '0',
        AUTOPILOT_LOOP: '',
        AUTOPILOT_FACE: '',
        AUTOPILOT_PORTRAIT: 'off',
        ...env,
      },
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
  }
}

describe('the engraving layer is asked at all', () => {
  it('runs without any flag, because the flag WAS the outage', () => {
    /**
     * `--with-image` was passed by nothing: not the supervised child in
     * render-server.ts, not a crontab, not an npm script, not the Dockerfile.
     * A feature switched on nowhere is a deleted feature that still ships a
     * comment claiming it works.
     */
    run()
    expect(count('image_generate')).toBe(1)
  })

  it('can still be switched off, because it spends money', () => {
    run({ AUTOPILOT_IMAGE: '0' })
    expect(count('image_generate')).toBe(0)
    // And an unasked layer leaves NO record: a row published with the layer off
    // stays byte-identical to what this factory published before.
    expect(poster()).toBeUndefined()
  })
})

describe('what happened to the engraving reaches the published recipe', () => {
  it('a delivered poster records the provider that actually served', () => {
    run(
      {},
      {
        image: {
          сделано: true,
          url: POSTER,
          provider: 'kie/google/nano-banana',
          tried: [{ provider: 'fal/nano-banana-pro', error: 'User is locked' }],
        },
      }
    )
    expect(publishedProps().posterUrl).toBe(POSTER)
    expect(poster()).toMatchObject({
      state: 'delivered',
      provider: 'kie/google/nano-banana',
    })
    // The refusals survive into a SUCCESS: a poster that came from the third
    // leg cost real credits out of the purse the talking heads spend from, and
    // a reader who cannot see that cannot budget.
    expect((poster()!.tried as unknown[]) ?? []).toHaveLength(1)
  })

  it('A REFUSAL IS RECORDED, not swallowed -- the whole point', () => {
    run(
      {},
      {
        image: {
          сделано: false,
          причина: 'генерация не удалась: HTTP 500 no image provider delivered',
          tried: [
            { provider: 'fal/nano-banana-pro', error: 'User is locked' },
            { provider: 'replicate/flux-schnell', error: 'no token' },
            { provider: 'kie/google/nano-banana', error: 'Internal Error' },
          ],
        },
      }
    )
    const p = poster()
    expect(p, 'a refused engraving must leave a record').toBeDefined()
    expect(p!.state).toBe('refused')
    // The provider's own words, not a generic string invented here.
    expect(String(p!.reason)).toContain('no image provider delivered')
    expect((p!.tried as unknown[]) ?? []).toHaveLength(3)
  })

  it('a refusal does not abort the cycle: the post still ships', () => {
    run(
      {},
      {
        image: { сделано: false, причина: 'суточный лимит исчерпан' },
      }
    )
    /**
     * The day's post is the product. posterUrl is an optional prop and the
     * medallion falls back to the text engraving, so aborting here would turn a
     * cosmetic outage into a publishing outage -- and worse, this script is a
     * supervised child that respawns 60 s after every exit, so an uncaught
     * throw becomes a crash loop that also loses the channel delivery and the
     * topic cursor.
     */
    expect(count('reel_render')).toBe(1)
    expect(count('feed_publish')).toBe(1)
    expect(publishedProps().posterUrl).toBeUndefined()
    expect(poster()!.state).toBe('refused')
    expect(String(poster()!.reason)).toContain('суточный')
  })
})
