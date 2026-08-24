import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const scraperSource = readFileSync(
  new URL(
    '../../inngest_app/functions/instagram/instagramScraper-v2.ts',
    import.meta.url
  ),
  'utf8'
)

const composeSource = readFileSync(
  new URL('../../../docker-compose.test.yml', import.meta.url),
  'utf8'
)

const credentialedDatabaseUrl = new RegExp(
  String.raw`(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/` +
    String.raw`[^:\s/$<{]+:[^@\s$<{]+@`,
  'i'
)

describe('Instagram database configuration', () => {
  it('constructs the pool lazily and fails closed without NEON_DATABASE_URL', () => {
    const factoryIndex = scraperSource.indexOf('export function getDbPool()')
    const constructionIndex = scraperSource.indexOf('new Pool(')

    expect(factoryIndex).toBeGreaterThan(-1)
    expect(constructionIndex).toBeGreaterThan(factoryIndex)
    expect(scraperSource.slice(0, factoryIndex)).not.toContain('new Pool(')
    expect(scraperSource).toContain(
      'const connectionString = process.env.NEON_DATABASE_URL?.trim()'
    )
    expect(scraperSource).toContain(
      "throw new Error('NEON_DATABASE_URL is required')"
    )
    expect(scraperSource.match(/getDbPool\(\)\.connect\(\)/g)).toHaveLength(4)
    expect(scraperSource).not.toMatch(/\bdbPool\.connect\(\)/)
  })

  it('contains no credentialed database literal in source or test Compose', () => {
    expect(scraperSource).not.toMatch(credentialedDatabaseUrl)
    expect(composeSource).not.toMatch(credentialedDatabaseUrl)
    expect(composeSource).toContain(
      'POSTGRES_PASSWORD: ${TEST_POSTGRES_PASSWORD:-test_password}'
    )
    expect(composeSource).toContain(
      'DATABASE_URL: postgresql://${TEST_POSTGRES_USER:-test_user}:' +
        '${TEST_POSTGRES_PASSWORD:-test_password}@test-db:5432/' +
        '${TEST_POSTGRES_DB:-test_db}'
    )
  })
})
