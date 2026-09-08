import { describe, it, expect } from 'vitest'
import { systemPrompt } from './src/agent/chat'
import { TOKEN_PRICES } from './src/agent/billing-shared'
import { ПАКЕТЫ, ценаТокенов } from './src/agent/token-packs' // cyrillic-ok: pre-existing names

/**
 * The prompt must never guess a price. Found live 2026-09-08: a client in
 * the owner's DM was offered "Basic 299 rub/month" -- a tariff that does
 * not exist -- and asked to pick one when they said they wanted to pay.
 * The numbers here come from the same price list the tools charge by.
 */
describe('the client in the owner DM (surface business)', () => {
  const p = systemPrompt('business')

  it('names the packs from the price list, not from memory', () => {
    for (const n of ПАКЕТЫ /* cyrillic-ok */) {
      const c = ценаТокенов(n) // cyrillic-ok: pre-existing helper name
      expect(p).toContain(`${n} токенов → ${c.звёзд}⭐`) // cyrillic-ok: pre-existing field name
    }
  })

  it('names the service prices from TOKEN_PRICES', () => {
    expect(p).toContain(`картинка ${TOKEN_PRICES.image_generate}`)
    expect(p).toContain(`видео ${TOKEN_PRICES.video_generate}`)
    expect(p).toContain(`озвучка ${TOKEN_PRICES.audio_generate}`)
    expect(p.includes('картинка 1,')).toBe(false)
  })

  it('denies tariffs and the club, and sends the invoice first', () => {
    expect(p).toContain('Тарифов,')
    expect(p).toContain('подписок и клуба для клиента НЕТ')
    expect(p).toContain('НЕ ПРЕДЛАГАЙ ОПЛАТУ САМ')
    expect(p).toContain('tokens_invoice')
    expect(p).toContain('my_balance')
    expect(p).not.toContain('$99')
    expect(p).not.toContain('Basic')
  })

  it('leaves no unfilled marker behind', () => {
    expect(p).not.toContain('%%')
    expect(systemPrompt('bot')).not.toContain('%%')
  })
})

describe('the creator in the app (other surfaces)', () => {
  /**
   * THIS ASSERTION WAS INVERTED ON PURPOSE, AND THAT IS THE CHANGE.
   *
   * It used to read `expect(o).toContain('$99')` -- the creator surface was
   * SUPPOSED to sell a club at ninety-nine and nine-hundred-ninety-nine
   * dollars a month. The owner's word on 2026-09-08:
   * "Мы продаем токены и все: текст, видео, фото. Всё привязывается к токену" (cyrillic-ok: the owner's own words)
   * There is no club, no subscription, no tariff, and there never was a
   * billing path for one -- so an agent quoting it was promising something
   * nobody could buy, in breach of its own playbook rule against promises
   * that are not in the price list.
   *
   * Weakening a test to let a change through is a smell; this is the other
   * case -- the test pinned the defect, so the fix has to move it.
   */
  it('sells tokens, not a club, and does not get the DM client rules', () => {
    const o = systemPrompt('bot')
    expect(o).not.toContain('$99')
    expect(o).not.toContain('$999')
    expect(o).not.toContain('Trinity Club')
    expect(o).toContain('ТАРИФОВ, ПОДПИСОК И КЛУБА НЕТ')
    expect(o).toContain('tokens_invoice')
    expect(o).not.toContain('ЕГО КЛИЕНТУ')
    expect(o).toContain(`картинка ${TOKEN_PRICES.image_generate}`)
  })

  it('names the packs to the creator too, from the price list', () => {
    const o = systemPrompt('bot')
    for (const n of ПАКЕТЫ /* cyrillic-ok */) {
      const c = ценаТокенов(n) // cyrillic-ok: pre-existing helper name
      expect(o).toContain(`${n} токенов → ${c.звёзд}⭐`) // cyrillic-ok: field name
    }
  })
})
