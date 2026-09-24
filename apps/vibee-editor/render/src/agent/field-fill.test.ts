import { beforeEach, describe, expect, it } from 'vitest'
import {
  cleanFill,
  fillMessages,
  FILL_LIMIT,
  handleFieldFill,
  parseFillRequest,
  resetFillSlots,
  takeFillSlot,
} from './field-fill'

/**
 * "FILL WITH AI" FOR ONE FIELD.
 *
 * Pinned: a field that names a secret is refused on the SERVER too (a
 * browser-only filter is a filter devtools removes), a secret-looking
 * neighbour never reaches the model, the answer is a bare value, and the
 * budget holds.
 */
const body = (field: Record<string, unknown>, extra = {}) =>
  JSON.stringify({
    field: { label: 'About the project', multiline: true, ...field },
    context: {
      page: '/profile',
      title: 'Profile',
      siblings: [
        { label: 'Company', value: 'Quest studio' },
        { label: 'Password', value: 'hunter2' },
      ],
    },
    lang: 'en',
    ...extra,
  })

beforeEach(() => resetFillSlots())

describe('parseFillRequest', () => {
  it.each([
    'Password',
    'Пароль', // cyrillic-ok: a Russian label
    'Login',
    'E-mail',
    'Phone',
    'Confirmation code',
    'API key',
    'Card number',
  ])('refuses a field labelled %s', label => {
    expect(parseFillRequest(JSON.parse(body({ label })))).toBeNull()
  })

  it('does not mistake "keywords" for a key', () => {
    expect(
      parseFillRequest(JSON.parse(body({ label: 'Ключевые слова' }))) // cyrillic-ok
    ).not.toBeNull()
  })

  it('drops a secret-looking neighbour before the model sees it', () => {
    const q = parseFillRequest(JSON.parse(body({})))!
    expect(q.context.siblings).toEqual([
      { label: 'Company', value: 'Quest studio' },
    ])
    expect(JSON.stringify(fillMessages(q))).not.toContain('hunter2')
  })

  it('refuses a field with nothing to go on', () => {
    expect(parseFillRequest({ field: {} })).toBeNull()
  })
})

describe('cleanFill', () => {
  const one = parseFillRequest(
    JSON.parse(body({ label: 'Title', multiline: false, maxLength: 20 }))
  )!
  it('strips a preamble, quotes and newlines, and respects maxLength', () => {
    expect(
      cleanFill('Here is your title: "A very long title\nindeed yes"', one)
    ).toBe('A very long title in')
  })
})

describe('handleFieldFill', () => {
  it('returns the cleaned value from the model', async () => {
    const out = await handleFieldFill(
      body({}),
      '900000031',
      async () => '"Hi."'
    )
    expect(out).toEqual({ status: 200, body: { text: 'Hi.' } })
  })

  it('400 for a password field, and the model is never asked', async () => {
    let asked = false
    const out = await handleFieldFill(
      body({ label: 'Password' }),
      '900000031',
      async () => {
        asked = true
        return 'x'
      }
    )
    expect(out.status).toBe(400)
    expect(asked).toBe(false)
  })

  it('429 past the budget', async () => {
    for (let i = 0; i < FILL_LIMIT; i++)
      expect(takeFillSlot('900000032')).toBe(true)
    const out = await handleFieldFill(body({}), '900000032', async () => 'x')
    expect(out.status).toBe(429)
  })

  it('502 when no model answered', async () => {
    const out = await handleFieldFill(body({}), '900000033', async () => {
      throw new Error('all providers down')
    })
    expect(out.status).toBe(502)
  })
})
