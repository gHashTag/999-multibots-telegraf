import fs from 'fs'
import path from 'path'

// Проверяем, что в тестах больше нет комментариев @ts-nocheck
describe('TS-NOCHECK ban in tests', () => {
  it('should not contain @ts-nocheck in any test file', () => {
    const testRoot = path.resolve(__dirname, '..')
    function collectFiles(dir: string): string[] {
      let results: string[] = []
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name)
        const stat = fs.statSync(full)
        if (stat.isDirectory()) {
          results = results.concat(collectFiles(full))
        } else if (/\.test\.ts$/.test(name)) {
          results.push(full)
        }
      }
      return results
    }

    const files = collectFiles(testRoot)
    files.forEach(file => {
      const content = fs.readFileSync(file, 'utf8')
      expect(content).not.toMatch(/\/\/\s*@ts-nocheck/)
    })
  })
})
