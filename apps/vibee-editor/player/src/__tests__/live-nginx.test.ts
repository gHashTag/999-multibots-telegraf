import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE PERSON'S BROWSER IS SERVED UNDER /live/, AND ALL OF IT MUST GET THERE.
 *
 * Measured in production on 2026-09-21: the pod's HTML arrived through
 * /live/<id>/ with 200, and its three bundles did not --
 *
 *   /live/<id>/js/chunk-vendors.*.js  -> 404
 *   /live/<id>/js/app.*.js            -> 404
 *   /live/<id>/css/app.*.css          -> 404
 *
 * -- and the 404 page said `nginx/1.`, so the requests never reached the
 * render at all. `location /live/` was a plain prefix, and a plain prefix
 * LOSES to the regex locations further down: the .js and .css paths matched
 * `\.(js|css)$` first, nginx looked for them in this app's own dist, and
 * found nothing. The neko app never ran, and the person watched our loader
 * spin over an empty page.
 *
 * `^~` makes a prefix match final: nginx stops before the regex blocks. The
 * /bridge/ and /queen/ locations carry it for the same reason, and the file
 * says so above them.
 */
const tpl = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'nginx', 'default.conf.template'),
  'utf8'
)
const rules = tpl.replace(/#.*$/gm, '')

describe('the person browser gets all of its files', () => {
  it('MAKES /live/ WIN OVER THE REGEX LOCATIONS', () => {
    expect(rules).toMatch(/location\s+\^~\s+\/live\/\s*\{/)
    /* And not also a second, plain /live/ that could shadow it. */
    expect(rules).not.toMatch(/location\s+\/live\/\s*\{/)
  })

  it('still has the regex blocks that made ^~ necessary', () => {
    /*
     * If these ever go away the modifier is harmless; while they are here it
     * is load-bearing, and this is the reason it must not be "tidied" off.
     */
    expect(rules).toMatch(/location\s+~\*\s+\\\.\(js\|css\)\$/)
  })

  it('carries the upgrade headers, or the picture never starts', () => {
    const block = rules.slice(rules.indexOf('location ^~ /live/'))
    const body = block.slice(0, block.indexOf('}'))
    expect(body).toContain('proxy_set_header Upgrade $http_upgrade')
    expect(body).toContain('proxy_set_header Connection $connection_upgrade')
  })
})
