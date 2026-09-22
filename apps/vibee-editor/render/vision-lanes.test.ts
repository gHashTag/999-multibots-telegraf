/**
 * TWO LANES, ONE SLOT: a person waiting goes first.
 *
 * The vision service has one CPU slot, shared with the media sweep. A live
 * ask (a screenshot, a photo someone is waiting on) aborts the background
 * ask in flight and holds new ones; the aborted one says VisionPreempted,
 * so its row stays pending instead of falling back or losing its frames.
 * Driven against a real HTTP server that answers slowly and records the
 * order it was asked in, and which asks were cut off.
 */
import { describe, it, expect } from 'vitest'
import http from 'node:http'
import { askVision, VisionPreempted } from './src/agent/media-vision'

/** Wait for a condition instead of a fixed delay: a loaded runner is slow. */
async function until(ok: () => boolean, ms = 3000) {
  const end = Date.now() + ms
  while (!ok()) {
    if (Date.now() > end) throw new Error('condition not met in time')
    await new Promise(r => setTimeout(r, 5))
  }
}

async function slowVision(delayMs: number) {
  const order: string[] = []
  const cut: string[] = []
  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', c => (raw += c))
    req.on('end', () => {
      const prompt = JSON.parse(raw).messages[0].content[0].text as string
      order.push(prompt)
      let done = false
      res.on('close', () => {
        if (!done) cut.push(prompt)
      })
      setTimeout(() => {
        done = true
        if (res.writableEnded || res.destroyed) return
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            choices: [{ message: { content: `answer to ${prompt}` } }],
          })
        )
      }, delayMs)
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const v = {
    base: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
    key: 'k',
    model: 'm',
  }
  return { v, order, cut, close: () => server.close() }
}

describe('vision lanes', () => {
  it('a live ask cuts off the background one, which gives way rather than fails', async () => {
    const s = await slowVision(300)
    try {
      // Caught at once: it rejects while the live ask is still running.
      const background = askVision(
        s.v,
        'clip',
        ['data:image/jpeg;base64,AA'],
        5000
      ).catch(e => e)
      await new Promise(r => setTimeout(r, 50))
      const live = await askVision(
        s.v,
        'screen',
        ['data:image/jpeg;base64,AA'],
        5000,
        undefined,
        'live'
      )
      expect(live).toBe('answer to screen')
      expect(await background).toBeInstanceOf(VisionPreempted)
      await until(() => s.cut.length > 0)
      expect(s.cut).toEqual(['clip'])
    } finally {
      s.close()
    }
  })

  it('a background ask that arrives during a live one waits for it', async () => {
    const s = await slowVision(200)
    try {
      const live = askVision(s.v, 'screen', ['x'], 5000, undefined, 'live')
      await until(() => s.order.includes('screen'))
      const background = askVision(s.v, 'clip', ['x'], 5000)
      // Held at the gate while the live ask runs (200 ms): nothing new arrives.
      await new Promise(r => setTimeout(r, 60))
      expect(s.order).toEqual(['screen'])
      expect(await live).toBe('answer to screen')
      expect(await background).toBe('answer to clip')
      expect(s.order).toEqual(['screen', 'clip'])
    } finally {
      s.close()
    }
  })

  it('an ordinary refusal is still an ordinary error, not "gave way"', async () => {
    const server = http.createServer((_req, res) => {
      res.writeHead(503)
      res.end('busy')
    })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const v = {
      base: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
      key: 'k',
      model: 'm',
    }
    try {
      const e = await askVision(v, 'clip', ['x'], 5000).catch(err => err)
      expect(e).toBeInstanceOf(Error)
      expect(e).not.toBeInstanceOf(VisionPreempted)
      expect(String(e)).toMatch(/503/)
    } finally {
      server.close()
    }
  })
})
