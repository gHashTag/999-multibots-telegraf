import fs from 'fs'
import path from 'path'

describe('Import all modules in src', () => {
  it('should require every module without errors', () => {
    const srcDir = path.resolve(__dirname, '../src')
    function walk(dir: string): string[] {
      let results: string[] = []
      const list = fs.readdirSync(dir)
      for (const file of list) {
        const filePath = path.join(dir, file)
        const stat = fs.statSync(filePath)
        if (stat.isDirectory()) {
          results = results.concat(walk(filePath))
        } else if (
          (filePath.endsWith('.ts') || filePath.endsWith('.js')) &&
          !filePath.endsWith('.d.ts')
        ) {
          results.push(filePath)
        }
      }
      return results
    }

    const files = walk(srcDir)
    files.forEach(filePath => {
      expect(() => require(filePath)).not.toThrow()
    })
  })
})
