/**
 * THE CRM CONSOLE MUST BE REACHABLE FROM THE APP.
 *
 * Measured 2026-09-20: `/crm` is registered in App.tsx, the eleven CRM read
 * tools answer with real data on production, and `grep -rn 'to="/crm'` over
 * the whole player returned exactly ONE hit -- a breadcrumb inside
 * `CrmClient.tsx`, on a page only reachable from `/crm` itself. The only link
 * into the console was inside the console.
 *
 * It surfaced the way these things do: the owner asked for the launch tasks to
 * be put "into the CRM", they were, and he had no way to open the screen that
 * holds them.
 *
 * This test is deliberately a GREP over the source rather than a render. What
 * failed was not a component's behaviour -- it was that no component anywhere
 * mentioned the route. Only a whole-tree read can fail for that reason.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(__dirname, '..')

const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== 'node_modules') walk(full, out)
    } else if (/\.tsx?$/.test(e.name)) out.push(full)
  }
  return out
}

/** Files that link to /crm, excluding the CRM's own pages and the tests. */
const doorsIntoCrm = (): string[] =>
  walk(SRC)
    .filter(f => !f.includes('__tests__'))
    .filter(f => !/pages[\/\\]Crm/.test(f))
    .filter(f =>
      /to="\/crm"|to={'\/crm'}|navigate\('\/crm'\)/.test(
        fs.readFileSync(f, 'utf8')
      )
    )

/**
 * Is this file actually rendered by a page, or is it a component nobody uses?
 *
 * The first version of this test counted the component file ITSELF as a door,
 * so deleting the one line that renders it in Profile.tsx passed untouched --
 * the mutation survived and said so. A link in a file nobody renders is the
 * same orphan as no link at all.
 */
const isRenderedByAPage = (file: string): boolean => {
  const name = path.basename(file).replace(/\.tsx?$/, '')
  if (/pages[\/\\]/.test(file)) return true
  return walk(path.join(SRC, 'pages')).some(pageFile => {
    const text = fs.readFileSync(pageFile, 'utf8')
    return new RegExp(`<${name}[\\s/>]`).test(text)
  })
}

describe('the CRM console', () => {
  it('is reachable from somewhere that is not itself', () => {
    const doors = doorsIntoCrm()
    const live = doors.filter(isRenderedByAPage).map(f => path.relative(SRC, f))
    expect(
      live,
      'nothing a page renders links to /crm -- the console is orphaned again'
    ).not.toEqual([])
  })

  /*
   * NOT A SEVENTH PRIMARY TAB. primaryNavigation.ts documents that the row's
   * limit is the TOTAL WIDTH OF THE LABELS at 375px, not the number of tabs.
   * Adding one is a measurement, not an edit -- so if somebody does it, they
   * should have to delete this test on purpose.
   */
  it('did not become a primary tab', () => {
    const nav = fs.readFileSync(
      path.join(SRC, 'lib/primaryNavigation.ts'),
      'utf8'
    )
    const ids = [...nav.matchAll(/id:\s*'([a-z]+)'/g)].map(m => m[1])
    /*
     * The list itself is NOT pinned: another branch is adding a browser tab,
     * and a test that fails on somebody else's legitimate edit teaches people
     * to delete tests. What is pinned is the thing that would be wrong: the
     * console arriving in the row, and the row outgrowing what fits.
     */
    expect(ids, 'the CRM became a primary tab').not.toContain('crm')
    expect(
      ids.length,
      'the tab row grew past six -- primaryNavigation.ts says the limit is the ' +
        'total width of the labels at 375px, so this needs measuring, not an edit'
    ).toBeLessThanOrEqual(6)
  })
})
