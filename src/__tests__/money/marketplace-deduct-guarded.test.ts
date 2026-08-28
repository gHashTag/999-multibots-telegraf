import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * purchaseItem must confirm the item exists before it deducts stars.
 *
 * WHY. marketplaceService is not wired to a live schema, so purchaseItem does
 * not move money today — but for the load-bearing reason, not the one its
 * header used to give. The header said "zero importers"; that is stale, the
 * marketplaceWizard scene imports purchaseItem and is registered
 * (ModeEnum.Marketplace), so a person CAN enter the scene. What keeps the
 * single deduct unreachable is that the backing tables are missing: getItem
 * returns null (PostgREST 42P01) and purchaseItem returns item_not_found
 * before updateUserBalance runs.
 *
 * That ordering — existence check dominates the deduct — is the safety
 * property, and it must survive refactors and the day the tables are created.
 * If the deduct ever moved above the getItem guard, a buyer could be charged
 * for an item that does not exist. This test reads the source, like the other
 * money seam tests here, and pins the order so it cannot slip silently.
 */

const strip = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const SRC = path.join('src', 'services', 'marketplaceService.ts')

function purchaseBody(): string {
  const src = strip(fs.readFileSync(SRC, 'utf8'))
  const start = src.indexOf('export async function purchaseItem')
  if (start === -1) return ''
  const rest = src.slice(start + 1)
  const end = rest.indexOf('\nexport ')
  return end === -1 ? rest : rest.slice(0, end)
}

describe('marketplace purchaseItem checks item existence before deducting', () => {
  it('the function is found — otherwise the checks below are empty', () => {
    expect(purchaseBody().length).toBeGreaterThan(0)
  })

  it('getItem is called before updateUserBalance', () => {
    const body = purchaseBody()
    const getItem = body.indexOf('getItem(')
    const deduct = body.indexOf('updateUserBalance(')
    expect(getItem, 'getItem not called in purchaseItem').toBeGreaterThan(-1)
    expect(deduct, 'no deduct in purchaseItem').toBeGreaterThan(-1)
    expect(
      getItem,
      `deduct at ${deduct} happens before the item is fetched at ${getItem}`
    ).toBeLessThan(deduct)
  })

  it('a not-found guard returns between the fetch and the deduct', () => {
    const body = purchaseBody()
    const getItem = body.indexOf('getItem(')
    const deduct = body.indexOf('updateUserBalance(')
    const between = body.slice(getItem, deduct)
    expect(between, 'no item_not_found guard before the deduct').toMatch(
      /item_not_found/
    )
    expect(between, 'no early return before the deduct').toMatch(/\breturn\b/)
  })
})
