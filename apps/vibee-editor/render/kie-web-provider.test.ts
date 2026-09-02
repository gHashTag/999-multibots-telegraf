import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { KIE_WEB_MODEL, reviewedKieModel } from './src/agent/kie-web-provider'

const server = fs.readFileSync(path.join(__dirname, 'render-server.ts'), 'utf8')

describe('reviewed Kie provider routes', () => {
  it.each([
    ['/api/generate/image', 'kieGenerateImage'],
    ['/api/generate/video', 'runExplicitKieJob'],
    ['/api/generate/audio', 'runExplicitKieJob'],
    ['/api/generate/lipsync', 'runExplicitKieJob'],
  ])('%s honors an explicit Kie model', (route, call) => {
    const start = server.indexOf(`req.url === '${route}'`)
    const next = server.indexOf('req.url === ', start + route.length + 20)
    const handler = server.slice(start, next === -1 ? start + 18_000 : next)
    expect(start).toBeGreaterThan(-1)
    expect(handler).toContain("startsWith('kie/')")
    expect(handler).toContain('reviewedKieModel')
    expect(handler).toContain(call)
  })

  it('keeps the provider key inside the server-side transport helper', () => {
    const helperStart = server.indexOf('async function runExplicitKieJob')
    const helperEnd = server.indexOf('\n/**', helperStart)
    const helper = server.slice(helperStart, helperEnd)
    expect(helper).not.toContain('res.end')
    expect(helper).not.toContain('JSON.stringify')
  })

  it('rejects arbitrary paid model ids at the server boundary', () => {
    for (const [kind, model] of Object.entries(KIE_WEB_MODEL)) {
      expect(
        reviewedKieModel(kind as keyof typeof KIE_WEB_MODEL, `kie/${model}`)
      ).toBe(model)
      expect(() =>
        reviewedKieModel(kind as keyof typeof KIE_WEB_MODEL, 'kie/other/model')
      ).toThrow(/not enabled/)
    }
    expect(reviewedKieModel('image', 'fal-ai/flux/dev')).toBeNull()
  })
})
