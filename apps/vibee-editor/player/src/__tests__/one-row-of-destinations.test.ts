/**
 * THE BOTTOM OF THE SCREEN BELONGS TO THE APP'S DESTINATIONS, AND NOTHING ELSE.
 *
 * Owner, 2026-09-23, with a screenshot of the Leads screen: "what are these
 * tabs inside a tab? put this in order -- the structure has to be logical,
 * the logic must not be written twice, and the aesthetics have to follow the
 * design."
 *
 * What that screenshot showed, measured the same day at 390px on app.t27.ai:
 * `.leads-bottom-tabs` (5 items) ended at 760px with the app's own bar
 * starting at 703px, so all 57px of it were behind the bar and none of its
 * five items could be pressed. On top of that, `/search` matched none of the
 * six destinations in lib/primaryNavigation.ts, so the bar lit nothing and
 * the screen said nowhere-in-particular.
 *
 * This file holds the rule, not the screenshot: one bottom bar, and a
 * screen's own sections are one row at the top, drawn by one component.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

const FILES = walk(SRC)
const css = FILES.filter(f => f.endsWith('.css'))
const tsx = FILES.filter(f => f.endsWith('.tsx') && !f.includes('.test.'))

/** Rule bodies whose selector matches, across every stylesheet. */
function rulesFor(test: (selector: string) => boolean) {
  const found: Array<{ file: string; selector: string; body: string }> = []
  for (const file of css) {
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim()
      if (selector.startsWith('@') || !test(selector)) continue
      found.push({ file: file.slice(SRC.length + 1), selector, body: m[2] })
    }
  }
  return found
}

describe('one row of destinations at the bottom', () => {
  it('only the app bar and the header tabs are pinned to the bottom edge', () => {
    const pinned = rulesFor(s => /tab|nav/i.test(s))
      .filter(
        r =>
          /position:\s*fixed/.test(r.body) &&
          /(^|;|\s)bottom:\s*0/.test(r.body) &&
          // A drawer pinned top AND bottom is a full-height panel, not a bar.
          !/(^|;|\s)top:\s*0/.test(r.body)
      )
      .map(r => r.selector.split(',')[0].trim())

    /*
     * `.header-tabs` is the desktop navigation, which moves to the bottom
     * below 1024px and is then hidden while the app bar is up
     * (Header/styles.css: body[data-tabbar] .header-tabs { display: none }).
     * Anything else pinned down there is a second bar.
     */
    expect([...new Set(pinned)].sort()).toEqual(['.header-tabs', '.tma-tabbar'])
  })

  it('the header tabs stand down while the app bar is up', () => {
    const header = readFileSync(
      join(SRC, 'components', 'Header', 'styles.css'),
      'utf8'
    )
    expect(header).toMatch(
      /body\[data-tabbar\]\s+\.header-tabs\s*\{[^}]*display:\s*none/
    )
  })

  it('the leads screen is gone, and its address lands on the section it meant', () => {
    for (const file of ['App.tsx', join('components', 'FullApp.tsx')]) {
      const text = readFileSync(join(SRC, file), 'utf8')
      expect(text, file).toMatch(
        /path="\/search"\s+element=\{<Navigate to="\/crm\?tab=leads" replace \/>\}/
      )
    }
    expect(FILES.some(f => f.endsWith(join('pages', 'Search.tsx')))).toBe(false)
    // The five-item row itself, and the second copy of the same list that
    // was rendered for desktop, are not rendered by anything any more.
    for (const file of tsx) {
      const text = readFileSync(file, 'utf8')
      expect(text, file).not.toContain('leads-bottom-tab')
      expect(text, file).not.toContain('leads-sidebar')
    }
  })
})
