/**
 * A SCREENSHOT COMES WITH WORDS FROM SOMETHING THAT SAW IT.
 *
 * The chat model cannot see images; our vision endpoint (Qwen3-VL behind an
 * OpenAI-compatible /chat/completions) can. describeShot sends the shot and
 * returns its description; anything short of a clean answer is null, never
 * a guess. Driven against a real HTTP server standing in for the endpoint.
 */
import { describe, it, expect, afterEach } from 'vitest'
import http from 'node:http'
import {
  describeShot,
  resetSeenCacheForTests,
  SCREEN_PROMPT,
  SCREEN_MAX_TOKENS,
} from './src/browser/agent-tools'
import { resetVisionForTests, shrinkJpeg } from './src/agent/media-vision'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const SHOT = Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')

async function fakeVision(answer: (res: http.ServerResponse) => void) {
  const got: Array<{ auth?: string; body: any }> = []
  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => (raw += c))
    req.on('end', () => {
      got.push({
        auth: req.headers.authorization,
        body: JSON.parse(raw || '{}'),
      })
      answer(res)
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
  return { base, got, close: () => server.close() }
}

const saved = { ...process.env }
afterEach(() => {
  process.env = { ...saved }
  resetVisionForTests()
  resetSeenCacheForTests()
})

describe('describeShot', () => {
  it('sends the shot with the screen prompt and returns what was seen', async () => {
    const v = await fakeVision(res => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  'Страница входа Google, поле «Email or phone», кнопка Next.',
              },
            },
          ],
        })
      )
    })
    process.env.VISION_API_KEY = 'vk'
    process.env.VISION_BASE_URL = v.base
    resetVisionForTests()
    try {
      const { seen } = await describeShot(SHOT)
      expect(seen).toMatch(/Страница входа Google/) // cyrillic-ok: the vision answer is Russian by design
      const [call] = v.got
      expect(call.auth).toBe('Bearer vk')
      const parts = call.body.messages[0].content
      expect(parts[0]).toEqual({ type: 'text', text: SCREEN_PROMPT })
      expect(parts[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/)
      expect(call.body.max_tokens).toBe(SCREEN_MAX_TOKENS)
    } finally {
      v.close()
    }
  })

  it('a refusing endpoint gives null, not a guess', async () => {
    const v = await fakeVision(res => {
      res.writeHead(503)
      res.end('busy')
    })
    process.env.VISION_API_KEY = 'vk'
    process.env.VISION_BASE_URL = v.base
    resetVisionForTests()
    try {
      expect(await describeShot(SHOT)).toEqual({ seen: null })
    } finally {
      v.close()
    }
  })

  it('no endpoint configured gives null without asking anyone', async () => {
    delete process.env.VISION_API_KEY
    resetVisionForTests()
    expect(await describeShot(SHOT)).toEqual({ seen: null })
  })
})

/*
 * Measured: a full 1240x568 screenshot was at 9 % of prompt processing after
 * 41 s on the CPU service. It goes out at the video frames' 448 px bound.
 */
describe('shrinkJpeg', () => {
  const hasFfmpeg = (() => {
    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })()

  it.skipIf(!hasFfmpeg)(
    'a 1240x568 screen comes out 448 px on its longest side',
    async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'shrink-'))
      try {
        const src = path.join(dir, 'screen.jpg')
        execFileSync('ffmpeg', [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc=size=1240x568',
          '-frames:v',
          '1',
          src,
        ])
        const out = await shrinkJpeg(readFileSync(src))
        const probe = path.join(dir, 'out.jpg')
        require('node:fs').writeFileSync(probe, out)
        const dims = execFileSync(
          'ffprobe',
          [
            '-v',
            'error',
            '-select_streams',
            'v:0',
            '-show_entries',
            'stream=width,height',
            '-of',
            'csv=p=0',
            probe,
          ],
          { encoding: 'utf8' }
        ).trim()
        expect(dims).toBe('448,206')
        expect(out.length).toBeLessThan(readFileSync(src).length)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  )

  it('bytes ffmpeg cannot read come back untouched', async () => {
    const junk = Buffer.from('not a picture')
    expect(await shrinkJpeg(junk)).toEqual(junk)
  })
})

/*
 * The one-slot CPU service can take longer than a person should wait. The
 * turn gets "pending"; the description lands in a cache keyed by the image,
 * and the next shot of the same screen has it without a second request.
 */
describe('a slow description does not hold the turn', () => {
  it('pending first, then the same screen is described from the cache', async () => {
    const v = await fakeVision(res => {
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            choices: [{ message: { content: 'Google sign-in page' } }],
          })
        )
      }, 300)
    })
    process.env.VISION_API_KEY = 'vk'
    process.env.VISION_BASE_URL = v.base
    resetVisionForTests()
    try {
      expect(await describeShot(SHOT, 50)).toEqual({
        seen: null,
        seenPending: true,
      })
      await new Promise(r => setTimeout(r, 450))
      expect(await describeShot(SHOT, 50)).toEqual({
        seen: 'Google sign-in page',
      })
      expect(v.got).toHaveLength(1)
    } finally {
      v.close()
    }
  })

  it('two shots of one screen at once ask the service once', async () => {
    const v = await fakeVision(res => {
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ choices: [{ message: { content: 'same' } }] }))
      }, 100)
    })
    process.env.VISION_API_KEY = 'vk'
    process.env.VISION_BASE_URL = v.base
    resetVisionForTests()
    try {
      const [a, b] = await Promise.all([
        describeShot(SHOT, 1000),
        describeShot(SHOT, 1000),
      ])
      expect(a).toEqual({ seen: 'same' })
      expect(b).toEqual({ seen: 'same' })
      expect(v.got).toHaveLength(1)
    } finally {
      v.close()
    }
  })

  it('a refusal is not remembered: the next shot asks again', async () => {
    let calls = 0
    const v = await fakeVision(res => {
      calls++
      if (calls === 1) {
        res.writeHead(503)
        res.end('busy')
        return
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ choices: [{ message: { content: 'now' } }] }))
    })
    process.env.VISION_API_KEY = 'vk'
    process.env.VISION_BASE_URL = v.base
    resetVisionForTests()
    try {
      expect(await describeShot(SHOT)).toEqual({ seen: null })
      expect(await describeShot(SHOT)).toEqual({ seen: 'now' })
    } finally {
      v.close()
    }
  })
})
