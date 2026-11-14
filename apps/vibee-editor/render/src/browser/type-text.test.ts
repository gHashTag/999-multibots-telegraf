/**
 * TWO ROADS FOR TYPING, ONE OF THEM CHEAP (see cdp.ts typeText).
 *
 * A plain <input>/<textarea> is filled in one CDP round-trip -- the value
 * setter plus one `input` event -- instead of one round-trip per character
 * (~230 ms each, edge sin1 -> render sfo). The per-character road stays for a
 * rich editor (X's composer is contenteditable), for a newline, and whenever
 * the one-hop set is ignored. These checks drive the real `typeWith`/`typeText`
 * with no pod: a tiny DOM shim runs the in-page expression against real
 * accessor prototypes, and a scripted `call` covers the one branch the shim
 * cannot stage (a plain field that swallows the set whole).
 */
import { describe, expect, it } from 'vitest'
import type { Call } from './cdp'
import { typeText, typeWith } from './cdp'

/* A value accessor on the prototype, so the page's
 * `Object.getOwnPropertyDescriptor(proto, 'value').set` finds a real setter. */
function fieldProto(): Record<string, unknown> {
  const proto: Record<string, unknown> = {}
  Object.defineProperty(proto, 'value', {
    get(this: { _value: string }) {
      return this._value
    },
    set(this: { _value: string }, v: unknown) {
      this._value = String(v)
    },
    configurable: true,
  })
  return proto
}

const INPUT_PROTO = fieldProto()
const TEXTAREA_PROTO = fieldProto()

/* A getter with no setter -- a frozen or polyfilled prototype. The page's
 * `Object.getOwnPropertyDescriptor(proto, 'value').set` is undefined here, so
 * the one-hop set must refuse rather than throw on `setter.call`. */
function getterOnlyProto(): Record<string, unknown> {
  const proto: Record<string, unknown> = {}
  Object.defineProperty(proto, 'value', {
    get(this: { _value: string }) {
      return this._value
    },
    configurable: true,
  })
  return proto
}

interface FakeEl {
  tagName: string
  isContentEditable: boolean
  readOnly: boolean
  disabled: boolean
  _value: string
  _on: Record<string, Array<(ev: { type: string }) => void>>
  addEventListener: (t: string, fn: (ev: { type: string }) => void) => void
  dispatchEvent: (ev: { type: string }) => void
}

function makeEl(
  tag: 'INPUT' | 'TEXTAREA' | 'DIV',
  opts: Partial<
    Pick<FakeEl, 'isContentEditable' | 'readOnly' | 'disabled' | '_value'>
  > = {},
  protoOverride?: Record<string, unknown>
): FakeEl {
  const proto =
    protoOverride ?? (tag === 'TEXTAREA' ? TEXTAREA_PROTO : INPUT_PROTO)
  const el = Object.create(tag === 'DIV' ? {} : proto) as FakeEl
  el.tagName = tag
  el.isContentEditable = opts.isContentEditable ?? false
  el.readOnly = opts.readOnly ?? false
  el.disabled = opts.disabled ?? false
  el._value = opts._value ?? ''
  el._on = {}
  el.addEventListener = (t, fn) => {
    ;(el._on[t] ??= []).push(fn)
  }
  el.dispatchEvent = ev => {
    for (const fn of el._on[ev.type] ?? []) fn(ev)
  }
  return el
}

class FakeEvent {
  type: string
  bubbles: boolean
  constructor(type: string, opts?: { bubbles?: boolean }) {
    this.type = type
    this.bubbles = Boolean(opts?.bubbles)
  }
}

interface Recorder {
  call: Call
  evals: number
  keys: string[]
  focused: FakeEl | null
  focus: (el: FakeEl | null) => void
}

/**
 * A `call` backed by the DOM shim. `Runtime.evaluate` runs the page's
 * expression against the focused element; `Input.dispatchKeyEvent` records the
 * character and appends it to the focused field (as a real keypress would, so
 * a fallback after a swallowed set is observable).
 */
function recorder(
  protos: {
    input?: Record<string, unknown>
    textarea?: Record<string, unknown>
  } = {}
): Recorder {
  const inputProto = protos.input ?? INPUT_PROTO
  const textareaProto = protos.textarea ?? TEXTAREA_PROTO
  const r: Recorder = {
    evals: 0,
    keys: [],
    focused: null,
    focus: el => {
      r.focused = el
    },
    call: async (method, params = {}) => {
      if (method === 'Runtime.evaluate') {
        r.evals += 1
        const run = new Function(
          'document',
          'window',
          'Event',
          `return (${String(params.expression)})`
        ) as (
          document: { activeElement: FakeEl | null },
          window: {
            HTMLInputElement: { prototype: unknown }
            HTMLTextAreaElement: { prototype: unknown }
          },
          Event: typeof FakeEvent
        ) => unknown
        const value = run(
          { activeElement: r.focused },
          {
            HTMLInputElement: { prototype: inputProto },
            HTMLTextAreaElement: { prototype: textareaProto },
          },
          FakeEvent
        )
        return { result: { value } }
      }
      if (method === 'Input.dispatchKeyEvent') {
        const ch = String(params.text)
        r.keys.push(ch)
        if (r.focused) r.focused._value += ch
        return {}
      }
      return {}
    },
  }
  return r
}

