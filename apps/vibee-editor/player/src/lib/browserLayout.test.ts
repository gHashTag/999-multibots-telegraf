import { describe, it, expect } from 'vitest'
import { browserLayout, CLASSIC_VIEW } from './browserLayout'

describe('the live browser is minimal by default', () => {
  it('covers the screen at every size when it can be shown here', () => {
    for (const phone of [true, false])
      expect(browserLayout({ embedded: true, phone, view: null })).toBe(
        'minimal'
      )
  })

  it('keeps the old full-screen address working', () => {
    expect(browserLayout({ embedded: true, phone: false, view: 'full' })).toBe(
      'minimal'
    )
  })

  it('gives the classic page back on request', () => {
    expect(
      browserLayout({ embedded: true, phone: true, view: CLASSIC_VIEW })
    ).toBe('sheet')
    expect(
      browserLayout({ embedded: true, phone: false, view: CLASSIC_VIEW })
    ).toBe('flow')
  })

  it('has nothing to cover when the window opens in a tab of its own', () => {
    expect(browserLayout({ embedded: false, phone: true, view: null })).toBe(
      'flow'
    )
  })
})
