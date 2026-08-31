/**
 * THE TALKING PORTRAIT AS THE FACTORY ACTUALLY WIRES IT.
 *
 * WHY THIS SPAWNS THE SCRIPT. scripts/agent-autopilot.ts is in no tsconfig
 * include -- measured, `tsc --noEmit --listFilesOnly` lists 1845 files and zero
 * of them under scripts/ -- so `npm run typecheck` says nothing about the file
 * that does the whole wiring. talking-portrait.test.ts proves the money rules
 * of the MODULE; nothing there can tell you whether the autopilot ever calls
 * it, with what, or what it does with the answer. That gap is not theoretical:
 * AUTOPILOT_FACE shipped reading a variable production does not define and
 * every check stayed green, because a switch nobody can turn on and a switch
 * nobody has turned on look identical from outside.
 *
 * SO EVERY ASSERTION HERE IS A RECORDED REQUEST, NOT A LOG LINE. The stub
 * writes one JSON line per HTTP request it receives -- MCP tool calls, the
 * b-roll call, and every Kie route -- and the tests read compositionId, props
 * and template_settings out of that file. "The provider was never asked" is the
 * number 0, not the absence of a string in stdout.
 *
 * THE STUB IS A SEPARATE PROCESS, and that is not a style choice: the first
 * version of the neighbouring face test ran an http.Server inside the vitest
 * worker and deadlocked, because spawnSync blocks the worker's event loop and
 * the server could never answer the child it was waiting for.
 *
 * THE DOUBLE IS AS DUMB AS THE REAL THING. It answers with the shapes Kie
 * really returns -- `{code, data:{taskId}}`, `{data:{state, resultJson}}` where
 * resultJson is a STRING of JSON, a bare number for the credit balance -- and
 * decides nothing: what it will answer is written into a file by the test
 * before the run. Nothing reaches a network. DATABASE_URL and the channel
 * tokens are blanked explicitly so a developer's own environment cannot leak
 * into a run, and feed_publish is answered with a refusal so the cycle stops
 * before any delivery step.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync, spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HERE = __dirname
const TSX = path.join(HERE, 'node_modules/.bin/tsx')
const SCRIPT = 'scripts/agent-autopilot.ts'

const IMAGE = 'https://stub.invalid/portrait/owner.jpg'
const AUDIO = 'https://stub.invalid/voice/owner.mp3'
/** What the mirror hands back, and therefore what must reach avatarVideo. */
const MIRRORED = 'https://s3.invalid/portrait-mirrored.mp4'

const TOPICS = [
  {
    title: 'Tema ocheredi',
    subtitle: 'podpis',
    lesson: 'urok',
    tags: ['t27'],
    plates: [{ label: 'a', value: '1' }],
  },
]

/**
 * One process, one ndjson of everything it was asked, and a behaviour file it
 * re-reads on every request so a test can change Kie's answer without a
 * restart. Cyrillic keys are written as \u escapes on purpose: the repository
 * guard cannot strip a multi-line template literal, so a literal Russian key
 * here would be read as a Russian identifier in code.
 */