describe('typeWith: the fast road for a plain field', () => {
  it('fills an <input> in one round-trip, no key events', async () => {
    const r = recorder()
    const el = makeEl('INPUT')
    r.focus(el)
    await typeWith(r.call, 'hello world')
    expect(el._value).toBe('hello world')
    expect(r.evals).toBe(1)
    expect(r.keys).toEqual([])
  })

  it('appends to a <textarea> without touching the existing text', async () => {
    const r = recorder()
    const el = makeEl('TEXTAREA', { _value: 'one ' })
    r.focus(el)
    await typeWith(r.call, 'two')
    expect(el._value).toBe('one two')
    expect(r.keys).toEqual([])
  })

  it('fires one bubbling input event so frameworks see the change', async () => {
    const r = recorder()
    const el = makeEl('INPUT')
    r.focus(el)
    let seen = 0
    el.addEventListener('input', () => (seen += 1))
    await typeWith(r.call, 'abc')
    expect(seen).toBe(1)
  })
})

describe('typeWith: the per-character road where it is required', () => {
  it('a contenteditable editor (X composer) is typed character by character', async () => {
    const r = recorder()
    r.focus(makeEl('DIV', { isContentEditable: true }))
    await typeWith(r.call, 'hey')
    expect(r.evals).toBe(1) // one probe, found not-native
    expect(r.keys).toEqual(['h', 'e', 'y'])
  })

  it('a read-only input falls to keys', async () => {
    const r = recorder()
    r.focus(makeEl('INPUT', { readOnly: true }))
    await typeWith(r.call, 'ab')
    expect(r.keys).toEqual(['a', 'b'])
  })

  it('a disabled input falls to keys', async () => {
    const r = recorder()
    r.focus(makeEl('INPUT', { disabled: true }))
    await typeWith(r.call, 'ab')
    expect(r.keys).toEqual(['a', 'b'])
  })

  it('nothing focused falls to keys, never throws', async () => {
    const r = recorder()
    await typeWith(r.call, 'ab')
    expect(r.keys).toEqual(['a', 'b'])
  })
})

describe('typeWith: newlines stay on the key road', () => {
  it('text with a newline never takes the value set', async () => {
    const r = recorder()
    r.focus(makeEl('TEXTAREA'))
    await typeWith(r.call, 'a\nb')
    expect(r.evals).toBe(0)
    expect(r.keys).toEqual(['a', '\n', 'b'])
  })

  it('enterForNewline turns "\\n" into the Enter key "\\r"', async () => {
    const r = recorder()
    r.focus(makeEl('TEXTAREA'))
    await typeWith(r.call, 'a\nb', { enterForNewline: true })
    expect(r.evals).toBe(0)
    expect(r.keys).toEqual(['a', '\r', 'b'])
  })

  it('empty text does nothing at all', async () => {
    const r = recorder()
    r.focus(makeEl('INPUT'))
    await typeWith(r.call, '')
    expect(r.evals).toBe(0)
    expect(r.keys).toEqual([])
  })
})

describe('typeWith: a plain field that swallows the set', () => {
  it('falls back to keys only when the set grew nothing', async () => {
    const keys: string[] = []
    let evals = 0
    const call: Call = async (method, params = {}) => {
      if (method === 'Runtime.evaluate') {
        evals += 1
        return { result: { value: 'ignored' } }
      }
      keys.push(String(params.text))
      return {}
    }
    await typeWith(call, 'xy')
    expect(evals).toBe(1)
    expect(keys).toEqual(['x', 'y'])
  })

  it('does NOT double-type when the set reported ok', async () => {
    const keys: string[] = []
    const call: Call = async (method, params = {}) => {
      if (method === 'Runtime.evaluate') return { result: { value: 'ok' } }
      keys.push(String(params.text))
      return {}
    }
    await typeWith(call, 'xy')
    expect(keys).toEqual([])
  })

  it('a prototype with no value setter refuses the set and falls to keys', async () => {
    const noSetter = getterOnlyProto()
    const r = recorder({ input: noSetter })
    const el = makeEl('INPUT', {}, noSetter)
    r.focus(el)
    await typeWith(r.call, 'ab')
    /* The probe ran, found no usable setter, returned not-native: no throw,
     * and every character still arrived by key. */
    expect(r.evals).toBe(1)
    expect(r.keys).toEqual(['a', 'b'])
  })

  it('a maxlength field that clamps is ok, not a partial to retype', async () => {
    /* The browser drops the surplus exactly as it would for keystrokes, so the
     * set grew (0 < grew < len) and typeWith must not add the rest by key. */
    const keys: string[] = []
    const call: Call = async (method, params = {}) => {
      if (method === 'Runtime.evaluate') return { result: { value: 'ok' } }
      keys.push(String(params.text))
      return {}
    }
    await typeWith(call, 'hello world')
    expect(keys).toEqual([])
  })
})

describe('typeText: injectable page seam', () => {
  it('hands the attached call to typeWith', async () => {
    const r = recorder()
    const el = makeEl('INPUT')
    r.focus(el)
    let seenEndpoint = ''
    let seenTarget = ''
    const fakePage = async (
      endpoint: string,
      targetId: string,
      work: (call: Call) => Promise<unknown>
    ) => {
      seenEndpoint = endpoint
      seenTarget = targetId
      return (await work(r.call)) as void
    }
    await typeText(
      'ep',
      'tgt',
      'hi',
      {},
      fakePage as typeof import('./cdp').onPage
    )
    expect(seenEndpoint).toBe('ep')
    expect(seenTarget).toBe('tgt')
    expect(el._value).toBe('hi')
  })
})
