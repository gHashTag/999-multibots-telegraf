/**
 * 🔬 Анализ различий Robokassa между development и production
 * Проверяем, как работала старая версия vs новая в разных режимах
 */

import { describe, test, expect } from 'vitest'

describe('🔬 Robokassa Development vs Production Analysis', () => {
  test('🌍 Симуляция различий между development и production', () => {
    console.log('📋 [DEV-PROD] Анализ различий между режимами...')

    // Симулируем переменные окружения для development
    const devEnv = {
      NODE_ENV: 'development',
      isDev: true,
      RESULT_URL2: 'https://ai-server-u14194.vm.elestio.app/payment-success',
      API_SERVER_URL: 'https://ai-server-u14194.vm.elestio.app',
      AI_SERVER_LOCAL_URL: 'https://d8dc81a4a0aa.ngrok.app',
    }

    // Симулируем переменные окружения для production
    const prodEnv = {
      NODE_ENV: 'production',
      isDev: false,
      RESULT_URL2: 'https://ai-server-u14194.vm.elestio.app/payment-success',
      API_SERVER_URL: 'https://ai-server-u14194.vm.elestio.app',
      AI_SERVER_LOCAL_URL: undefined,
    }

    console.log('🔧 [DEV-PROD] Development Environment:', devEnv)
    console.log('🔧 [DEV-PROD] Production Environment:', prodEnv)

    // Симулируем логику формирования BASE_PAYMENT_URL из config/index.ts

    // СТАРАЯ ВЕРСИЯ (до 5 августа):
    // resultUrl2 = RESULT_URL2
    const oldVersionDevUrl = devEnv.RESULT_URL2
    const oldVersionProdUrl = prodEnv.RESULT_URL2

    // НОВАЯ ВЕРСИЯ (после 5 августа):
    // resultUrl2 = UNIFIED_RESULT_URL
    // const BASE_PAYMENT_URL = isDev ? API_SERVER_URL || 'https://ai-server-u14194.vm.elestio.app' : API_SERVER_URL || RESULT_URL2?.split('/payment-success')[0] || 'https://ai-server-u14194.vm.elestio.app'

    const newVersionDevBaseUrl = devEnv.isDev
      ? devEnv.API_SERVER_URL || 'https://ai-server-u14194.vm.elestio.app'
      : devEnv.API_SERVER_URL ||
        devEnv.RESULT_URL2?.split('/payment-success')[0] ||
        'https://ai-server-u14194.vm.elestio.app'

    const newVersionProdBaseUrl = prodEnv.isDev
      ? prodEnv.API_SERVER_URL || 'https://ai-server-u14194.vm.elestio.app'
      : prodEnv.API_SERVER_URL ||
        prodEnv.RESULT_URL2?.split('/payment-success')[0] ||
        'https://ai-server-u14194.vm.elestio.app'

    const newVersionDevUrl = `${newVersionDevBaseUrl}/payment-success`
    const newVersionProdUrl = `${newVersionProdBaseUrl}/payment-success`

    console.log('📊 [DEV-PROD] === СРАВНЕНИЕ СТАРОЙ И НОВОЙ ВЕРСИИ ===')
    console.log('🔗 [DEV-PROD] СТАРАЯ ВЕРСИЯ (resultUrl2 = RESULT_URL2):')
    console.log(`🔗 [DEV-PROD]   Development: ${oldVersionDevUrl}`)
    console.log(`🔗 [DEV-PROD]   Production:  ${oldVersionProdUrl}`)

    console.log('🔗 [DEV-PROD] НОВАЯ ВЕРСИЯ (resultUrl2 = UNIFIED_RESULT_URL):')
    console.log(`🔗 [DEV-PROD]   Development: ${newVersionDevUrl}`)
    console.log(`🔗 [DEV-PROD]   Production:  ${newVersionProdUrl}`)

    // Анализируем различия
    const devChanged = oldVersionDevUrl !== newVersionDevUrl
    const prodChanged = oldVersionProdUrl !== newVersionProdUrl

    console.log('🔍 [DEV-PROD] === АНАЛИЗ ИЗМЕНЕНИЙ ===')
    console.log(
      `🔍 [DEV-PROD] Development изменился: ${devChanged ? '❌ ДА' : '✅ НЕТ'}`
    )
    console.log(
      `🔍 [DEV-PROD] Production изменился:  ${prodChanged ? '❌ ДА' : '✅ НЕТ'}`
    )

    if (devChanged) {
      console.log(`⚠️ [DEV-PROD] Development ИЗМЕНЕНИЕ:`)
      console.log(`⚠️ [DEV-PROD]   Было: ${oldVersionDevUrl}`)
      console.log(`⚠️ [DEV-PROD]   Стало: ${newVersionDevUrl}`)
    }

    if (prodChanged) {
      console.log(`⚠️ [DEV-PROD] Production ИЗМЕНЕНИЕ:`)
      console.log(`⚠️ [DEV-PROD]   Было: ${oldVersionProdUrl}`)
      console.log(`⚠️ [DEV-PROD]   Стало: ${newVersionProdUrl}`)
    }

    // Проверяем тесты
    expect(oldVersionDevUrl).toBeDefined()
    expect(oldVersionProdUrl).toBeDefined()
    expect(newVersionDevUrl).toBeDefined()
    expect(newVersionProdUrl).toBeDefined()

    // В данном случае URL должны быть одинаковыми
    expect(oldVersionDevUrl).toBe(newVersionDevUrl)
    expect(oldVersionProdUrl).toBe(newVersionProdUrl)

    if (!devChanged && !prodChanged) {
      console.log(
        '✅ [DEV-PROD] ВЫВОД: Изменения НЕ повлияли на formирование URL в любом режиме!'
      )
    }
  })

  test('🔍 Детальный анализ логики UNIFIED_RESULT_URL', () => {
    console.log('📋 [UNIFIED] Анализ логики формирования UNIFIED_RESULT_URL...')

    // Исходная логика из config/index.ts:
    // const BASE_PAYMENT_URL = isDev
    //   ? API_SERVER_URL || 'https://ai-server-u14194.vm.elestio.app' // ⚠️ КРИТИЧНО: Robokassa требует публичный URL!
    //   : API_SERVER_URL ||
    //     RESULT_URL2?.split('/payment-success')[0] ||
    //     'https://ai-server-u14194.vm.elestio.app'

    const scenarios = [
      {
        name: 'Development с API_SERVER_URL',
        isDev: true,
        API_SERVER_URL: 'https://ai-server-u14194.vm.elestio.app',
        RESULT_URL2: 'https://ai-server-u14194.vm.elestio.app/payment-success',
      },
      {
        name: 'Development без API_SERVER_URL',
        isDev: true,
        API_SERVER_URL: undefined,
        RESULT_URL2: 'https://ai-server-u14194.vm.elestio.app/payment-success',
      },
      {
        name: 'Production с API_SERVER_URL',
        isDev: false,
        API_SERVER_URL: 'https://ai-server-u14194.vm.elestio.app',
        RESULT_URL2: 'https://ai-server-u14194.vm.elestio.app/payment-success',
      },
      {
        name: 'Production без API_SERVER_URL',
        isDev: false,
        API_SERVER_URL: undefined,
        RESULT_URL2: 'https://ai-server-u14194.vm.elestio.app/payment-success',
      },
    ]

    scenarios.forEach((scenario, index) => {
      console.log(`🧪 [UNIFIED] Сценарий ${index + 1}: ${scenario.name}`)

      const BASE_PAYMENT_URL = scenario.isDev
        ? scenario.API_SERVER_URL || 'https://ai-server-u14194.vm.elestio.app'
        : scenario.API_SERVER_URL ||
          scenario.RESULT_URL2?.split('/payment-success')[0] ||
          'https://ai-server-u14194.vm.elestio.app'

      const UNIFIED_RESULT_URL = `${BASE_PAYMENT_URL}/payment-success`

      console.log(`🔗 [UNIFIED]   BASE_PAYMENT_URL: ${BASE_PAYMENT_URL}`)
      console.log(`🔗 [UNIFIED]   UNIFIED_RESULT_URL: ${UNIFIED_RESULT_URL}`)
      console.log(
        `🔗 [UNIFIED]   Original RESULT_URL2: ${scenario.RESULT_URL2}`
      )

      const isIdentical = UNIFIED_RESULT_URL === scenario.RESULT_URL2
      console.log(
        `✅ [UNIFIED]   Идентичен с RESULT_URL2: ${isIdentical ? 'ДА' : 'НЕТ'}`
      )

      if (!isIdentical) {
        console.log(`❌ [UNIFIED]   РАЗЛИЧИЕ НАЙДЕНО!`)
        console.log(`❌ [UNIFIED]     RESULT_URL2: ${scenario.RESULT_URL2}`)
        console.log(
          `❌ [UNIFIED]     UNIFIED_RESULT_URL: ${UNIFIED_RESULT_URL}`
        )
      }

      // Тестируем
      expect(UNIFIED_RESULT_URL).toBeDefined()
      expect(UNIFIED_RESULT_URL).toContain('/payment-success')
    })
  })
})
