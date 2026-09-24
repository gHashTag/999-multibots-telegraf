import { describe, expect, it } from 'vitest'
import { describeField, isFillable } from './aiFill'

/**
 * WHICH FIELDS GET "✨ AI".
 *
 * Pinned both ways: the fields where writing text is the point get it, and
 * every field that holds a secret, an account, a contact, a code, a number
 * or a search does not -- by type, by autocomplete, by its own words, or by
 * an explicit opt-out.
 */
const make = (html: string) => {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host.querySelector('input, textarea') as HTMLInputElement
}

describe('isFillable', () => {
  it.each([
    '<textarea placeholder="About your business"></textarea>',
    '<input placeholder="Post title">',
    '<label>Description <input type="text"></label>',
    '<input aria-label="Ключевые слова">', // cyrillic-ok: keywords, not a key
  ])('offers AI for %s', html => {
    expect(isFillable(make(html))).toBe(true)
  })

  it.each([
    '<input type="password" placeholder="Password">',
    '<input type="email">',
    '<input type="tel">',
    '<input type="number">',
    '<input type="search" placeholder="Find">',
    '<input autocomplete="username" placeholder="x">',
    '<input autocomplete="one-time-code" placeholder="x">',
    '<input placeholder="Login">',
    '<input placeholder="Пароль">', // cyrillic-ok: a password label
    '<input placeholder="Код из SMS">', // cyrillic-ok: an SMS code
    '<input placeholder="API key">',
    '<input placeholder="@username">',
    '<input inputmode="numeric" placeholder="Amount">',
    '<input placeholder="Notes" disabled>',
    '<input placeholder="Notes" readonly>',
    '<div data-ai="off"><textarea placeholder="Message the agent"></textarea></div>',
  ])('does not offer AI for %s', html => {
    expect(isFillable(make(html))).toBe(false)
  })

  it('data-ai="on" opts a field in past the words', () => {
    expect(
      isFillable(make('<input data-ai="on" placeholder="Search tags">'))
    ).toBe(true)
  })

  it('a field too narrow for a sentence gets nothing', () => {
    expect(isFillable(make('<input placeholder="Title">'), 60)).toBe(false)
  })
})

describe('describeField', () => {
  it('sends the neighbours worth reading, never a password beside it', () => {
    const host = document.createElement('div')
    host.innerHTML = `<form>
      <input name="company" placeholder="Company" value="Quest studio">
      <input type="password" placeholder="Password" value="hunter2">
      <textarea placeholder="About the project"></textarea>
    </form>`
    document.body.appendChild(host)
    const area = host.querySelector('textarea')!
    const p = describeField(area, 'en')
    expect(p.field).toMatchObject({
      placeholder: 'About the project',
      multiline: true,
    })
    expect(p.context.siblings).toEqual([
      { label: 'Company', value: 'Quest studio' },
    ])
    expect(JSON.stringify(p)).not.toContain('hunter2')
  })
})
