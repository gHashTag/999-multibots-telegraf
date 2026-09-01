import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('branding identity transport', () => {
  it('accepts Telegram initData only from headers, never from the URL', () => {
    const server = fs.readFileSync(
      path.join(__dirname, 'render-server.ts'),
      'utf8'
    )
    const start = server.indexOf("req.url?.split('?')[0] === '/branding'")
    const end = server.indexOf("req.url?.startsWith('/api/bot-avatar')", start)
    const route = server.slice(start, end)

    expect(start).toBeGreaterThan(-1)
    expect(route).toContain("req.headers['x-telegram-init-data']")
    expect(route).toContain("req.headers['x-telegram-initdata']")
    expect(route).not.toContain("searchParams.get('initData')")
  })
})
