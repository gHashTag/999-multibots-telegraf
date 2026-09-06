import { describe, it, expect, beforeEach, vi } from 'vitest'

// ResultURL для Robokassa — это серверный webhook подтверждения платежа
// (getRuBillWizard/helper.ts:128). Если он уедет на несуществующий хост,
// подтверждение оплаты не дойдёт и баланс не пополнится. Проверяем именно
// цепочку fallback, а не то, что переменная «где-то задана».
describe('BASE_PAYMENT_URL: цепочка не должна падать на мёртвый домен', () => {
  const DEAD = 'three-head-dragon.shop'

  beforeEach(() => {
    vi.resetModules()
    for (const k of [
      'API_SERVER_URL',
      'RESULT_URL2',
      'SERVER_PUBLIC_URL',
      'BASE_WEBHOOK_URL',
      'CLOUDFLARE_TUNNEL_URL',
    ]) {
      /*
       * ПУСТАЯ СТРОКА, А НЕ `delete`.
       *
       * `@/config` при импорте поднимает `.env` через dotenv, а `.env` на
       * машине разработчика содержит `RESULT_URL2`. Удалённый ключ dotenv
       * ВОССТАНАВЛИВАЕТ (он пропускает только уже существующие), поэтому
       * `vi.resetModules()` + повторный импорт возвращали переменную, и
       * цепочка выбирала её раньше `BASE_WEBHOOK_URL`.
       *
       * Тест при этом мерил не код, а наличие `.env`: на чистой машине
       * зелёный, у владельца красный. Пустая строка переживает dotenv и
       * ложна для всех `||` в цепочке.
       */
      process.env[k] = ''
    }
    process.env.NODE_ENV = 'production'
  })

  it('в проде берёт BASE_WEBHOOK_URL, когда трёх других переменных нет', async () => {
    // Ровно та конфигурация, что стоит на Railway: задана только эта.
    process.env.BASE_WEBHOOK_URL =
      'https://999-multibots-telegraf-production-2008.up.railway.app'
    const { UNIFIED_RESULT_URL } = await import('@/config')
    expect(UNIFIED_RESULT_URL).toContain(
      '999-multibots-telegraf-production-2008'
    )
    expect(UNIFIED_RESULT_URL).not.toContain(DEAD)
  })

  it('API_SERVER_URL по-прежнему имеет приоритет — прежнее поведение не сломано', async () => {
    process.env.API_SERVER_URL = 'https://explicit.example'
    process.env.BASE_WEBHOOK_URL = 'https://fallback.example'
    const { UNIFIED_RESULT_URL } = await import('@/config')
    expect(UNIFIED_RESULT_URL).toContain('explicit.example')
  })
})
