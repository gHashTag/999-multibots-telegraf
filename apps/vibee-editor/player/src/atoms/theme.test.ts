/**
 * Black background everywhere (owner, 2026-10-09): whatever the phone's
 * system theme or a stored preference says, the app resolves to dark, so the
 * provider never sets color-scheme light (white inputs, scrollbars, bar).
 */
import { createStore } from 'jotai'
import { describe, expect, it } from 'vitest'
import { resolvedThemeAtom, systemThemeAtom, themeModeAtom } from './theme'

describe('the theme is always dark', () => {
  it('a light phone, a stored light or system preference: still dark', () => {
    const store = createStore()
    store.set(systemThemeAtom, 'light')
    for (const mode of ['system', 'light', 'dark'] as const) {
      store.set(themeModeAtom, mode)
      expect(store.get(resolvedThemeAtom), mode).toBe('dark')
    }
  })

  it('a new person starts dark', () => {
    expect(createStore().get(themeModeAtom)).toBe('dark')
  })
})
