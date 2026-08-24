// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('../../../api-server.js', import.meta.url),
  'utf8'
)

describe('legacy API SAFE BETA artifact', () => {
  it('requires a runtime database URL and contains no credentialed DSN', () => {
    expect(source).toContain('const databaseUrl = process.env.DATABASE_URL')
    expect(source).toContain("throw new Error('DATABASE_URL is required')")
    expect(source).not.toMatch(
      /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^:\s/$<{]+:[^@\s$<{]+@/i
    )
  })

  it('is immutable read-only before route dispatch', () => {
    expect(source).toContain('const SAFE_BETA_LOCKED = true')
    expect(source.indexOf('SAFE_BETA_READ_ONLY')).toBeLessThan(
      source.indexOf("app.get('/api/feed'")
    )
    expect(source).not.toMatch(/app\.(post|put|patch|delete)\s*\(/)
    expect(source).not.toContain('express.json()')
  })
})