const STUB_SOURCE = `
const http = require('node:http')
const fs = require('node:fs')
const [, , portFile, callsFile, planFile] = process.argv
const plan = () => { try { return JSON.parse(fs.readFileSync(planFile, 'utf8')) } catch (e) { return {} } }
const note = (name, args) => fs.appendFileSync(callsFile, JSON.stringify({ name, args }) + '\\n')
const send = (res, obj, code) => {
  res.writeHead(code || 200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(obj))
}
const server = http.createServer((req, res) => {
  const url = req.url || ''
  const p = plan()
  if (url.startsWith('/api/blog')) return send(res, { items: [] })
  // The clip the mirror downloads. Bytes, so Buffer.length is non-zero.
  if (url.startsWith('/clip.mp4')) {
    note('GET /clip.mp4', {})
    res.writeHead(200, { 'Content-Type': 'video/mp4' })
    return res.end(Buffer.from('not really an mp4, but bytes'))
  }
  if (url.startsWith('/kie/chat/credit')) {
    note('kie:credit', {})
    return send(res, { code: 200, data: p.balance === undefined ? 6930 : p.balance })
  }
  if (url.startsWith('/kie/jobs/recordInfo')) {
    note('kie:recordInfo', {})
    const base = 'http://127.0.0.1:' + server.address().port
    return send(res, {
      code: 200,
      data: {
        state: p.jobState || 'success',
        resultJson: JSON.stringify({ resultUrls: [base + '/clip.mp4'] }),
        failMsg: p.failMsg || '',
      },
    })
  }
  let body = ''
  req.on('data', c => (body += c))
  req.on('end', () => {
    if (url.startsWith('/kie/jobs/createTask')) {
      note('kie:createTask', JSON.parse(body || '{}'))
      if (p.createTaskFails) {
        return send(res, { code: 501, msg: 'The model name you specified is not supported' })
      }
      return send(res, { code: 200, data: { taskId: 'stub-task-1' } })
    }
    if (url.startsWith('/upload')) {
      note('upload', { bytes: body.length })
      return send(res, { directUrl: ${JSON.stringify(MIRRORED)} })
    }
    if (url.startsWith('/api/generate/video')) {
      note('broll', {})
      return send(res, { success: true, url: 'https://stub.invalid/broll.mp4' })
    }
    let name = '', args = {}
    try { const j = JSON.parse(body); name = j.params.name; args = j.params.arguments || {} } catch (e) {}
    note(name, args)
    const result =
      name === 'feed_list' ? { '\\u0437\\u0430\\u043f\\u0438\\u0441\\u0438': [] } :
      name === 'image_generate' ? { '\\u0441\\u0434\\u0435\\u043b\\u0430\\u043d\\u043e': true, url: 'https://stub.invalid/poster.png' } :
      name === 'reel_render' ? { '\\u0433\\u043e\\u0442\\u043e\\u0432\\u043e': true, url: 'https://stub.invalid/reel.mp4' } :
      { '\\u043e\\u043f\\u0443\\u0431\\u043b\\u0438\\u043a\\u043e\\u0432\\u0430\\u043d\\u043e': false }
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
  stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portrait-stub-'))
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
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) {
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
const renderCall = () => calls().find(c => c.name === 'reel_render')
const publishCall = () => calls().find(c => c.name === 'feed_publish')
const renderProps = () =>
  (renderCall()?.args.props || {}) as Record<string, unknown>
const settings = () =>
  (publishCall()?.args.template_settings || {}) as Record<string, unknown>
const talking = () => settings().talking as Record<string, unknown> | undefined

/** The day the script itself will use, so a seeded ledger row lands on it. */
const today = () => new Date().toISOString().slice(0, 10)

/** Full env for one run, minus whatever the test overrides. */
function run(
  env: Record<string, string>,
  opts: { plan?: Record<string, unknown>; spend?: number } = {}
) {
  fs.writeFileSync(callsFile, '')
  fs.writeFileSync(planFile, JSON.stringify(opts.plan || {}))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portrait-loop-'))
  try {
    fs.writeFileSync(path.join(dir, 'topics.json'), JSON.stringify(TOPICS))
    if (opts.spend !== undefined) {
      fs.writeFileSync(
        path.join(dir, 'portrait-spend.json'),
        JSON.stringify([
          {
            id: 'seeded',
            day: today(),
            state: 'delivered',
            credits: opts.spend,
            at: new Date().toISOString(),
          },
        ])
      )
    }
    // --with-video: the paid medallion slot belongs to the last post of the
    // day, and a fresh LOOP_DIR is post number one. The flag is the same door
    // the owner uses by hand, not a test-only branch.
    const r = spawnSync(TSX, [SCRIPT, '--with-video'], {
      cwd: HERE,
      encoding: 'utf8',
      timeout: 90_000,
      env: {
        ...process.env,
        AGENT_KEYS: 'test-key:1',
        LOOP_DIR: dir,
        SELF_URL: baseUrl,
        RENDER_API_KEY: 'test-render-key', // secret-guard-ok: literal test placeholder
        // Never a developer's real database, never a real channel token.
        DATABASE_URL: '',
        TELEGRAM_CHANNEL_BOT_TOKEN: '',
        TG_POST_BOT_TOKEN: '',
        TG_POST_MAX_PER_DAY: '0',
        AUTOPILOT_LOOP: '',
        AUTOPILOT_FACE: '',
        // Every portrait variable the owner would set, so the ONLY difference
        // between the off run and the on run is the switch itself.
        AUTOPILOT_PORTRAIT_IMAGE: IMAGE,
        AUTOPILOT_PORTRAIT_AUDIO: AUDIO,
        AUTOPILOT_PORTRAIT_API: `${baseUrl}/kie`,
        KIE_AI_API_KEY: 'kie-test-key', // secret-guard-ok: literal test placeholder
        ...env,
      },
    })
    // Read the ledger BEFORE the finally deletes the directory. Returning a
    // lazy reader instead cost one red run: every row came back empty because
    // the file was already gone by the time the assertion asked for it.
    let spendRows: { state: string; credits: number }[] = []
    try {
      spendRows = JSON.parse(
        fs.readFileSync(path.join(dir, 'portrait-spend.json'), 'utf8')
      )
    } catch {
      spendRows = [] // no attempt was ever recorded, which is itself an answer
    }
    return { ...r, out: `${r.stdout || ''}${r.stderr || ''}`, spendRows }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
  }
}

describe('the switch off changes nothing', () => {
  it('a fully configured portrait is IGNORED without the switch', () => {
    // The strongest form of off-by-default: the still, the voice, the key and
    // the endpoint are all present and correct, and the provider is still
    // never asked a single question.
    const r = run({})
    expect(r.status).toBe(0)
    expect(count('kie:credit')).toBe(0)
    expect(count('kie:createTask')).toBe(0)
    expect(count('kie:recordInfo')).toBe(0)
  }, 60_000)

  it('the reel is the same one the factory published yesterday', () => {
    const r = run({})
    expect(r.status).toBe(0)
    expect(renderCall()?.args.compositionId).toBe('TrinityBlogReel')
    // The b-roll keeps the oval, silently, exactly as before.
    expect(count('broll')).toBe(1)
    expect(renderProps().avatarVideo).toBe('https://stub.invalid/broll.mp4')
    // No volume prop at all: the medallion must not start making noise the day
    // this feature merged.
    expect(renderProps().avatarVideoVolume).toBeUndefined()
  }, 60_000)

  it('the published recipe has no talking key and no ledger was written', () => {
    // A feed row published with the switch off must be byte-identical in shape
    // to what went out before, or every remix of it inherits a field the
    // renderer will not understand.
    const r = run({})
    expect(publishCall()).toBeTruthy()
    expect(settings().compositionId).toBe('TrinityBlogReel')
    expect('talking' in settings()).toBe(false)
    expect(r.spendRows).toEqual([])
  }, 60_000)

  it('the poster layer still runs: withImage is not dead code', () => {
    // The switch that turns the engraving on lives one screen above the
    // portrait branch, and an earlier edit deleted the call while keeping the
    // switch and its comment. Nothing typechecks this file, so only a run
    // notices.
    run({})
    expect(count('image_generate')).toBe(1)
    expect(renderProps().posterUrl).toBe('https://stub.invalid/poster.png')
  }, 60_000)
})

describe('the switch on with a broken provider still produces a reel', () => {
  it('a refused task publishes the engraving and says why in the recipe', () => {
    const r = run(
      { AUTOPILOT_PORTRAIT: 'on' },
      { plan: { createTaskFails: true } }
    )
    expect(r.status).toBe(0)
    // It really did try: the balance was read and the task was offered.
    expect(count('kie:createTask')).toBe(1)
    // And the reel exists anyway. This is the whole contract.
    expect(renderCall()?.args.compositionId).toBe('TrinityBlogReel')
    expect(publishCall()).toBeTruthy()
    expect(talking()?.state).toBe('refused')
    expect(String(talking()?.reason)).toContain('not supported')
    expect(talking()?.credits).toBe(0)
    expect(talking()?.model).toBe('veed/fabric-1')
  }, 60_000)

  it('a refusal that cost nothing still fills the oval with the b-roll', () => {
    // Turning the switch on must not make the channel WORSE than leaving it
    // off. The b-roll used to sit in an `else if` on the switch rather than on
    // the money, so a free refusal left an empty medallion.
    run({ AUTOPILOT_PORTRAIT: 'on' }, { plan: { createTaskFails: true } })
    expect(count('broll')).toBe(1)
    expect(renderProps().avatarVideo).toBe('https://stub.invalid/broll.mp4')
    expect(renderProps().avatarVideoVolume).toBeUndefined()
  }, 60_000)

  it('a provider that is not there at all is the same story', () => {
    // Not a refusal shape: nothing is listening on that port. The module must
    // still return a value rather than take the 30-minute cycle down with it.
    const r = run({
      AUTOPILOT_PORTRAIT: 'on',
      AUTOPILOT_PORTRAIT_API: 'http://127.0.0.1:9/kie',
    })
    expect(r.status).toBe(0)
    expect(talking()?.state).toBe('refused')
    expect(talking()?.credits).toBe(0)
    expect(renderCall()?.args.compositionId).toBe('TrinityBlogReel')
    expect(count('broll')).toBe(1)
  }, 60_000)

  it('a misconfigured switch refuses before the network and names the variable', () => {
    const r = run({
      AUTOPILOT_PORTRAIT: 'on',
      AUTOPILOT_PORTRAIT_AUDIO: '',
    })
    expect(r.status).toBe(0)
    expect(count('kie:credit')).toBe(0)
    expect(count('kie:createTask')).toBe(0)
    expect(String(talking()?.reason)).toContain('AUTOPILOT_PORTRAIT_AUDIO')
    expect(publishCall()).toBeTruthy()
  }, 60_000)
})

describe('the ceiling refuses', () => {
  it('a day that has spent its budget never reaches the provider', () => {
    // 144 credits = MAX_SECONDS x 18, the whole day. The next 6-second clip is
    // 108 more, so the sum cannot fit and nothing is offered to Kie.
    const r = run({ AUTOPILOT_PORTRAIT: 'on' }, { spend: 144 })
    expect(r.status).toBe(0)
    expect(count('kie:createTask')).toBe(0)
    expect(count('kie:credit')).toBe(0)
    expect(talking()?.state).toBe('refused')
    expect(String(talking()?.reason)).toContain('144')
    expect(talking()?.spentBefore).toBe(144)
    expect(talking()?.ceiling).toBe(144)
  }, 60_000)

  it('the refusal is logged where a person reads it, and the reel still ships', () => {
    const r = run({ AUTOPILOT_PORTRAIT: 'on' }, { spend: 144 })
    expect(r.out).toContain('144')
    expect(renderCall()?.args.compositionId).toBe('TrinityBlogReel')
    expect(count('broll')).toBe(1) // a ceiling refusal costs nothing, so: b-roll
  }, 60_000)

  it('an owner-set ceiling of zero is an off switch for the money alone', () => {
    const r = run({
      AUTOPILOT_PORTRAIT: 'on',
      AUTOPILOT_PORTRAIT_DAILY_CREDITS: '0',
    })
    expect(r.status).toBe(0)
    expect(count('kie:createTask')).toBe(0)
    expect(talking()?.ceiling).toBe(0)
  }, 60_000)

  it('the floor under the balance protects the tool customers pay for', () => {
    // image_edit draws on the same Kie balance. 2010 - 108 is below the
    // 2000-credit reserve, so the factory does not eat the product.
    const r = run({ AUTOPILOT_PORTRAIT: 'on' }, { plan: { balance: 2010 } })
    expect(r.status).toBe(0)
    expect(count('kie:credit')).toBe(1)
    expect(count('kie:createTask')).toBe(0)
    expect(String(talking()?.reason)).toContain('2000')
  }, 60_000)
})

describe('dry mode: the rehearsal that spends nothing', () => {
  it('prices the clip out loud and stops before the task', () => {
    const r = run({ AUTOPILOT_PORTRAIT: 'dry' })
    expect(r.status).toBe(0)
    expect(count('kie:credit')).toBe(1)
    expect(count('kie:createTask')).toBe(0)
    expect(talking()?.state).toBe('dry')
    expect(String(talking()?.reason)).toContain('108')
    expect(r.spendRows).toEqual([])
    expect(count('broll')).toBe(1)
  }, 60_000)
})

describe('a delivered portrait reaches the medallion, audibly', () => {
  it('the mirrored clip is the avatarVideo, at volume 1, with its length', () => {
    const r = run({ AUTOPILOT_PORTRAIT: 'on' })
    expect(r.status).toBe(0)
    expect(count('kie:createTask')).toBe(1)
    expect(count('upload')).toBe(1)
    // Not the provider's own link: that one expires and the feed row keeps it.
    expect(renderProps().avatarVideo).toBe(MIRRORED)
    // The prop that stops a talking face rendering in silence.
    expect(renderProps().avatarVideoVolume).toBe(1)
    expect(renderProps().avatarVideoSeconds).toBe(6)
    expect(talking()?.state).toBe('delivered')
    expect(talking()?.image).toBe(IMAGE)
    expect(talking()?.audio).toBe(AUDIO)
    // One paid layer for one oval: the b-roll must NOT also run.
    expect(count('broll')).toBe(0)
    const delivered = r.spendRows.filter(x => x.state === 'delivered')
    expect(delivered.length).toBe(1)
    expect(delivered[0].credits).toBeGreaterThan(0)
  }, 90_000)
})
