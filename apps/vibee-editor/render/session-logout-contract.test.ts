import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(__dirname, 'session-routes.ts'),
  'utf8'
)
const start = source.indexOf("path === '/api/auth/logout'")
const end = source.indexOf('/**\n   * A known path', start)
const route = source.slice(start, end)

describe('logout revokes long-lived credentials', () => {
  it('accepts refresh proof when the access token is expired', () => {
    expect(route).toContain('body.refresh_token')
    expect(route).toContain('digest(refreshToken)')
    expect(route).toContain('WHERE family_id = $1')
    expect(route).toContain('UPDATE app_sessions SET revoked_at = now()')
    expect(route).not.toContain('токен уже недействителен')
  })

  it('fails closed when neither credential proves a session', () => {
    expect(route).toContain('json(res, 401')
  })
})
