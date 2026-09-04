// Break EVERY data read, not just source files: the narrow version never
// reached three of the eight tools, and their self-checks were briefly
// accused of passing on a broken tool when the tool had not been broken.
const fs = require('fs')
const path = require('path')
const real = fs.readFileSync
const Module = require('module')
fs.readFileSync = function (file, options) {
  const name = typeof file === 'string' ? file : ''
  // module loading must keep working, or node dies before the tool runs
  const loading =
    name.includes('node_modules') ||
    name.includes(`${path.sep}scripts${path.sep}`) ||
    name.endsWith('.json') ||
    name === ''
  if (!loading) throw new ReferenceError('QUOTES is not defined')
  return real.call(this, file, options)
}
