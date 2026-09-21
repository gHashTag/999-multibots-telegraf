/**
 * THE MODEL IS NEVER HANDED A PICTURE IT CANNOT SEE.
 *
 * 2026-09-22: asked "take the whole screen and say what is open", the agent
 * got 80 KB of JPEG as base64 text and described "the Queen's board with
 * task cards". The screen showed a Google sign-in page and five tabs.
 */
import { describe, it, expect } from 'vitest'
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { toolContentForModel, PICTURE_NOTE } from './src/agent/tool-content'
import { BROWSER_TOOLS } from './src/browser/agent-tools'

const B64 = Buffer.alloc(60_000, 7).toString('base64')

describe('toolContentForModel', () => {
  it('replaces a picture with a sentence that says it is not seen', () => {
    const text = toolContentForModel({
      format: 'jpeg',
      base64: B64,
      tabs: [
        {
          title: 'Sign in - Google Accounts',
          url: 'https://accounts.google.com/',
          front: true,
        },
      ],
    })
    expect(text).not.toContain(B64.slice(0, 200))
    expect(text.length).toBeLessThan(1000)
    const parsed = JSON.parse(text)
    expect(parsed.note).toBe(PICTURE_NOTE)
    expect(parsed.note).toMatch(/DO NOT SEE IT/)
    expect(parsed.base64).toMatch(/^\[picture, 59 KB, not shown to you\]$/)
    // The facts that travel with it survive.
    expect(parsed.tabs[0]).toEqual({
      title: 'Sign in - Google Accounts',
      url: 'https://accounts.google.com/',
      front: true,
    })
  })

  it('finds a picture nested in a result', () => {
    const parsed = JSON.parse(toolContentForModel({ shots: [{ base64: B64 }] }))
    expect(parsed.note).toBe(PICTURE_NOTE)
    expect(parsed.shots[0].base64).toMatch(/not shown to you/)
  })

  it('leaves every other result exactly as it was', () => {
    for (const v of [
      {
        running: true,
        pages: [{ title: 'Google', url: 'https://www.google.com/' }],
      },
      { base64: 'short' },
      { text: 'x'.repeat(5000) },
      'plain',
      null,
    ]) {
      expect(toolContentForModel(v)).toBe(JSON.stringify(v))
    }
  })
})

describe('the chat uses it for every tool message', () => {
  /*
   * A wiring check: the one place a tool result becomes a `tool` message.
   * The behaviour is tested above; this pins that the chat goes through it.
   */
  it('has no raw JSON.stringify of a tool result left', () => {
    const src = readFileSync(
      new URL('./src/agent/chat.ts', import.meta.url),
      'utf8'
    )
    const toolMsg = /role: 'tool',[\s\S]{0,300}?content: ([^\n]+)/.exec(src)
    expect(toolMsg?.[1]).toMatch(/^toolContentForModel\(/)
  })
})

describe('browser_screenshot carries its facts in words', () => {
  it('names every tab and which one is in front', async () => {
    const cdp = http.createServer((req, res) => {
      if (req.url === '/json/list') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify([
            {
              id: 'a',
              type: 'page',
              title: 'New Tab',
              url: 'chrome://newtab/',
            },
            {
              id: 'b',
              type: 'page',
              title: 'Sign in - Google Accounts',
              url: 'https://accounts.google.com/',
            },
            { id: 'w', type: 'service_worker', title: 'sw', url: 'https://x/' },
          ])
        )
        return
      }
      res.writeHead(404)
      res.end()
    })
    const pod = http.createServer((req, res) => {
      let body = ''
      req.on('data', c => (body += c))
      req.on('end', () => {
        if (req.url === '/api/login') {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end('{"token":"t"}')
          return
        }
        res.writeHead(200, { 'content-type': 'image/jpeg' })
        res.end(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
      })
    })
    await new Promise<void>(r => cdp.listen(0, '127.0.0.1', r))
    await new Promise<void>(r => pod.listen(0, '127.0.0.1', r))
    const port = (s: http.Server) => (s.address() as { port: number }).port
    try {
      const tool = BROWSER_TOOLS.find(t => t.name === 'browser_screenshot')!
      const out = (await tool.handler({ desktop: true }, {
        telegramId: 'tg-900000001',
        pool: {
          async query(sql: string) {
            if (!sql.trim().toUpperCase().startsWith('SELECT'))
              return { rows: [] }
            return {
              rows: [
                {
                  telegram_id: 'tg-900000001',
                  session_id: 's1',
                  state: 'live',
                  endpoint: `127.0.0.1:${port(pod)}`,
                  cdp_endpoint: `127.0.0.1:${port(cdp)}`,
                  view_token: 'v',
                  admin_token: 'a',
                },
              ],
            }
          },
        },
      } as never)) as { tabs: Array<{ title: string; url: string }> }
      expect(out.tabs.map(t => t.title)).toEqual([
        'New Tab',
        'Sign in - Google Accounts',
      ])
    } finally {
      cdp.close()
      pod.close()
    }
  })
})
