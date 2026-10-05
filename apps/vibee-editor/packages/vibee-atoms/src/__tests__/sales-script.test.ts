import { describe, expect, it } from 'vitest'
import {
  AGENT_PACKAGES,
  agentPackageById,
  agentPackageStars,
  agentPackageUsd,
} from '../agent-packages'
import {
  monthOutcome,
  perReel,
  salesFollowUps,
  salesObjections,
  salesScriptText,
  salesSteps,
} from '../sales-script'
import {
  MONTH_DAYS,
  monthTokens,
  PORTRAIT_TOKENS,
  reelsIn,
  START_TOKENS,
  WARN_DAYS_FIRST,
} from '../token-wallet'

const blogger = agentPackageById('blogger')!
const manager = agentPackageById('manager')!

describe('the sales script', () => {
  it('asks one question first and states the price only after the value and the proof', () => {
    for (const pkg of AGENT_PACKAGES)
      expect(salesSteps(pkg).map(s => s.id)).toEqual([
        'hello',
        'goal',
        'discover',
        'value',
        'proof',
        'offer',
        'close',
      ])
  })

  it('names the price from the catalogue, never typed by hand', () => {
    for (const pkg of AGENT_PACKAGES) {
      const offer = salesSteps(pkg).find(s => s.id === 'offer')!
      for (const lang of ['en', 'ru'] as const) {
        expect(offer.say[lang]).toContain(`$${agentPackageUsd(pkg)}`)
        expect(offer.say[lang]).toContain(
          agentPackageStars(pkg).toLocaleString(
            lang === 'ru' ? 'ru-RU' : 'en-US'
          )
        )
        expect(offer.say[lang]).toContain(`${MONTH_DAYS}`)
        expect(offer.say[lang]).toContain(`${WARN_DAYS_FIRST}`)
      }
    }
  })

  it('sells a content agent in reels and a price per reel from the wallet', () => {
    const reels = reelsIn(monthTokens(blogger.allowanceUsd))
    expect(monthOutcome(blogger).en).toContain(`≈${reels} reels`)
    expect(perReel(blogger)).toBe(
      Math.round((agentPackageUsd(blogger) / reels) * 100) / 100
    )
    expect(monthOutcome(blogger).en).toContain(`$${perReel(blogger)}`)
  })

  it('never offers reels with the Manager Agent: a text model for the CRM', () => {
    const text = [
      salesScriptText(manager, 'en'),
      salesScriptText(manager, 'ru'),
    ]
    for (const t of text) {
      expect(t).not.toMatch(/≈\d+ reels|рилсов с вашим лицом/) // cyrillic-ok
      expect(t).not.toMatch(/channel should the reels|канал пойдут рилсы/) // cyrillic-ok
    }
    expect(monthOutcome(manager).en).toContain(
      monthTokens(manager.allowanceUsd).toLocaleString('en-US')
    )
  })

  it('offers the free first step with the gift the wallet really gives', () => {
    const proof = salesSteps(blogger).find(s => s.id === 'proof')!
    expect(proof.say.en).toContain(`${START_TOKENS} free tokens`)
    expect(proof.say.en).toContain(`(${PORTRAIT_TOKENS} tokens)`)
  })

  it('answers the five objections in both languages and follows up three times', () => {
    for (const pkg of AGENT_PACKAGES) {
      const answers = salesObjections(pkg)
      expect(answers).toHaveLength(5)
      for (const o of answers)
        for (const lang of ['en', 'ru'] as const) {
          expect(o.heard[lang].length).toBeGreaterThan(0)
          expect(o.answer[lang].length).toBeGreaterThan(0)
        }
      expect(salesFollowUps(pkg).map(f => f.afterHours)).toEqual([24, 72, 168])
    }
  })

  it('does not promise what the platform cannot do yet', () => {
    for (const pkg of AGENT_PACKAGES) {
      const t = salesScriptText(pkg, 'en')
      expect(t).not.toMatch(/refund|money back|guarantee/i)
      expect(t).not.toMatch(/\bburn/i)
    }
  })
})
