import { describe, it, expect, afterEach } from 'vitest'
import { findProbe, foundOf } from './find-target'

/*
 * A page small enough to write by hand: the probe only asks the document
 * for elements by selector, their text and attributes, their box and their
 * computed style. No layout engine is needed to test which one it picks.
 */
interface El {
  tag: string
  attrs?: Record<string, string>
  text?: string
  box?: [number, number, number, number] // x, y, w, h
  /** Children drawn inside this element's open shadow root. */
  shadow?: El[]
}

function matches(el: El, sel: string): boolean {
  if (sel.trim() === '*') return true
  const a = el.attrs ?? {}
  const m = /^([a-z]*)(?:\[([a-z-]+)(\*?=)?"?([^"\]]*)"?\])?$/.exec(sel.trim())
  if (!m) return false
  const [, tag, attr, op, val] = m
  if (tag && tag !== el.tag) return false
  if (!attr) return Boolean(tag)
  if (!(attr in a)) return false
  if (!op) return true
  return op === '*=' ? a[attr].includes(val) : a[attr] === val
}

/* A root's querySelectorAll over its own elements, shadow trees not entered. */
interface Root {
  querySelectorAll: (selector: string) => unknown[]
}

function rootOf(els: El[]): Root {
  const nodes = els.map(el => {
    const [x, y, w, h] = el.box ?? [10, 10, 200, 40]
    return {
      el,
      /* A real element has one, and the probe asks for it. */
      tagName: el.tag.toUpperCase(),
      innerText: el.text ?? '',
      id: el.attrs?.id ?? '',
      type: el.attrs?.type ?? '',
      value: undefined,
      getAttribute: (k: string) => el.attrs?.[k] ?? null,
      getBoundingClientRect: () => ({ left: x, top: y, width: w, height: h }),
      scrollIntoView: () => {},
      shadowRoot: el.shadow ? rootOf(el.shadow) : null,
    }
  })
  return {
    querySelectorAll: (selector: string) =>
      nodes.filter(n => selector.split(',').some(s => matches(n.el, s))),
  }
}

function page(els: El[]) {
  const g = globalThis as Record<string, unknown>
  g.document = rootOf(els)
  g.getComputedStyle = () => ({
    visibility: 'visible',
    display: 'block',
    opacity: '1',
  })
}

function run(text: string) {
  // eslint-disable-next-line no-eval
  return foundOf((0, eval)(findProbe(text)))
}

const GSI = {
  tag: 'iframe',
  attrs: { src: 'https://accounts.google.com/gsi/button?x=1' },
  box: [0, 0, 200, 40] as [number, number, number, number],
}

afterEach(() => {
  const g = globalThis as Record<string, unknown>
  delete g.document
  delete g.getComputedStyle
})

describe('press by what it says', () => {
  it('a button saying "Continue with Google" beats a Google frame (X, 2026-09-22)', () => {
    page([
      GSI,
      { tag: 'button', text: 'Continue with Google', box: [100, 400, 300, 44] },
    ])
    const got = run('Continue with Google')
    expect(got?.how).toBe('text')
    expect(got?.y).toBe(422)
  })

  it('the Google frame beats a link that only mentions Google (LinkedIn)', () => {
    page([GSI, { tag: 'a', text: 'Google Privacy Policy' }])
    expect(run('google')?.how).toBe('google-frame')
  })

  it('a zero-size placeholder never matches', () => {
    page([{ tag: 'button', text: 'Sign in with Google', box: [0, 0, 0, 0] }])
    expect(run('Sign in with Google')).toBeNull()
  })

  it('the exact label beats a longer one', () => {
    page([
      { tag: 'button', text: 'Save and continue later', box: [0, 0, 200, 40] },
      { tag: 'button', text: 'Save', box: [0, 100, 200, 40] },
    ])
    expect(run('save')?.label).toBe('save')
  })

  it('falls back to links when no button says it', () => {
    page([{ tag: 'a', text: 'Use another account' }])
    expect(run('use another account')?.how).toBe('text')
  })

  it('a role=button element counts as a button', () => {
    page([
      GSI,
      { tag: 'div', attrs: { role: 'button' }, text: 'Continue with Google' },
    ])
    expect(run('continue with google')?.how).toBe('text')
  })

  it('finds a field by its placeholder (Apple, 2026-09-22)', () => {
    page([
      {
        tag: 'input',
        attrs: { type: 'text', placeholder: 'Email or Phone Number' },
        box: [120, 300, 460, 56],
      },
    ])
    const got = run('Email or Phone Number')
    expect(got?.how).toBe('field')
    expect(got?.y).toBe(328)
  })

  it('finds a field by its <label for>', () => {
    page([
      {
        tag: 'label',
        attrs: { for: 'pw' },
        text: 'Password',
        box: [0, 0, 0, 0],
      },
      { tag: 'input', attrs: { type: 'password', id: 'pw' } },
    ])
    expect(run('password')?.how).toBe('field')
  })

  it('a button still wins over a field that says the same', () => {
    page([
      { tag: 'input', attrs: { placeholder: 'Search' } },
      { tag: 'button', text: 'Search' },
    ])
    expect(run('search')?.how).toBe('text')
  })

  it('presses a button drawn inside a shadow root (Reddit submit, 2026-10-02)', () => {
    /*
     * The blog desk's live miss: the Publish button sat in
     * <r-post-form-submit-button>'s shadow root and the probe, reading only
     * the document, reported "button not found" with it on screen.
     */
    page([
      { tag: 'button', text: 'Сохранить черновик', box: [380, 570, 120, 44] }, // cyrillic-ok: Reddit's label
      {
        tag: 'r-post-form-submit-button',
        box: [640, 570, 100, 44],
        shadow: [
          { tag: 'button', text: 'Опубликовать', box: [640, 570, 100, 44] }, // cyrillic-ok: Reddit's label
        ],
      },
    ])
    const got = run('опубликовать') // cyrillic-ok: Reddit's label
    expect(got?.how).toBe('text')
    expect(got?.x).toBe(690)
    expect(got?.y).toBe(592)
  })

  it('the document still wins over a shadow root saying the same', () => {
    page([
      {
        tag: 'x-host',
        shadow: [{ tag: 'button', text: 'Post', box: [0, 300, 100, 40] }],
      },
      { tag: 'button', text: 'Post', box: [0, 100, 100, 40] },
    ])
    expect(run('post')?.y).toBe(120)
  })

  it('a shadow root inside a shadow root is entered too', () => {
    page([
      {
        tag: 'outer-host',
        shadow: [
          {
            tag: 'inner-host',
            shadow: [{ tag: 'button', text: 'Post', box: [0, 200, 100, 40] }],
          },
        ],
      },
    ])
    expect(run('post')?.y).toBe(220)
  })
})
