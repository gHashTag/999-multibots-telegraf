import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE QUEEN BOARD IS SERVED FROM THIS ORIGIN, UNDER /queen/.
 *
 * It used to live at https://t27.ai/#/queen. Moving it here is what makes the
 * product one server at one address, and what takes the /bridge hop off its
 * path: on t27.ai the board could not read this app's session at all, because
 * sessionStorage belongs to an origin, so it had to ask over postMessage for a
 * 300-second game token. Same origin, and it just reads what the app wrote.
 *
 * `location ^~ /queen/` wins over every regex location in the file, which is
 * the point — the board keeps its own rules — and is also the trap: a prefix
 * match with ^~ skips the regex blocks ENTIRELY, so two rules that the rest of
 * the site gets for free have to be restated inside it.
 *
 *   1. The data rule. The comment above `location ~* \.(json|txt|xml...)$`
 *      records what its absence did the first time: a missing manifest.json
 *      came back as index.html with code 200, the parser got HTML where it
 *      expected JSON, and nothing appeared in the console or the logs. The
 *      board ships real data files (t27/manifest.json, t27/universe-atlas.json,
 *      t27/shared-core.json), so it is exposed to exactly that failure.
 *   2. The hashed-asset cache. A 1-year immutable header is only safe because
 *      the filename changes when the bytes do.
 *
 * And the fallback must be /queen/index.html, never /index.html: a hard reload
 * of a deep board path has to land in the board, not in VIBEE.
 *
 * This test reads the template. nginx's own reading of it was measured on
 * 2026-09-21, by running nginx against a fixture tree and probing: /queen/ and
 * /queen/deep/route both served the board's index with no-store,
 * /queen/t27/manifest.json served the file, /queen/t27/missing.json answered
 * 404 rather than HTML 200, /queen/assets/index-abc123.js came back immutable
 * for a year, /queen redirected relative to /queen/, and all six VIBEE paths
 * (/, a deep route, a missing .json, a hashed asset, /healthz, /bridge) were
 * unchanged.
 *
 * Worth keeping from that run: /queen/deep/route carries the board's OWN
 * policy, not the server-level one. A deep path reaches the board through
 * try_files, and arriving at /queen/index.html gets that location's headers —
 * which is the whole reason the narrowing below is effective rather than
 * cosmetic. Measured in the same run: / still carries https://t27.ai.
 */

const TEMPLATE = path.resolve(__dirname, '../../../nginx/default.conf.template')
const DOCKERFILE = path.resolve(__dirname, '../../../Dockerfile')

/**
 * The board's own policy, compared whole so that an added source of any kind
 * fails. Deliberately NOT the site-wide line, which admits https://t27.ai:
 * moving the board here is exactly what makes that unsafe. On t27.ai it held a
 * 300-second game token good for two identity tools; served from this origin it
 * reads the app's session and can do everything the app can. That puts it in
 * the class of /pair and the consent popup — pages narrowed to the ancestors
 * under which they have to work — not in the class of the site's own screens.
 *
 * frame-ancestors is per origin and cannot be narrowed to a path, so admitting
 * t27.ai would admit every gHashTag site published there (t27.ai/leela/,
 * /trinity/, /jscamp/, ...). The board does not need it: the old address
 * redirects here, and a redirect consults no frame-ancestors.
 */
const QUEEN_CSP =
  "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org;"

const SERVER_HEADERS = [
  'Content-Security-Policy',
  'X-Content-Type-Options',
  'Referrer-Policy',
]

/**
 * The bridge test's block() finds the end of a location by looking for a
 * closing brace at four spaces. `^~ /queen/` contains nested locations, so its
 * body is read by counting braces instead — otherwise a nested block's own
 * closing brace could be mistaken for the end of the outer one.
 */
function block(conf: string, match: string): string | null {
  const head = `location ${match} {`
  const start = conf.indexOf(head)
  if (start < 0) return null
  let depth = 0
  for (let i = start + head.length - 1; i < conf.length; i++) {
    if (conf[i] === '{') depth++
    else if (conf[i] === '}') {
      depth--
      if (depth === 0) return conf.slice(start, i + 1)
    }
  }
  return null
}

function queenProblems(conf: string): string[] {
  const out: string[] = []
  const body = block(conf, '^~ /queen/')
  if (!body) return ['no location ^~ /queen/']

  // The SPA fallback stays inside the board.
  const fallback = body.match(/try_files\s+\$uri\s+\$uri\/\s+([^\s;]+);/)
  if (!fallback) out.push('no SPA fallback')
  else if (fallback[1] !== '/queen/index.html') {
    out.push(`fallback is ${fallback[1]}`)
  }

  // The data rule, restated — without it a missing .json is HTML with code 200.
  const data = block(body, '~* ^/queen/.+\\.(json|txt|xml|webmanifest)$')
  if (!data) out.push('no data rule inside /queen/')
  else if (!/try_files\s+\$uri\s+=404;/.test(data)) {
    out.push('data rule does not 404')
  }

  // The hashed-asset cache, restated.
  const assets = block(
    body,
    '~* ^/queen/.+\\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp|wasm)$'
  )
  if (!assets) out.push('no asset cache inside /queen/')
  else if (!/expires\s+1y;/.test(assets)) out.push('assets not immutable')

  // The entry document names the hashed files; caching it strands a deploy.
  const index = block(body, '= /queen/index.html')
  if (!index) out.push('no location = /queen/index.html')
  else {
    if (!/Cache-Control\s+"no-cache, no-store, must-revalidate"/.test(index)) {
      out.push('/queen/index.html is cacheable')
    }
    // add_header in a location drops every inherited one.
    for (const h of SERVER_HEADERS) {
      if (!index.includes(`add_header ${h} `)) {
        out.push(`/queen/index.html lost ${h}`)
      }
    }
    const csp = [
      ...index.matchAll(/add_header\s+Content-Security-Policy\s+"([^"]*)"/g),
    ].map(m => m[1])
    if (csp.length !== 1 || csp[0] !== QUEEN_CSP) {
      out.push(`board policy is ${JSON.stringify(csp)}`)
    }
  }
  return out
}

