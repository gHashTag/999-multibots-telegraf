import fs from 'fs'
import path from 'path'

describe('Импорт всех модулей core/supabase', () => {
  it('должен require всех .ts модулей без ошибок', () => {
    const dir = path.resolve(__dirname, '../../../src/core/supabase')
    function walk(d: string): string[] {
      let res: string[] = []
      for (const name of fs.readdirSync(d)) {
        const full = path.join(d, name)
        const stat = fs.statSync(full)
        if (stat.isDirectory()) {
          res = res.concat(walk(full))
        } else if (full.endsWith('.ts') && !full.endsWith('.d.ts')) {
          res.push(full)
        }
      }
      return res
    }
    for (const file of walk(dir)) {
      expect(() => require(file)).not.toThrow()
    }
  })
})
