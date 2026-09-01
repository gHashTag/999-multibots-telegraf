import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')
const start = source.indexOf('// PUT /api/users/:username')
const end = source.indexOf('// GET /api/users/:username', start)
const route = source.slice(start, end)

describe('profile update is owner-bound', () => {
  it('establishes server-verified identity before reading the body', () => {
    expect(start).toBeGreaterThan(-1)
    const identity = route.indexOf('chatIdentity(req, verifiedTelegramId(req))')
    expect(identity).toBeGreaterThan(-1)
    expect(identity).toBeLessThan(route.indexOf('await readBody(req)'))
  })

  it('updates by verified owner and route username, never a body id', () => {
    expect(route).toContain(
      'WHERE telegram_id = $1 AND LOWER(username) = LOWER($2)'
    )
    expect(route).not.toContain('body.telegram_id')
  })

  it('validates public flag, links, and URL-bearing fields', () => {
    expect(route).toContain("typeof body.is_public !== 'boolean'")
    expect(route).toContain("throw new Error('invalid social_links')")
    expect(route).toContain("throw new Error('invalid avatar_url')")
  })

  it('returns authoritative template counters after the update', () => {
    expect(route).toContain('COUNT(*) AS templates_count')
    expect(route).toContain('SUM(views_count)')
    expect(route).toContain('SUM(likes_count)')
    expect(route).not.toContain('templates_count: 0')
  })

  it('permits the browser PUT preflight', () => {
    expect(source).toContain("'GET, POST, PUT, DELETE, OPTIONS'")
  })
})
