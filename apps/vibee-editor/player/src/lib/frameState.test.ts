import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  frameStateOf,
  shouldReread,
  WINDOW_EVENT,
  touchReportOf,
} from './frameState'

const ORIGIN = 'https://app.t27.ai'
const frame = {}
const ev = (
  over: Partial<{ origin: string; source: unknown; data: unknown }> = {}
) => ({
  origin: ORIGIN,
  source: frame,
  data: { source: WINDOW_EVENT, state: 'reconnecting', session: 's' },
  ...over,
})

describe('frameStateOf', () => {
  it('reads the state from our own frame on our own origin', () => {
    expect(frameStateOf(ev(), frame, ORIGIN)).toBe('reconnecting')
    expect(
      frameStateOf(
        ev({ data: { source: WINDOW_EVENT, state: 'stuck' } }),
        frame,
        ORIGIN
      )
    ).toBe('stuck')
  })

  it('ignores another origin, another frame, another shape, another state', () => {
    expect(
      frameStateOf(ev({ origin: 'https://evil.example' }), frame, ORIGIN)
    ).toBeNull()
    expect(frameStateOf(ev({ source: {} }), frame, ORIGIN)).toBeNull()
    expect(frameStateOf(ev(), null, ORIGIN)).toBeNull()
    expect(
      frameStateOf(
        ev({ data: { source: 'other', state: 'stuck' } }),
        frame,
        ORIGIN
      )
    ).toBeNull()
    expect(
      frameStateOf(
        ev({ data: { source: WINDOW_EVENT, state: 'exploded' } }),
        frame,
        ORIGIN
      )
    ).toBeNull()
    expect(frameStateOf(ev({ data: 'stuck' }), frame, ORIGIN)).toBeNull()
  })

  it('a lost or stuck window re-reads the session; a connected one does not', () => {
    expect(shouldReread('reconnecting')).toBe(true)
    expect(shouldReread('stuck')).toBe(true)
    expect(shouldReread('connected')).toBe(false)
    expect(shouldReread(null)).toBe(false)
  })

  it('speaks the same name the window posts (render skin.ts WINDOW_EVENT)', () => {
    const skin = readFileSync(
      path.resolve(__dirname, '../../../render/src/browser/skin.ts'),
      'utf8'
    )
    expect(skin).toContain(`export const WINDOW_EVENT = '${WINDOW_EVENT}'`)
  })
})

describe('a tap report from inside the window', () => {
  const win = {}
  const msg = (
    data: unknown,
    over: Partial<{ origin: string; source: unknown }> = {}
  ) => ({
    origin: 'https://app.t27.ai',
    source: win,
    data,
    ...over,
  })
  it('turns the window s report into one log line', () => {
    const line = touchReportOf(
      msg({
        source: 't27-browser',
        report: 'touch',
        pointer: 'touch',
        at: 'textarea.overlay',
        target: 'textarea.overlay',
        overlay: 'none',
        neko: {
          hosting: false,
          controlling: false,
          locked: false,
          implicit: true,
          extra: 1,
        },
      }),
      win,
      'https://app.t27.ai'
    )
    expect(JSON.parse(line!)).toEqual({
      pointer: 'touch',
      at: 'textarea.overlay',
      target: 'textarea.overlay',
      overlay: 'none',
      neko: {
        hosting: false,
        controlling: false,
        locked: false,
        implicit: true,
      },
    })
  })
  it('ignores another origin, another window and other messages', () => {
    const data = { source: 't27-browser', report: 'touch' }
    expect(
      touchReportOf(
        msg(data, { origin: 'https://evil' }),
        win,
        'https://app.t27.ai'
      )
    ).toBeNull()
    expect(
      touchReportOf(msg(data, { source: {} }), win, 'https://app.t27.ai')
    ).toBeNull()
    expect(
      touchReportOf(
        msg({ source: 't27-browser', state: 'live' }),
        win,
        'https://app.t27.ai'
      )
    ).toBeNull()
  })
})
