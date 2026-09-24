import { describe, it, expect } from 'vitest'
import { CASES } from './cases'
import { judge, report } from './run'
import { findProbe, foundOf } from '../find-target'

/*
 * The document the probe runs in, written by hand: enough of a DOM for
 * find-target, and every element gets a box so nothing is invisible. The id
 * of whatever it lands on is the answer.
 */
function pressIn(html: string, want: string): string | null {
  const els = [...html.matchAll(/<(\w+)([^>]*)>/g)].map(m => {
    const [, tag, attrsRaw] = m
    const attrs: Record<string, string> = {}
    for (const a of attrsRaw.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g))
      attrs[a[1]] = a[2]
    /* Bare attributes carry no value and still mean something: hidden. */
    for (const bare of attrsRaw.matchAll(/(?:^|\s)([a-z-]+)(?=\s|$)/g))
      if (!(bare[1] in attrs)) attrs[bare[1]] = ''
    const after = html.slice((m.index ?? 0) + m[0].length)
    const text = after.slice(
      0,
      after.indexOf('<') === -1 ? 0 : after.indexOf('<')
    )
    return { tag, attrs, text: text.trim() }
  })
  const node = (el: (typeof els)[number], i: number) => ({
    tagName: el.tag.toUpperCase(),
    id: el.attrs.id ?? '',
    type: el.attrs.type ?? '',
    innerText: el.text,
    textContent: el.text,
    value: undefined,
    getAttribute: (k: string) => el.attrs[k] ?? null,
    getBoundingClientRect: () => ({
      left: 0,
      top: i * 50,
      /* `hidden` in the markup means no box, as in a real page. */
      width: 'hidden' in el.attrs ? 0 : 300,
      height: 'hidden' in el.attrs ? 0 : 40,
    }),
    scrollIntoView: () => {},
  })
  const nodes = els.map(node)
  const matches = (el: (typeof els)[number], sel: string): boolean => {
    const m = /^([a-z]*)(?:\[([a-z-]+)(\*?=)?"?([^"\]]*)"?\])?$/.exec(
      sel.trim()
    )
    if (!m) return false
    const [, tag, attr, op, val] = m
    if (tag && tag !== el.tag) return false
    if (!attr) return Boolean(tag)
    const have = el.attrs[attr]
    if (have === undefined) return false
    if (!op) return true
    return op === '*=' ? have.includes(val) : have === val
  }
  const g = globalThis as Record<string, unknown>
  g.document = {
    querySelectorAll: (selector: string) =>
      nodes.filter((_, i) =>
        selector.split(',').some(sel => matches(els[i], sel))
      ),
  }
  g.getComputedStyle = () => ({
    visibility: 'visible',
    display: 'block',
    opacity: '1',
  })
  try {
    // eslint-disable-next-line no-eval
    const found = foundOf((0, eval)(findProbe(want)))
    if (!found) return null
    /* Which node sits at that y: the probe returns its centre. */
    const at = Math.round((found.y - 20) / 50)
    return nodes[at]?.id ?? null
  } finally {
    delete g.document
    delete g.getComputedStyle
  }
}

describe('the agent is measured on the one move it lives by', () => {
  it('scores the cases met in production', () => {
    const out = judge(CASES, pressIn)
    const missed = out.results.filter(r => !r.ok).map(r => r.want)
    expect(missed, `missed: ${missed.join(', ')}`).toEqual([])
    expect(out.score).toBe(100)
  })

  it('the report names every miss, so a drop is readable', () => {
    const text = report(
      judge(
        [
          {
            from: 'a case that must fail',
            html: '<button id="a">Post</button>',
            want: 'Post',
            expect: 'nope',
          },
        ],
        pressIn
      )
    )
    expect(text).toContain('MISS')
    expect(text).toContain('wanted nope')
    expect(text).toContain('score 0%')
  })
})
