import { describe, expect, it } from 'vitest'
import { AGENT_PACKAGES } from '../agent-packages'
import {
  CRM_DASHBOARD,
  LEVEL_SHORTCUTS,
  USER_LEVELS,
  crmShows,
  levelOfPackage,
  levelOfPackages,
} from '../user-level'

describe('user levels', () => {
  it('every package sold is a level, and the developer is the twin package', () => {
    for (const pkg of AGENT_PACKAGES) {
      expect(USER_LEVELS).toContain(levelOfPackage(pkg.id))
    }
    expect(levelOfPackage('twin')).toBe('developer')
  })

  it('takes the highest paid package, and only an active one', () => {
    expect(levelOfPackages([])).toBeNull()
    expect(levelOfPackages([{ id: 'blogger', active: false }])).toBeNull()
    expect(
      levelOfPackages([
        { id: 'manager', active: true },
        { id: 'twin', active: true },
        { id: 'blogger', active: true },
      ])
    ).toBe('developer')
    expect(
      levelOfPackages([
        { id: 'manager', active: true },
        { id: 'blogger', active: true },
      ])
    ).toBe('blogger')
  })

  it('ignores a package id it does not know instead of guessing', () => {
    expect(levelOfPackages([{ id: 'nobody', active: true }])).toBeNull()
    expect(levelOfPackages([{ id: 'toString', active: true }])).toBeNull()
  })

  it('no level draws the whole CRM, exactly as the admin sees it', () => {
    for (const block of CRM_DASHBOARD.admin) {
      expect(crmShows(null, block)).toBe(true)
    }
  })

  it('gives each level a dashboard of its own', () => {
    const shapes = USER_LEVELS.map(l => [...CRM_DASHBOARD[l]].sort().join())
    expect(new Set(shapes).size).toBe(USER_LEVELS.length)
    for (const level of USER_LEVELS) {
      // Every block a level draws is one the screen has.
      for (const block of CRM_DASHBOARD[level]) {
        expect(CRM_DASHBOARD.admin).toContain(block)
      }
      expect(LEVEL_SHORTCUTS[level].length).toBeGreaterThan(0)
    }
  })

  it('a manager is not shown the money, a blogger is shown the audience', () => {
    expect(crmShows('manager', 'revenue')).toBe(false)
    expect(crmShows('manager', 'waiting')).toBe(true)
    expect(crmShows('blogger', 'audience')).toBe(true)
    expect(crmShows('blogger', 'funnel')).toBe(false)
    expect(crmShows('developer', 'revenue')).toBe(true)
  })
})
