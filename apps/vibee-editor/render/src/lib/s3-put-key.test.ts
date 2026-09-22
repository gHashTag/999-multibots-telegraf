import { describe, it, expect, vi, afterEach } from 'vitest'
import { assetKeyFor } from './s3-put'
import { shelfExtension } from './shelf-route'

/**
 * A SHELF KEY CANNOT BE GUESSED FROM WHAT IS KNOWN ABOUT THE FILE.
 *
 * The CRM ingest and tg_fetch_media store a client's attachment as
 * `file-<message id>.<ext>`, and `/s3/<key>` serves it to anyone holding the
 * link -- documents too, since the route stopped answering them with a 500.
 * A key made of a millisecond timestamp and a message id is a key someone can
 * walk; eight random bytes between them make the link the only way in.
 */

afterEach(() => {
  vi.restoreAllMocks()
})

describe('assetKeyFor', () => {
  it('the same name in the same millisecond gives two different keys, each with 16 random hex digits', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const a = assetKeyFor('file-12.pdf')
    const b = assetKeyFor('file-12.pdf')
    expect(a).not.toBe(b)
    for (const key of [a, b]) {
      expect(key).toMatch(/^assets\/1700000000000-[0-9a-f]{16}-file-12\.pdf$/)
    }
  })

  it('the extension stays last, so the route still types the file by it', () => {
    expect(shelfExtension(assetKeyFor('report.docx'))).toBe('docx')
    expect(shelfExtension(assetKeyFor('voice.ogg'))).toBe('ogg')
  })

  it('a name that sanitises to nothing still gets a random part', () => {
    const key = assetKeyFor('')
    expect(key).toMatch(/^assets\/\d+-[0-9a-f]{16}-file-\d+$/)
  })
})