describe('nginx serves the Queen board under /queen/ on this origin', () => {
  const conf = fs.readFileSync(TEMPLATE, 'utf8')

  it('the board has its own location, its own fallback and its own rules', () => {
    expect(queenProblems(conf)).toEqual([])
  })

  it('^~ , so the board wins over the regex locations rather than falling into them', () => {
    expect(conf).toContain('location ^~ /queen/ {')
  })

  it('a deep board path falls back INSIDE the board, not into VIBEE', () => {
    const body = block(conf, '^~ /queen/') ?? ''
    expect(body).toContain('try_files $uri $uri/ /queen/index.html;')
    // Every fallback target in the block is the board's own document. Checked
    // by parsing the targets, not by searching for the substring '/index.html'
    // — which '/queen/index.html' of course contains.
    const targets = [
      ...body.matchAll(/try_files\s+\$uri\s+\$uri\/\s+([^\s;]+);/g),
    ]
    expect(targets.map(m => m[1])).toEqual(['/queen/index.html'])
  })

  it('the board carries its own frame-ancestors, and t27.ai is not in it', () => {
    const index = block(conf, '= /queen/index.html') ?? ''
    expect(index).toContain(`add_header Content-Security-Policy "${QUEEN_CSP}"`)
    expect(index).not.toContain('t27.ai')
  })

  it('negative control: t27.ai allowed to frame the board is caught', () => {
    const broken = conf.replace(
      `"${QUEEN_CSP}" always;`,
      `"frame-ancestors 'self' https://web.telegram.org https://*.telegram.org https://t27.ai;" always;`
    )
    expect(broken).not.toBe(conf)
    expect(queenProblems(broken)).toEqual([
      expect.stringMatching(/^board policy is/),
    ])
  })

  it("VIBEE's own rules are untouched", () => {
    expect(conf).toContain(
      'location / {\n        try_files $uri $uri/ /index.html;'
    )
    expect(conf).toContain('location ~* \\.(json|txt|xml|webmanifest)$ {')
    expect(block(conf, '= /healthz')).toContain('return 200 "ok\\n";')
    expect(block(conf, '= /bridge')).toContain(
      'try_files /bridge/index.html =404;'
    )
  })

  it('negative control: the fallback pointing at VIBEE is caught', () => {
    const broken = conf.replace(
      'try_files $uri $uri/ /queen/index.html;',
      'try_files $uri $uri/ /index.html;'
    )
    expect(broken).not.toBe(conf)
    expect(queenProblems(broken)).toEqual(['fallback is /index.html'])
  })

  it('negative control: dropping the restated data rule is caught', () => {
    const broken = conf.replace(
      /\n {8}location ~\* \^\/queen\/\.\+\\\.\(json\|txt\|xml\|webmanifest\)\$ \{[\s\S]*?\n {8}\}\n/,
      '\n'
    )
    expect(broken).not.toBe(conf)
    expect(queenProblems(broken)).toEqual(['no data rule inside /queen/'])
  })

  it('negative control: a cacheable /queen/index.html is caught', () => {
    const idx = conf.indexOf('location = /queen/index.html')
    const broken =
      conf.slice(0, idx) +
      conf
        .slice(idx)
        .replace(
          'add_header Cache-Control "no-cache, no-store, must-revalidate" always;',
          ''
        )
    expect(queenProblems(broken)).toEqual(['/queen/index.html is cacheable'])
  })

  it('negative control: removing the whole block is caught', () => {
    const broken = conf.replace(
      /\n {4}location \^~ \/queen\/ \{[\s\S]*?\n {4}\}\n/,
      '\n'
    )
    expect(broken).not.toBe(conf)
    expect(queenProblems(broken)).toEqual(['no location ^~ /queen/'])
  })
})

/**
 * The board is built from gHashTag/trinity, where it is developed. A second
 * copy vendored here would drift from the one people edit, and the drift would
 * surface as "I fixed it and app.t27.ai still shows the old screen".
 *
 * Pinned to a commit id and never a branch: a branch makes the image
 * unreproducible and lets a merge in ANOTHER repository silently change what
 * this origin serves. Railway's watchPatterns cannot see that repository
 * either, so bumping the pin here IS the commit that ships a new board.
 */
describe('the Dockerfile builds the board from its own repository, pinned', () => {
  const dockerfile = fs.readFileSync(DOCKERFILE, 'utf8')

  it('there is a queen stage', () => {
    expect(dockerfile).toContain('AS queen')
  })

  it('the ref is a full commit id, not a branch or a tag', () => {
    const ref = dockerfile.match(/ARG QUEEN_REF=(\S+)/)
    expect(ref).not.toBeNull()
    expect(ref![1]).toMatch(/^[0-9a-f]{40}$/)
  })

  it('the build output is copied under /queen/, after the player', () => {
    const player = dockerfile.indexOf(
      'COPY --from=build /workspace/player/dist/ /usr/share/nginx/html/'
    )
    const queen = dockerfile.indexOf(
      'COPY --from=queen /queen/apps/website/dist/ /usr/share/nginx/html/queen/'
    )
    expect(player).toBeGreaterThan(-1)
    expect(queen).toBeGreaterThan(player)
  })
})
