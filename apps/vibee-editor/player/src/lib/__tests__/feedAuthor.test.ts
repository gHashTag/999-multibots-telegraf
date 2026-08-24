// @vitest-environment node

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { feedAuthorProfilePath } from '../feedAuthor'

const feedCardSource = readFileSync(
  new URL('../../components/Panels/FeedCard.tsx', import.meta.url),
  'utf8'
)

describe('feed author profile links', () => {
  it('links to the server-returned username', () => {
    expect(feedAuthorProfilePath('t27_dev', '144022504')).toBe('/t27_dev')
  })

  it('falls back to the record owner id, never to the active client', () => {
    expect(feedAuthorProfilePath(undefined, '144022504')).toBe('/144022504')
  })

  it('wires the author link from server ownership fields', () => {
    expect(feedCardSource).toContain(
      'feedAuthorProfilePath(\n    template.creatorUsername,\n    template.telegramId'
    )
    expect(feedCardSource).toContain('to={authorProfilePath}')
    expect(feedCardSource).not.toMatch(/feedAuthorProfilePath\([^)]*user\??\./s)
  })
})
