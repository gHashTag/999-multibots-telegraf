/**
 * Тестовое окружение для юнит-прогонов (vitest).
 *
 * Сервисы генерации проверяют env-ключи ДО входа в мокнуемый fetch —
 * без этих значений даже чистые юнит-тесты падают на входе
 * «FAL_KEY not found in environment» (43 падения общего прогона),
 * хотя ни один внешний вызов не совершается: значения фиктивные,
 * реальные ключи тестам не нужны и не используются.
 */
process.env.FAL_KEY = process.env.FAL_KEY || 'test-fal-key'

/*
 * NO TEST REACHES THE NETWORK (apps/vibee-editor/packages/test-guard/no-network.mjs). Census of
 * 2026-10-08: five business-DM tests read the shared transcript from the
 * PRODUCTION render, /price asked Binance, CoinGecko and open.er-api, and the
 * lip-sync refund test queued a job at fal. fetch, DNS and TCP to any host
 * but this machine now fail the test that asked, by file and host.
 */
import { afterAll, afterEach, expect } from 'vitest'
import { installNoNetwork } from './apps/vibee-editor/packages/test-guard/no-network.mjs'

installNoNetwork({
  afterEach,
  afterAll,
  testPath: () => expect.getState().testPath,
})
