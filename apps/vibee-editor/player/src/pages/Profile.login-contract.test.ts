import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('profile login ownership', () => {
  it('delegates the single login modal to Header', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Profile.tsx'), 'utf8')
    expect(source).toContain('<Header />')
    expect(source).not.toContain('<LoginModal')
    expect(source).not.toContain('TelegramLoginButton')
  })

  it('keeps every LoginModal hook before its conditional return', () => {
    const modal = fs.readFileSync(
      path.join(__dirname, '../components/Auth/LoginModal.tsx'),
      'utf8'
    )
    expect(modal.indexOf('const close = useCallback(')).toBeLessThan(
      modal.indexOf('if (!show) return null')
    )
  })
})
