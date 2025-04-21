import { urlJoin } from '../../src/utils/url'

describe('urlJoin', () => {
  it('joins base URL and paths without extra slashes', () => {
    expect(urlJoin('http://example.com', 'a', 'b')).toBe(
      'http://example.com/a/b'
    )
    expect(urlJoin('http://example.com/', '/a/', '/b/')).toBe(
      'http://example.com/a/b'
    )
  })

  it('returns base URL when no paths provided', () => {
    expect(urlJoin('http://example.com/')).toBe('http://example.com')
    expect(urlJoin('http://example.com')).toBe('http://example.com')
  })

  it('skips empty or falsy segments', () => {
    expect(
      urlJoin('http://example.com', '', 'c', null as any, undefined as any)
    ).toBe('http://example.com/c')
  })
})
