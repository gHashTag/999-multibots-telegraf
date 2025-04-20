import { describe, it, expect } from '@jest/globals'
import * as fs from 'fs'
import * as path from 'path'

describe('handlers loadable modules', () => {
  const handlersDir = path.resolve(__dirname, '../../src/handlers')
  const files = fs.readdirSync(handlersDir).filter(f => f.endsWith('.ts'))
  files.forEach(file => {
    const name = file.replace(/\.ts$/, '')
    it(`can require handler module ${name}`, () => {
      const mod = require(`@/handlers/${name}`)
      expect(mod).toBeDefined()
      expect(typeof mod).toBe('object')
      // should export at least one property
      expect(Object.keys(mod).length).toBeGreaterThan(0)
    })
  })
})