import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const playerRoot = path.resolve(__dirname, '..', '..')
const read = (relativePath: string) =>
  fs.readFileSync(path.join(playerRoot, relativePath), 'utf8')

describe('Generate responsive CSS contract', () => {
  it('keeps page results and panel scrolling in separate namespaces', () => {
    const page = read('src/pages/Generate.tsx')
    const panel = read('src/components/Panels/GeneratePanel.tsx')
    const pageCss = read('src/pages/Generate.css')
    const panelCss = read('src/components/Panels/GeneratePanel.css')

    expect(page).toContain('className="generate-page__results"')
    expect(panel).toContain('className="generate-panel__content"')
    expect(page).not.toContain('className="generate-content"')
    expect(panel).not.toContain('className="generate-content"')
    expect(pageCss).toContain('.generate-page__results')
    expect(panelCss).toContain('.generate-panel__content')
    expect(pageCss).not.toMatch(/(?:^|\n)\.generate-content\b/)
    expect(panelCss).not.toMatch(/(?:^|\n)\.generate-content\b/)
    expect(panelCss).toMatch(
      /\.generate-panel__content\s*\{[^}]*padding:\s*16px/s
    )
  })

  it('does not leak GeneratePanel result controls into ResultsGallery', () => {
    const gallery = read('src/components/Results/ResultsGallery.tsx')
    const galleryCss = read('src/components/Results/ResultsGallery.css')
    const legacyGlobals = [
      'results-grid',
      'result-drag-handle',
      'result-name',
      'result-actions',
      'result-remove-btn',
    ]

    for (const className of legacyGlobals) {
      expect(gallery).not.toContain(`className="${className}"`)
      expect(galleryCss).not.toMatch(new RegExp(`(?:^|\\n)\\.${className}\\b`))
    }
    expect(gallery).toContain('className="results-gallery__actions"')
    expect(galleryCss).toContain('.results-gallery__actions')
  })

  it('uses the stable viewport and counts the measured tabbar once', () => {
    const pageCss = read('src/pages/Generate.css')
    const telegramCss = read('src/styles/telegram.css')
    const tabbarCss = read('src/components/Navigation/TelegramTabBar.css')

    expect(pageCss).toContain('var(--app-vh-stable, 100dvh)')
    expect(pageCss).not.toContain('calc(100dvh')
    expect(pageCss).not.toContain('16px + var(--app-tabbar-total')
    expect(telegramCss.match(/--app-tabbar-total\s*:/g) ?? []).toHaveLength(1)
    expect(tabbarCss).toContain('--app-tabbar-total: 0px')
  })
})
