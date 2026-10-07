import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { translations } from '@/atoms/language'

/**
 * WHAT THE BROWSER TAB AND A LINK PREVIEW SAY ABOUT THIS APP.
 *
 * Owner, 2026-10-04, a screenshot of app.t27.ai/game/browser: a VIBEE bee in
 * the tab beside "Trinity S³AI - AI Video Editor | Powered by V5 Ultra-Minimal
 * Language", and "and the metadata: fix it, and make it our triangle".
 *
 * The title lives in src/atoms/language.ts (app.title, which the Header
 * writes); index.html carries a copy because the shell paints before React.
 * Every copy is pinned to that one here, so they cannot part again.
 *
 * favicon.ico and icons/*.png are rendered from public/favicon.svg:
 *   for s in 16 32 48; do rsvg-convert -w $s -h $s favicon.svg -o ico-$s.png; done
 *   magick ico-16.png ico-32.png ico-48.png favicon.ico
 *   for s in 192 512; do i=$((s*72/100)); rsvg-convert -w $i -h $i favicon.svg -o in.png
 *     magick in.png -background black -gravity center -extent ${s}x${s} -strip PNG32:icons/icon-${s}x${s}.png; done
 * (72%: the triangle inside the maskable safe zone, so a round launcher mask
 * does not cut its corners.)
 */

const PLAYER = path.resolve(__dirname, '../..')
const HTML = fs.readFileSync(path.join(PLAYER, 'index.html'), 'utf8')
/** What a reader of the page is told: the markup without its comments,
 *  which keep the history of what used to be said. */
const SAID = HTML.replace(/<!--[\s\S]*?-->/g, '')
const PUBLIC = path.join(PLAYER, 'public')
const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(PUBLIC, 'manifest.json'), 'utf8')
) as {
  name: string
  short_name: string
  description: string
  icons: { src: string; sizes: string }[]
}

/** The attribute `content` of the one <meta> with this name/property. */
function meta(attr: 'name' | 'property', key: string): string {
  const all = [
    ...HTML.matchAll(
      new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`, 'g')
    ),
  ]
  expect(all, `exactly one <meta ${attr}="${key}">`).toHaveLength(1)
  return all[0][1]
}

const TITLE = translations.en['app.title']

/**
 * The three lines a link preview shows, as the owner wrote them (2026-10-04):
 * site name, title, description. They are t27.ai's motto -- gHashTag/trinity
 * apps/website/src/lib/motto.ts (caption, headline) and GameHero.tsx (the
 * rest of the headline) -- so this list is a copy across a repository
 * boundary, and it is pinned here so it cannot drift on this side.
 */
const SITE = 'TRINITY S³AI'
const CAPTION = 'AGI game — play, direct, earn'
const DESCRIPTION =
  'Play, direct, earn: the core is a game, and the board is public'

describe('the head says what this app is', () => {
  it('one title: the one the Header writes, the site name then the caption', () => {
    expect(TITLE).toBe(`${SITE} — ${CAPTION}`)
    expect(HTML.match(/<title>([^<]*)<\/title>/)?.[1]).toBe(TITLE)
    expect(meta('name', 'title')).toBe(TITLE)
    expect(MANIFEST.name).toBe(TITLE)
  })

  it('a preview reads the site name, the caption and the description, each once', () => {
    expect(meta('property', 'og:site_name')).toBe(SITE)
    expect(meta('name', 'apple-mobile-web-app-title')).toBe(SITE)
    expect(MANIFEST.short_name).toBe(SITE)
    // The site name is its own line in a preview; the title does not repeat it.
    expect(meta('property', 'og:title')).toBe(CAPTION)
    expect(meta('name', 'twitter:title')).toBe(CAPTION)
    expect(meta('name', 'description')).toBe(DESCRIPTION)
    expect(meta('property', 'og:description')).toBe(DESCRIPTION)
    expect(meta('name', 'twitter:description')).toBe(DESCRIPTION)
    expect(MANIFEST.description).toBe(DESCRIPTION)
  })

  it('none of the claims nothing here backs', () => {
    for (const claim of [
      'V5',
      'Ultra-Minimal',
      '100x',
      '75% less',
      'Gleam',
      'BEAM',
      'ML/RL',
      'AI Video Editor',
    ])
      expect(SAID, claim).not.toContain(claim)
    // "price": "0" on an app that sells token packs; see the comment left in
    // its place.
    expect(SAID).not.toContain('application/ld+json')
  })
})

describe('the tab wears the t27 triangle', () => {
  const svg = fs.readFileSync(path.join(PUBLIC, 'favicon.svg'), 'utf8')

  it('the svg icon is the triangle, not the VIBEE wordmark', () => {
    expect(HTML).toMatch(
      /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/
    )
    expect(HTML).not.toMatch(/rel="icon"[^>]*logo\.svg/)
    // t27.ai's mark: 27 pieces, one green, on black.
    expect(svg.match(/<path [^>]*fill="#08FAB5"/g)).toHaveLength(27)
    expect(svg).toContain(
      '<rect width="512" height="512" rx="64" fill="#000000"/>'
    )
    expect(MANIFEST.icons.map(i => i.src)).toContain('/favicon.svg')
    expect(MANIFEST.icons.map(i => i.src)).not.toContain('/logo.svg')
  })

  it('favicon.ico carries 16, 32 and 48', () => {
    const ico = fs.readFileSync(path.join(PUBLIC, 'favicon.ico'))
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    const n = ico.readUInt16LE(4)
    const sizes = Array.from({ length: n }, (_, i) => ico[6 + i * 16])
    expect(sizes).toEqual([16, 32, 48])
  })

  it.each([192, 512])('icons/icon-%ix%i.png is that size', size => {
    const png = fs.readFileSync(
      path.join(PUBLIC, 'icons', `icon-${size}x${size}.png`)
    )
    expect(png.subarray(1, 4).toString()).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(size)
    expect(png.readUInt32BE(20)).toBe(size)
  })
})
