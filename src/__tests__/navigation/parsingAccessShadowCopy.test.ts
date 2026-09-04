import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Parsing access is decided by getParsingAccess, and there are TWO of them.
 *
 *   src/navigation/config/access.config.ts:47        <- live
 *   src/navigation/unified-navigation.config.ts:460  <- shadow copy
 *
 * Every production caller reaches the live one: menuScene, instagramScrapingWizard
 * and registerCommands all import getParsingAccess from '@/navigation', and the
 * barrel re-exports it from './config/access.config'. The shadow copy is reached
 * by nobody -- the barrel takes only `mainMenu` out of that file.
 *
 * The two copies read staff lists of the same name that are NOT the same list.
 * The shadow one carries one extra id, 7669741878, whose comment in the source
 * marks it as @Arhustel, a shared account. So the difference between the dead copy and the live one
 * is a permission: today that account has no parsing access, and it would have
 * it the moment anything imported the shadow copy instead.
 *
 * That is what makes this worth a test rather than a note. The defect needs no
 * edit to the lists to go live -- changing one import path is enough, and an
 * import path is exactly the kind of thing a barrel cleanup touches without
 * anyone thinking about permissions.
 *
 * The file is read as SOURCE, not imported. Importing both modules would give
 * two arrays and lose the question, which is about which definition each call
 * site resolves to.
 *
 * Whether 7669741878 should have access is the owner's call, so nothing here
 * changes a list. These checks only keep the situation from changing silently:
 * one pins the routing that keeps the shadow copy harmless, the other pins the
 * exact difference so editing either list has to pass through this file.
 */

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const LIVE = 'src/navigation/config/access.config.ts'
const SHADOW = 'src/navigation/unified-navigation.config.ts'
const BARREL = 'src/navigation/index.ts'

/** Ids of a `export const NAME = [ '1', '2' ]` literal, comments stripped. */
function staffIds(source: string, name: string): string[] {
  const start = source.indexOf(`export const ${name} = [`)
  if (start === -1) throw new Error(`${name} not found`)
  const end = source.indexOf(']', start)
  if (end === -1) throw new Error(`${name} is not closed`)
  const body = source.slice(start, end).replace(/\/\/[^\n]*/g, '')
  return [...body.matchAll(/['"](\d+)['"]/g)].map(m => m[1])
}

describe('getParsingAccess has a shadow copy with a wider staff list', () => {
  it('reads both staff lists', () => {
    // Guards the reader itself: a matcher that silently returned [] would make
    // every assertion below pass while checking nothing.
    expect(staffIds(read(LIVE), 'METAMUSE_STAFF_IDS').length).toBeGreaterThan(3)
    expect(staffIds(read(SHADOW), 'METAMUSE_STAFF_IDS').length).toBeGreaterThan(
      3
    )
  })

  it('routes the barrel export to the live copy, not the shadow one', () => {
    const barrel = read(BARREL)
    const exportsGetParsingAccess = barrel
      .split('\n')
      .some(l => /getParsingAccess/.test(l) && !l.trimStart().startsWith('*'))
    expect(exportsGetParsingAccess).toBe(true)
    // The only thing production may take out of the shadow file.
    const fromShadow = [
      ...barrel.matchAll(
        /export\s*\{([^}]*)\}\s*from\s*['"]\.\/unified-navigation\.config['"]/g
      ),
    ].flatMap(m =>
      m[1]
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    )
    expect(fromShadow).toEqual(['mainMenu'])
    expect(barrel).not.toMatch(
      /export\s*\*\s*from\s*['"]\.\/unified-navigation\.config['"]/
    )
  })

  it('keeps every production caller on the barrel', () => {
    // A direct import of the shadow path is the one-line change that turns the
    // latent grant into a live one.
    //
    // The subject here is the STATEMENT, not the file. A first version asked
    // whether a file imports the shadow path and whether it mentions
    // getParsingAccess anywhere -- two unrelated facts, both true of the barrel
    // for different reasons, so it reported the one file that is fine.
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), {
        withFileTypes: true,
      })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) {
          if (e.name !== '__tests__' && e.name !== 'node_modules') walk(rel)
        } else if (e.name.endsWith('.ts') && rel !== SHADOW) {
          const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
          for (const m of src.matchAll(
            /(?:import|export)\s*\{([^}]*)\}\s*from\s*['"][^'"]*unified-navigation\.config['"]/g
          )) {
            const taken = m[1]
              .split(',')
              .map(s =>
                s
                  .trim()
                  .split(/\s+as\s+/)[0]
                  .trim()
              )
              .filter(Boolean)
            if (
              taken.some(n =>
                ['getParsingAccess', 'METAMUSE_STAFF_IDS'].includes(n)
              )
            ) {
              offenders.push(`${rel}: ${taken.join(', ')}`)
            }
          }
        }
      }
    }
    walk('src')
    expect(offenders).toEqual([])
  })

  it('pins the exact difference between the two staff lists', () => {
    const live = staffIds(read(LIVE), 'METAMUSE_STAFF_IDS')
    const shadow = staffIds(read(SHADOW), 'METAMUSE_STAFF_IDS')
    const onlyInShadow = shadow.filter(id => !live.includes(id))
    const onlyInLive = live.filter(id => !shadow.includes(id))

    // 7669741878 is @Arhustel, a shared account. Removing it from
    // the shadow copy, or adding it to the live one, is a permission decision
    // and belongs to the owner; either way this expectation has to be updated
    // deliberately rather than drift.
    expect(onlyInShadow).toEqual(['7669741878'])
    expect(onlyInLive).toEqual([])
  })
})
