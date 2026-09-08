import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE SCRIPT FORM MUST BE REACHABLE ON A PHONE.
 *
 * Owner, 08.09.2026: "on the AI tab there is no invitation to a script; the
 * layout is broken". Measured on the dev build at 375x812: the input form is a
 * fixed bottom sheet at bottom: 0 collapsed by translateY(100% - 60px); the
 * app tab bar (fixed, 57px) covered every pixel of that peek but three. The
 * screen showed an empty state that said "enter a topic" and no topic field.
 * Two more anomalies in the same component: the onClick that toggled the
 * sheet sat on the whole <aside>, so a tap on any chip or field inside the
 * open form closed it; and the empty state offered no way to open the form.
 *
 * These pins are structural (CSS + JSX text), mutation-checked: restoring
 * bottom: 0, the 60px peek, or the aside-wide toggle must fail here.
 */
const read = (f: string) => fs.readFileSync(path.join(__dirname, f), 'utf8')

const mobileBlock = (css: string) => {
  const start = css.indexOf('@media (max-width: 767px)')
  expect(start).toBeGreaterThan(-1)
  return css.slice(start, css.indexOf('/* Tablet */', start))
}

describe('script sheet fits above the tab bar', () => {
  const css = read('Script.css')
  const tsx = read('Script.tsx')
  const mobile = mobileBlock(css)

  it('the sheet rests on the tab bar height, not on the screen edge', () => {
    const sidebar = mobile.slice(
      mobile.indexOf('.script-sidebar {'),
      mobile.indexOf('.script-sidebar.expanded')
    )
    expect(sidebar).toContain('bottom: var(--app-tabbar-total')
    expect(sidebar).not.toMatch(/bottom:\s*0\b/)
    expect(sidebar).toContain('translateY(calc(100% - var(--script-sheet-peek')
    expect(sidebar).not.toContain('100% - 60px')
    expect(sidebar).toContain('max-height: calc(')
    expect(sidebar).toContain('var(--app-tabbar-total, 56px) - 112px')
  })

  it('the page itself stops above the tab bar and leaves room for the peek', () => {
    expect(mobile).toMatch(
      /\.script-page \{[^}]*height: calc\(var\(--app-vh-stable, 100dvh\) - var\(--app-tabbar-total, 56px\)\)/
    )
    expect(mobile).toMatch(
      /\.script-content \{[^}]*padding-bottom: calc\(var\(--script-sheet-peek, 72px\) \+ 12px\)/
    )
    expect(mobile).not.toContain('min-height: calc(100vh - 60px)')
  })

  it('the handle and the empty-state button exist on a phone and are hidden on desktop', () => {
    expect(css).toMatch(
      /\.script-sheet-handle,\s*\.script-output-cta \{\s*display: none;/
    )
    expect(mobile).toMatch(/\.script-sheet-handle \{[^}]*display: flex/)
    expect(mobile).toMatch(/\.script-output-cta \{[^}]*display: inline-flex/)
    expect(mobile).toMatch(/\.script-sheet-handle \{[^}]*min-height: 48px/)
    expect(mobile).toMatch(/\.script-output-cta \{[^}]*min-height: 44px/)
  })

  it('taps inside the open form never close it; the handle toggles; the empty state opens it', () => {
    expect(tsx).not.toContain('setIsSidebarExpanded(!isSidebarExpanded)')
    const aside = tsx.slice(
      tsx.indexOf('className={`script-sidebar'),
      tsx.indexOf('<div className="script-panel">')
    )
    expect(aside).toContain(
      'if (!isSidebarExpanded) setIsSidebarExpanded(true)'
    )
    expect(tsx).toContain('className="script-sheet-handle"')
    expect(tsx).toContain('aria-expanded={isSidebarExpanded}')
    expect(tsx).toContain('e.stopPropagation()')
    const empty = tsx.slice(
      tsx.indexOf('className="script-output-empty"'),
      tsx.indexOf('const { output } = data')
    )
    expect(empty).toContain('className="script-output-cta"')
    expect(empty).toContain('setIsSidebarExpanded(true)')
  })

  it('the sheet opens by default while there is no script and closes once one exists', () => {
    expect(tsx).toContain('useState(\n    () => !data?.output\n  )')
    expect(tsx).toMatch(
      /useEffect\(\(\) => \{\s*if \(data\?\.output\) setIsSidebarExpanded\(false\)\s*\}, \[data\?\.output\]\)/
    )
  })
})
