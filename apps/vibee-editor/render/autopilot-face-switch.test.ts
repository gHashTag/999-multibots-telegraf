/**
 * THE FACE SWITCH, MEASURED BY WHAT THE AUTOPILOT ACTUALLY ASKS FOR.
 *
 * WHY THIS SPAWNS THE SCRIPT INSTEAD OF IMPORTING A FUNCTION. Nothing under
 * scripts/ is in any tsconfig include, so `npm run typecheck` says nothing
 * about that file -- which is exactly how a transform error once made the whole
 * factory unrunnable for 51 hours while every check stayed green. The only
 * honest way to know what the autopilot sends is to run it and read the
 * request. The neighbouring autopilot-startable.test.ts spawns it for the same
 * reason.
 *
 * WHAT IS ASSERTED. Not a log line: the BODY of the reel_render call. A log
 * saying "rendering SplitTalkingHead" would still be green if the composition
 * id never reached the request. The stub records every MCP call to a file and
 * the tests read compositionId and props out of it.
 *
 * WHY THE STUB IS A SEPARATE PROCESS. The first version ran an http.Server
 * inside the vitest worker and deadlocked: spawnSync blocks that worker's event
 * loop, so the server could not answer the child it was waiting for. Each run
 * then sat until the 60-second kill. The stub therefore lives in its own
 * process, and the tests talk to it through two files.
 *
 * NOTHING LEAVES THIS MACHINE. The stub listens on 127.0.0.1, feed_publish is
 * answered with a refusal so the cycle stops before any channel step, one-shot
 * mode never calls channelTick at all, and the Telegram variables are blanked
 * explicitly rather than inherited from the developer's environment.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync, spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const HERE = __dirname
const TSX = path.join(HERE, 'node_modules/.bin/tsx')
const SCRIPT = 'scripts/agent-autopilot.ts'

const CLIP = 'https://app.t27.ai/lipsync/lipsync.mp4'
const BROLL = 'https://app.t27.ai/backgrounds/business/bg00.mp4'

const VALID_SOURCE = {
  title: 'Вайби: цифровой клон',
  description: 'Двадцать шесть секунд лица и голоса.',
  lipSyncVideo: CLIP,
  bRolls: [BROLL],
  durationSeconds: 25.92,
  captions: [
    { text: 'Меня', startMs: 110, endMs: 270 },
    { text: 'зовут', startMs: 270, endMs: 610 },
  ],
}

const TOPICS = [
  {
    title: 'Тема очереди',
    subtitle: 'подпись',
    lesson: 'урок',
    tags: ['t27'],
    plates: [{ label: 'a', value: '1' }],
  },
]

/** One JSON line per MCP call, so the parent can read it after spawnSync. */
const STUB_SOURCE = `
const http = require('node:http')
const fs = require('node:fs')
const [, , portFile, callsFile] = process.argv
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/blog')) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ items: [] }))
  }
  let body = ''
  req.on('data', c => (body += c))
  req.on('end', () => {
    let name = '', args = {}
    try { const p = JSON.parse(body); name = p.params.name; args = p.params.arguments || {} } catch (e) {}
    fs.appendFileSync(callsFile, JSON.stringify({ name, args }) + '\\n')
    const result =
      name === 'feed_list' ? { '\\u0437\\u0430\\u043f\\u0438\\u0441\\u0438': [] } :
      name === 'reel_render' ? { '\\u0433\\u043e\\u0442\\u043e\\u0432\\u043e': true, url: 'https://stub.invalid/reel.mp4' } :
      { '\\u043e\\u043f\\u0443\\u0431\\u043b\\u0438\\u043a\\u043e\\u0432\\u0430\\u043d\\u043e': false }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { structuredContent: result } }))
  })
})
server.listen(0, '127.0.0.1', () => fs.writeFileSync(portFile, String(server.address().port)))
`

let stub: ChildProcess
let stubDir = ''
let callsFile = ''
let baseUrl = ''

