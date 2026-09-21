import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BRAND_MARK_URL } from './BrandLoader'

/**
 * EVERY WAIT IN THE PRODUCT SHOWS THE SAME MARK AND THE SAME ACCENT.
 *
 * Three copies exist because two of them cannot import the component: the
 * boot screen paints before any script, and the remote window is another
 * service's page. So the copies are held together here, as text -- which is
 * legitimate exactly where the literal IS the artifact.
 */
const root = join(__dirname, '..', '..', '..')
const read = (...p: string[]) => readFileSync(join(root, ...p), 'utf8')

const ACCENT = '#00ff88'

describe('one loader, three places', () => {
  it('THE BOOT SCREEN shows the mark and the accent ring', () => {
    const html = read('index.html')
    const boot = html.slice(html.indexOf('id="boot-fallback"'))
    expect(boot.slice(0, 1200)).toContain(`src="${BRAND_MARK_URL}"`)
    expect(boot.slice(0, 1200)).toContain(`border-top-color:${ACCENT}`)
  })

  it('THE COMPONENT shows the mark and the accent ring', () => {
    const css = read('src', 'components', 'BrandLoader', 'BrandLoader.css')
    expect(css).toMatch(
      new RegExp(`\\.brand-loader__ring \\{[^}]*border-top-color: ${ACCENT}`)
    )
    expect(BRAND_MARK_URL).toBe('/t27-mark.svg')
  })

  it('THE REMOTE WINDOW uses the same mark', () => {
    const skin = read('..', 'render', 'src', 'browser', 'skin.ts')
    expect(skin).toContain(`export const LOGO_URL = '${BRAND_MARK_URL}'`)
    expect(skin).toMatch(
      /#t27-boot \.ring \{[^}]*border-top-color: \$\{GREEN\}/
    )
  })

  it('no page falls back to a bare ring', () => {
    for (const file of [
      ['src', 'App.tsx'],
      ['src', 'components', 'FullApp.tsx'],
    ]) {
      const src = read(...file)
      expect(src).toContain('<BrandLoader fill />')
      expect(src).not.toContain('page-loader__spinner')
    }
  })

  it('the Browser tab waits with it too', () => {
    const page = read('src', 'pages', 'Browser.tsx')
    expect(page).toContain("<BrandLoader label={t('browser.loading')} />")
  })
})
