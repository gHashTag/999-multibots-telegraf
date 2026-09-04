import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { KIE_WEB_MODELS, reviewedKieModel } from './src/agent/kie-web-provider'
import { priceForKieModel } from './src/agent/billing-shared'

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
    for (const [kind, models] of Object.entries(KIE_WEB_MODELS)) {
      // Каждый вид обязан что-то допускать: пустое множество означало бы
      // молча выключенный вид, а не строгую проверку.
      expect(models.size).toBeGreaterThan(0)
      for (const model of models) {
        expect(
          reviewedKieModel(kind as keyof typeof KIE_WEB_MODELS, `kie/${model}`)
        ).toBe(model)
      }
      expect(() =>
        reviewedKieModel(kind as keyof typeof KIE_WEB_MODELS, 'kie/other/model')
      ).toThrow(/not enabled/)
    }
    expect(reviewedKieModel('image', 'fal-ai/flux/dev')).toBeNull()
  })

  it('никогда не допускает опасную модель и модель без цены', () => {
    // grok-imagine/image-to-video создаёт ПЛАТНОЕ задание на пустой запрос.
    for (const models of Object.values(KIE_WEB_MODELS)) {
      expect(models.has('grok-imagine/image-to-video')).toBe(false)
    }
    // Цена известна у каждой допущенной: иначе сумму нечем назвать до нажатия.
    for (const models of Object.values(KIE_WEB_MODELS)) {
      for (const m of models) expect(priceForKieModel(m)).not.toBeNull()
    }
  })
})
