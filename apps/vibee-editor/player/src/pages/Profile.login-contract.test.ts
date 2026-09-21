import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

describe('profile login ownership', () => {
  it('delegates the single login modal to the app root', () => {
    const source = fs.readFileSync(path.join(__dirname, 'Profile.tsx'), 'utf8')
    expect(source).toContain('<Header />')
    expect(source).not.toContain('<LoginModal')
    expect(source).not.toContain('TelegramLoginButton')
  })

  /**
   * LoginModal returns null when it is closed, so every hook has to sit above
   * that return: it stays mounted while `show` toggles, and a hook below the
   * return changes the hook count between two renders of the same mount --
   * React's "Rendered fewer hooks than expected".
   *
   * This guard used to search for `const close = useCallback(`, and then the
   * line it searched for was rewritten as `useSetAtom(closeLoginAtom)`. The
   * string vanished, indexOf returned -1, and `-1 < anything` is true for
   * every possible arrangement of the file, including the broken one. The
   * guard reported green on a mutant with the whole useEffect moved below the
   * early return.
   *
   * So: anchor on the LAST hook call, whatever it is called, and fail loudly
   * if the early return itself is renamed away.
   */
  it('keeps every LoginModal hook before its conditional return', () => {
    const modal = fs.readFileSync(
      path.join(__dirname, '../components/Auth/LoginModal.tsx'),
      'utf8'
    )
    const guard = modal.indexOf('if (!show) return null')
    expect(guard, 'the early return this guard is about').toBeGreaterThan(-1)

    // Every `useX(` call site in the component body, not just one binding.
    const hooks = [...modal.matchAll(/\buse[A-Z]\w*\(/g)].map(m => ({
      name: m[0],
      at: m.index ?? -1,
    }))
    expect(hooks.length).toBeGreaterThan(2)

    const late = hooks.filter(h => h.at > guard)
    expect(late.map(h => h.name)).toEqual([])
  })
})
