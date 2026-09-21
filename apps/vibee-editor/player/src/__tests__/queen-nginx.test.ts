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
 *   2. The asset cache. A 1-year immutable header is only safe because the URL
 *      changes when the bytes do — and for a year that sentence sat here as a
 *      justification while the rule applied the header to unhashed names too.
 *      t27/t27_compiler.wasm collected on it: a bundle with a seventh compiler
 *      backend asked the CACHED six-backend compiler to fill its new tab, and
 *      the tab printed "This backend produced no output". The condition is now
 *      enforced rather than asserted, by $queen_asset_cache.
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
 * Re-run against the conditional policy the same day, since a map is read by
 * nginx and not by this file:
 *
 *   /queen/assets/index-abc123.js          public, max-age=31536000, immutable
 *   /queen/t27/t27_compiler.wasm           public, max-age=0, must-revalidate
 *   ...t27_compiler.wasm?v=3f1e073c96...   public, max-age=31536000, immutable
 *
 * Three URLs, one location block: the two wasm lines differ only in a query
 * string, which is the whole reason the decision is made in a map. All three
 * now also carry nosniff, which the old rule dropped by adding Cache-Control
 * alone. The board and VIBEE paths above were re-probed unchanged.
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
 * The asset rule's match, written once: the checks read the block with it and
 * the negative controls sabotage the block with it.
 *
 * It carries the board's frame-ancestors like the entry document, which looks
 * redundant on a stylesheet and is not: `.svg` is in this list, and an SVG in
 * an iframe is a DOCUMENT that runs script. Pointing a frame at
 * /queen/assets/<anything>.svg would otherwise be an un-narrowed way into the
 * board's origin.
 */
const ASSET_MATCH =
  '~* ^/queen/.+\\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|webp|wasm)$'

/**
 * The bridge test's block() finds the end of a location by looking for a
 * closing brace at four spaces. `^~ /queen/` contains nested locations, so its
 * body is read by counting braces instead — otherwise a nested block's own
 * closing brace could be mistaken for the end of the outer one.
 */
function block(conf: string, match: string): string | null {
  return braced(conf, `location ${match} {`)
}

/**
 * The same brace counting for a `map`, which is not a location.
 *
 * Maps live at file scope here — conf.d is included inside http{}, and the
 * comment at the top of the template says so — so they are read from the whole
 * config rather than from inside the board's block.
 */
function mapBlock(conf: string, args: string): string | null {
  return braced(conf, `map ${args} {`)
}

/**
 * Replace the first occurrence AFTER a landmark, rather than in the file.
 *
 * `conf.replace(str, …)` hits the first occurrence anywhere, and both strings
 * these controls sabotage now appear more than once: the asset rule repeats the
 * board's own frame-ancestors, and it repeats the security headers too. A
 * control that edits the wrong block asserts nothing — the CSP one did exactly
 * that the moment the asset rule started carrying a policy, and reported a
 * clean config.
 */
function editAfter(
  conf: string,
  landmark: string,
  find: string,
  replace: string
): string {
  const at = conf.indexOf(landmark)
  if (at < 0) throw new Error(`landmark not in template: ${landmark}`)
  const edited = conf.slice(at).replace(find, () => replace)
  if (edited === conf.slice(at)) throw new Error(`nothing to sabotage: ${find}`)
  return conf.slice(0, at) + edited
}

