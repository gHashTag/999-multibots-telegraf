/**
 * Breaks a tool the way `tri dupes` was broken: only on files containing a
 * quote character.
 *
 * The blunt probe (crash-preload.cjs) breaks every data read, so any
 * self-check with even one POSITIVE assertion goes red -- it therefore only
 * catches checks made entirely of negative assertions. The historical bug was
 * narrower and nastier: the crash spared the positive fixture (which contained
 * no quotes) and was invisible to the two negative ones. A probe that cannot
 * reproduce the bug it was written for proves nothing about it.
 */
const fs = require('fs')
const path = require('path')
const real = fs.readFileSync

fs.readFileSync = function (file, options) {
  const out = real.call(this, file, options)
  const name = typeof file === 'string' ? file : ''
  if (
    name.includes('node_modules') ||
    name.includes(`${path.sep}scripts${path.sep}`) ||
    name.endsWith(`${path.sep}tri`)
  ) {
    return out
  }
  const text = typeof out === 'string' ? out : ''
  if (/['"`]/.test(text)) throw new ReferenceError('QUOTES is not defined')
  return out
}
