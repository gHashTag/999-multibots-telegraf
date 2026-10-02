import { describe, it, expect } from 'vitest'
import {
  ASSET_CODES,
  AssetsRefusal,
  assetsErrorText,
  assetsFailureText,
} from './assetsText'

/**
 * The avatar profile and the history used to show "HTTP 401 — {json}". These
 * pin what each reader sees instead.
 */
const body = (o: object) => JSON.stringify(o)
const RU = 'не удалось определить пользователя' // cyrillic-ok: a server reason

describe('assetsFailureText', () => {
  it('an English reader gets the sentence for a known code', () => {
    for (const [code, sentence] of Object.entries(ASSET_CODES))
      expect(assetsFailureText(400, body({ code, error: RU }), 'en')).toBe(
        sentence
      )
  })

  it('a Russian reader keeps the server words', () => {
    expect(
      assetsFailureText(401, body({ code: 'sign_in', error: RU }), 'ru')
    ).toBe(RU)
  })

  it('never shows the body: an unknown code in Russian gives the status', () => {
    const text = assetsFailureText(
      418,
      body({ code: 'new_one', error: RU }),
      'en'
    )
    expect(text).toBe("Couldn't reach your files (HTTP 418)")
    expect(text).not.toMatch(/[{}]/)
  })

  it('an English server reason with no code is shown as is', () => {
    expect(
      assetsFailureText(500, body({ error: 'Failed to fetch assets' }), 'en')
    ).toBe('Failed to fetch assets')
  })

  it('a body that is not JSON is not shown, in either language', () => {
    const html = '<html>502 Bad Gateway</html>'
    expect(assetsFailureText(502, html, 'en')).toBe(
      "Couldn't reach your files (HTTP 502)"
    )
    expect(assetsFailureText(502, html, 'ru')).toContain('HTTP 502')
    expect(assetsFailureText(502, html, 'ru')).not.toContain('<html>')
  })
})

describe('assetsErrorText', () => {
  it('shows a worded refusal as it is', () => {
    expect(assetsErrorText(new AssetsRefusal('Worded'), 'en')).toBe('Worded')
  })

  it('a dropped connection still goes through the shared wording', () => {
    const text = assetsErrorText(new TypeError('Failed to fetch'), 'en')
    expect(text).toMatch(/network/i)
  })
})