function braced(conf: string, head: string): string | null {
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

  // The asset cache, restated — and conditional.
  //
  // This used to assert `expires 1y;` and nothing else, which is why it was
  // green throughout: a blanket year of `immutable` on unhashed URLs is
  // exactly what it was checking FOR. What has to hold is narrower — the
  // promise is made only where the URL describes its own bytes.
  const assets = block(body, ASSET_MATCH)
  if (!assets) out.push('no asset cache inside /queen/')
  else {
    if (!/add_header\s+Cache-Control\s+\$queen_asset_cache\b/.test(assets)) {
      out.push('assets do not use the conditional cache policy')
    }
    // `expires` writes its own max-age into a second Cache-Control header,
    // which would override the map on precisely the unhashed assets at issue.
    if (/\bexpires\s/.test(assets)) out.push('assets still set expires')
    // A literal immutable here would be the unconditional promise returning
    // under another spelling.
    if (/immutable/.test(assets)) out.push('assets promise immutable directly')
    // add_header in a location drops every inherited one; the old block added
    // Cache-Control alone and shipped scripts with no nosniff.
    for (const h of SERVER_HEADERS) {
      if (!assets.includes(`add_header ${h} `)) out.push(`assets lost ${h}`)
    }
  }

  // The map the policy comes from. Declared at file scope, so it is read from
  // the whole config rather than from inside the board's block.
  const policy = mapBlock(
    conf,
    '$queen_hashed_name$queen_tagged_url $queen_asset_cache'
  )
  if (!policy) out.push('no $queen_asset_cache map')
  else {
    // The default arm is what an unrecognised URL gets. It must be the
    // revalidating one: a default of `immutable` would restore the blanket
    // promise for anything the two feeder maps failed to classify.
    const fallthrough = policy.match(/"?00"?\s+"([^"]*)"/)
    if (!fallthrough)
      out.push('$queen_asset_cache does not name the unaddressed case')
    else if (!/must-revalidate/.test(fallthrough[1])) {
      out.push('unaddressed assets are not revalidated')
    }
    if (!/default\s+"[^"]*immutable[^"]*"/.test(policy)) {
      out.push('content-addressed assets are not immutable')
    }
  }
  // Hashed by filename: Vite writes hashed names under /queen/assets/ only.
  const byName = mapBlock(conf, '$uri $queen_hashed_name')
  if (!byName) out.push('no $queen_hashed_name map')
  else if (!/~\^\/queen\/assets\/\s+1;/.test(byName)) {
    out.push('$queen_hashed_name does not recognise /queen/assets/')
  }
  // Tagged by query: nginx matches locations on the path and ignores the
  // query, so ?v=<sha> can only be told apart here.
  const byQuery = mapBlock(conf, '$arg_v $queen_tagged_url')
  if (!byQuery) out.push('no $queen_tagged_url map')
  else if (!/''\s+0;/.test(byQuery))
    out.push('$queen_tagged_url treats a missing tag as tagged')

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
    const broken = editAfter(
      conf,
      'location = /queen/index.html',
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
    const broken = editAfter(
      conf,
      'location = /queen/index.html',
      'add_header Cache-Control "no-cache, no-store, must-revalidate" always;',
      ''
    )
    expect(queenProblems(broken)).toEqual(['/queen/index.html is cacheable'])
  })

  // ——— the cache policy, one control per check ———

  it('negative control: the rule this replaced — a blanket year — is caught', () => {
    const current = block(block(conf, '^~ /queen/') ?? '', ASSET_MATCH)
    expect(current).not.toBeNull()
    // Reconstructed verbatim from git, not paraphrased: this is the rule that
    // was in production while the compiler went stale behind it.
    const broken = conf.replace(
      current!,
      () =>
        `location ${ASSET_MATCH} {\n` +
        `            expires 1y;\n` +
        `            add_header Cache-Control "public, immutable";\n` +
        `        }`
    )
    expect(broken).not.toBe(conf)
    expect(queenProblems(broken)).toEqual([
      'assets do not use the conditional cache policy',
      'assets still set expires',
      'assets promise immutable directly',
      'assets lost Content-Security-Policy',
      'assets lost X-Content-Type-Options',
      'assets lost Referrer-Policy',
    ])
  })

  it('negative control: an asset rule that drops nosniff is caught', () => {
    const broken = editAfter(
      conf,
      `location ${ASSET_MATCH} {`,
      '\n            add_header X-Content-Type-Options "nosniff" always;',
      ''
    )
    expect(queenProblems(broken)).toEqual([
      'assets lost X-Content-Type-Options',
    ])
  })

  it('negative control: removing the policy map is caught', () => {
    const map = mapBlock(
      conf,
      '$queen_hashed_name$queen_tagged_url $queen_asset_cache'
    )
    expect(map).not.toBeNull()
    const broken = conf.replace(map!, () => '')
    expect(queenProblems(broken)).toEqual(['no $queen_asset_cache map'])
  })

  it('negative control: promising immutable to an unaddressed URL is caught', () => {
    const broken = conf.replace(
      '"00"    "public, max-age=0, must-revalidate";',
      () => '"00"    "public, max-age=31536000, immutable";'
    )
    expect(broken).not.toBe(conf)
    expect(queenProblems(broken)).toEqual([
      'unaddressed assets are not revalidated',
    ])
  })

  it('negative control: losing the long cache for hashed assets is caught', () => {
    // The check has to bite in BOTH directions, or a nervous edit that makes
    // everything revalidate would pass while throwing away the caching this
    // whole rule exists to provide.
    const broken = conf.replace(
      'default "public, max-age=31536000, immutable";',
      () => 'default "public, max-age=0, must-revalidate";'
    )
    expect(broken).not.toBe(conf)
    expect(queenProblems(broken)).toEqual([
      'content-addressed assets are not immutable',
    ])
  })

  it('negative control: a name map that misses /queen/assets/ is caught', () => {
    const broken = conf.replace(
      '~^/queen/assets/ 1;',
      () => '~^/queen/static/ 1;'
    )
    expect(broken).not.toBe(conf)
    expect(queenProblems(broken)).toEqual([
      '$queen_hashed_name does not recognise /queen/assets/',
    ])
  })

  it('negative control: counting a missing ?v= as a content tag is caught', () => {
    // nginx sets $arg_v to the empty string when there is no query tag, so this
    // one line is the difference between "tagged" and "everything".
    const broken = editAfter(conf, 'map $arg_v', "''      0;", "''      1;")
    expect(broken).not.toBe(conf)
    expect(queenProblems(broken)).toEqual([
      '$queen_tagged_url treats a missing tag as tagged',
    ])
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
