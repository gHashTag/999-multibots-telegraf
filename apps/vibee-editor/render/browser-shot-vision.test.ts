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
import { describeShot, SCREEN_PROMPT } from './src/browser/agent-tools'
import { resetVisionForTests } from './src/agent/media-vision'

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
      const seen = await describeShot(SHOT)
      expect(seen).toMatch(/Страница входа Google/) // cyrillic-ok: the vision answer is Russian by design
      const [call] = v.got
      expect(call.auth).toBe('Bearer vk')
      const parts = call.body.messages[0].content
      expect(parts[0]).toEqual({ type: 'text', text: SCREEN_PROMPT })
      expect(parts[1].image_url.url).toBe(`data:image/jpeg;base64,${SHOT}`)
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
      expect(await describeShot(SHOT)).toBeNull()
    } finally {
      v.close()
    }
  })

  it('no endpoint configured gives null without asking anyone', async () => {
    delete process.env.VISION_API_KEY
    resetVisionForTests()
    expect(await describeShot(SHOT)).toBeNull()
  })
})