beforeAll(async () => {
  stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-face-stub-'))
  const stubFile = path.join(stubDir, 'stub.cjs')
  const portFile = path.join(stubDir, 'port')
  callsFile = path.join(stubDir, 'calls.ndjson')
  fs.writeFileSync(stubFile, STUB_SOURCE)
  fs.writeFileSync(callsFile, '')
  stub = spawn(process.execPath, [stubFile, portFile, callsFile], {
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

interface McpCall {
  name: string
  args: Record<string, unknown>
}

function calls(): McpCall[] {
  return fs
    .readFileSync(callsFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as McpCall)
}

function run(env: Record<string, string>, faceSource?: unknown) {
  fs.writeFileSync(callsFile, '')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-face-'))
  try {
    fs.writeFileSync(path.join(dir, 'topics.json'), JSON.stringify(TOPICS))
    if (faceSource !== undefined) {
      fs.writeFileSync(
        path.join(dir, 'face-source.json'),
        typeof faceSource === 'string' ? faceSource : JSON.stringify(faceSource)
      )
    }
    const r = spawnSync(TSX, [SCRIPT], {
      cwd: HERE,
      encoding: 'utf8',
      timeout: 60_000,
      env: {
        ...process.env,
        AGENT_KEYS: 'test-key:1',
        LOOP_DIR: dir,
        SELF_URL: baseUrl,
        // Never touch a developer's real database, and never let a real
        // channel token be inherited into a test run.
        DATABASE_URL: '',
        TELEGRAM_CHANNEL_BOT_TOKEN: '',
        TG_POST_BOT_TOKEN: '',
        TG_POST_MAX_PER_DAY: '0',
        AUTOPILOT_LOOP: '',
        ...env,
      },
    })
    return { ...r, out: `${r.stdout || ''}${r.stderr || ''}` }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 })
  }
}

const renderCall = () => calls().find(c => c.name === 'reel_render')

describe('the face switch is off unless it is turned on', () => {
  it('a perfectly good face source is IGNORED without the switch', () => {
    // The strongest form of "off by default": the media is there, valid, and
    // still nothing about it reaches the render request.
    const r = run({}, VALID_SOURCE)
    expect(r.status).toBe(0)
    expect(renderCall()?.args.compositionId).toBe('TrinityBlogReel')
    expect(r.out).not.toContain('--face')
  }, 30_000)

  it('with the switch on, the request carries SplitTalkingHead', () => {
    const r = run({ AUTOPILOT_FACE: '1' }, VALID_SOURCE)
    expect(r.status).toBe(0)
    expect(renderCall()?.args.compositionId).toBe('SplitTalkingHead')
  }, 30_000)

  it('the props it sends are the validated ones, in frames', () => {
    run({ AUTOPILOT_FACE: '1' }, VALID_SOURCE)
    const props = renderCall()?.args.props as Record<string, unknown>
    expect(props.lipSyncVideo).toBe(CLIP)
    const segments = props.segments as { startFrame: number; type: string }[]
    expect(segments.length).toBeGreaterThan(1)
    expect(segments[0]).toMatchObject({ type: 'split', bRollUrl: BROLL })
    // Frames, not seconds. Sending seconds under this key is what emptied the
    // b-roll layer of the one face reel this factory ever published.
    expect(segments[1].startFrame).toBe(6 * 30)
    expect((props.captions as unknown[]).length).toBe(2)
  }, 30_000)

  it('it publishes under the source title, not under the queued topic', () => {
    // Otherwise the same fixed clip would go out again and again wearing a new
    // topic's name, and the dedupe that caps it would never match.
    run({ AUTOPILOT_FACE: '1' }, VALID_SOURCE)
    const pub = calls().find(c => c.name === 'feed_publish')
    expect(pub?.args.name).toBe(VALID_SOURCE.title)
    expect(String(pub?.args.description)).toContain(VALID_SOURCE.description)
  }, 30_000)
})

describe('a face source that cannot be used is refused out loud', () => {
  it('a missing file: names the owner and falls back to the engraving', () => {
    const r = run({ AUTOPILOT_FACE: '1' })
    expect(r.status).toBe(0)
    expect(r.out).toContain('владелец')
    expect(renderCall()?.args.compositionId).toBe('TrinityBlogReel')
  }, 30_000)

  it('bare-string captions: every reason is printed, cycle still finishes', () => {
    const r = run(
      { AUTOPILOT_FACE: '1' },
      { ...VALID_SOURCE, captions: ['52', 'теоремы'] }
    )
    expect(r.status).toBe(0)
    expect(r.out).toContain('{text,startMs,endMs}')
    expect(r.out).toContain('голая строка')
    expect(renderCall()?.args.compositionId).toBe('TrinityBlogReel')
  }, 30_000)

  it('a relative clip path is refused, not silently rendered as a 404', () => {
    const r = run(
      { AUTOPILOT_FACE: '1' },
      { ...VALID_SOURCE, lipSyncVideo: '/lipsync/lipsync.mp4' }
    )
    expect(r.out).toContain('staticFile')
    expect(renderCall()?.args.compositionId).toBe('TrinityBlogReel')
  }, 30_000)

  it('unparsable JSON does not stop the factory', () => {
    const r = run({ AUTOPILOT_FACE: '1' }, '{ not json at all')
    expect(r.status).toBe(0)
    expect(r.out).toContain('JSON')
    expect(renderCall()?.args.compositionId).toBe('TrinityBlogReel')
  }, 30_000)
})
