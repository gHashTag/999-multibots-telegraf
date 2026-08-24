import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('../../render-server.ts', import.meta.url),
  'utf8'
)

describe('profile ownership route source', () => {
  it('derives the current viewer from verified initData, not query ownership', () => {
    expect(source).toContain('const viewerTelegramId = verifiedTelegramId(req)')
    expect(source).not.toContain(
      "const viewerTelegramId = url.searchParams.get('user_id')"
    )
  })
})
