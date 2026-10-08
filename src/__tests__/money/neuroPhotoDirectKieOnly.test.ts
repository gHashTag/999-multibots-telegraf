/**
 * AST ratchet: NeuroPhoto generation goes through kie.ai and nothing else.
 *
 * Owner's kie-only rule (2026-10-02, restated more than once since): every
 * generated asset is made on Kie. Replicate and fal were measured dead on
 * 2026-10-03 -- Replicate answered 402 "account has been temporarily
 * disabled", fal held balance 0.0 -- and the production incident that removed
 * them (user 435572800, 16:48) was exactly this pipeline falling through the
 * dead pair to a 402. Replacing the old fal-timeout ratchet: the floor is no
 * longer "fal has a timeout" but "generation calls Kie", and the ceiling
 * keeps both dead providers and their imports out of the service.
 */
import { describe, expect, it } from 'vitest'
import * as ts from 'typescript'
import { readFileSync } from 'node:fs'

const SERVICE_URL = new URL(
  '../../services/generateNeuroPhotoDirect.ts',
  import.meta.url
)
const source = readFileSync(SERVICE_URL, 'utf-8')

interface Analysis {
  kieCalls: number
  deadProviderCalls: string[]
  deadImports: string[]
}

function analyze(src: string): Analysis {
  const ast = ts.createSourceFile(
    'generateNeuroPhotoDirect.ts',
    src,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS
  )

  let kieCalls = 0
  const deadProviderCalls: string[] = []
  const deadImports: string[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === 'generateNeuroPhotoViaKie') kieCalls++
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression)
    ) {
      const obj = node.expression.expression.text
      if (obj === 'fal' || obj === 'replicate') {
        deadProviderCalls.push(`${obj}.${node.expression.name.text}`)
      }
    }
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const spec = node.moduleSpecifier.text
      if (spec === '@fal-ai/client' || /(^|\/)core\/replicate$/.test(spec)) {
        deadImports.push(spec)
      }
    }
    node.forEachChild(visit)
  }
  visit(ast)

  return { kieCalls, deadProviderCalls, deadImports }
}

describe('generateNeuroPhotoDirect: kie-only (owner rule, 2026-10-02)', () => {
  it('FLOOR: generation runs through generateNeuroPhotoViaKie', () => {
    const a = analyze(source)
    expect(
      a.kieCalls,
      'NeuroPhoto Direct must call generateNeuroPhotoViaKie -- it is the ' +
        'only image provider left (kie-only). If this is red, the Kie call ' +
        'was renamed or removed.'
    ).toBeGreaterThanOrEqual(1)
  })

  it('CEILING: no call on the fal/replicate clients', () => {
    const a = analyze(source)
    expect(
      a.deadProviderCalls,
      'kie-only (owner, 2026-10-02): Replicate is 402-disabled and fal holds ' +
        'balance 0.0 (measured 2026-10-03). Any fal.*/replicate.* call here ' +
        'is a route back to a dead provider: ' +
        a.deadProviderCalls.join(', ')
    ).toEqual([])
  })

  it('CEILING: no import of the fal/replicate clients', () => {
    const a = analyze(source)
    expect(
      a.deadImports,
      'kie-only (owner, 2026-10-02): importing a dead provider is how a ' +
        'fallback silently comes back: ' +
        a.deadImports.join(', ')
    ).toEqual([])
  })

  it('SELF-CHECK: the detector sees the defect it exists for', () => {
    const bad = `
      import { fal } from '@fal-ai/client'
      import { replicate } from '../core/replicate'
      export async function gen(p: string) {
        await fal.subscribe('flux', { input: { prompt: p } })
        await replicate.run('sdxl', { input: { prompt: p } })
        return p
      }
    `
    const a = analyze(bad)
    expect(a.deadProviderCalls).toEqual(['fal.subscribe', 'replicate.run'])
    expect(a.deadImports).toEqual(['@fal-ai/client', '../core/replicate'])
    expect(a.kieCalls).toBe(0)
  })

  it('SELF-CHECK: the detector passes the compliant shape', () => {
    const good = `
      import { generateNeuroPhotoViaKie } from './generateNeuroPhotoKie'
      export async function gen(p: string) {
        return generateNeuroPhotoViaKie(p, '9:16')
      }
    `
    const a = analyze(good)
    expect(a.kieCalls).toBe(1)
    expect(a.deadProviderCalls).toEqual([])
    expect(a.deadImports).toEqual([])
  })

  it('MUTATION: renaming the Kie call away turns the floor red', () => {
    // Proof the floor has teeth: strip the Kie call from the real source and
    // the count the floor asserts on collapses to zero.
    const mutated = source.replace(
      /generateNeuroPhotoViaKie/g,
      'generateNeuroPhotoViaSomethingElse'
    )
    expect(analyze(mutated).kieCalls).toBe(0)
  })
})
