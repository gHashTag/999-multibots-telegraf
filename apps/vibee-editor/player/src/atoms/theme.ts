// ===============================
// Theme System
// Dark/Light mode with system preference
// ===============================

import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { STORAGE_KEYS, BRAND_COLORS, BG_COLORS } from '@vibee/atoms'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

// User's theme preference (stored)
export const themeModeAtom = atomWithStorage<ThemeMode>(
  STORAGE_KEYS.theme || 'vibee-theme',
  'dark'
)

// System theme detection
export const systemThemeAtom = atom<ResolvedTheme>('dark')

/*
 * Resolved theme (what's actually applied): ALWAYS DARK.
 *
 * Owner, 2026-10-09: "black background everywhere". The app's styles are dark
 * only (index.css: color-scheme dark, --bg-primary #000; no rule reads a
 * .light class), but a phone set to a light system theme resolved 'system' to
 * 'light': the provider then set color-scheme light -- white native inputs,
 * scrollbars and pickers -- and a white theme-color for the browser's bar. A
 * stored 'light' or 'system' preference no longer brings that back.
 */
export const resolvedThemeAtom = atom<ResolvedTheme>(() => 'dark')

// Toggle between light and dark
export const toggleThemeAtom = atom(null, (get, set) => {
  const current = get(resolvedThemeAtom)
  set(themeModeAtom, current === 'dark' ? 'light' : 'dark')
})

// Cycle through all modes: system -> light -> dark -> system
export const cycleThemeAtom = atom(null, (get, set) => {
  const current = get(themeModeAtom)
  const next: ThemeMode =
    current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system'
  set(themeModeAtom, next)
})

// Theme colors (for programmatic access)
export const themeColorsAtom = atom(get => {
  const theme = get(resolvedThemeAtom)

  if (theme === 'light') {
    return {
      bg: '#ffffff',
      bgElevated: '#f5f5f5',
      bgSecondary: '#e5e5e5',
      text: BG_COLORS.primary,
      textSecondary: '#666666',
      textMuted: '#999999',
      border: '#e0e0e0',
      borderLight: '#f0f0f0',
      amber: BRAND_COLORS.amber,
      amberLight: '#4dffab',
      amberDark: '#00cc66',
    }
  }

  return {
    bg: BG_COLORS.primary,
    bgElevated: '#111111',
    bgSecondary: BG_COLORS.elevated,
    text: '#ffffff',
    textSecondary: '#a0a0a0',
    textMuted: '#666666',
    border: BG_COLORS.elevated,
    borderLight: BG_COLORS.secondary,
    amber: BRAND_COLORS.amber,
    amberLight: '#4dffab',
    amberDark: '#00cc66',
  }
})
