/**
 * 🔄 Скрипт для переименования BOT_TOKEN_TEST_X → BOT_TOKEN_X
 *
 * ВНИМАНИЕ: Этот скрипт создаст новые секреты и удалит старые!
 * Запуск: npx tsx scripts/rename-tokens.ts
 */

import { config } from 'dotenv'
import { InfisicalSDK } from '@infisical/sdk'

config()

async function renameTokens() {
  console.log('🔄 [Rename] Переименование токенов в Infisical...\n')

  const client = new InfisicalSDK({
    siteUrl: 'https://app.infisical.com'
  })

  try {
    // Login
    await client.auth().universalAuth.login({
      clientId: process.env.INFISICAL_CLIENT_ID!,
      clientSecret: process.env.INFISICAL_CLIENT_SECRET!
    })

    const projectId = process.env.INFISICAL_PROJECT_ID!
    const environment = 'dev'

    console.log(`📊 [Rename] Environment: ${environment}`)
    console.log(`📊 [Rename] Project ID: ${projectId}\n`)

    // Шаг 1: Получить значения старых токенов
    console.log('🔍 [Rename] Шаг 1/3: Чтение старых токенов...')

    const result = await client.secrets().listSecrets({
      environment,
      projectId,
      secretPath: '/'
    })

    const token1 = result.secrets.find(s => s.secretKey === 'BOT_TOKEN_TEST_1')
    const token2 = result.secrets.find(s => s.secretKey === 'BOT_TOKEN_TEST_2')

    if (!token1) {
      console.error('   ❌ BOT_TOKEN_TEST_1 не найден!')
      throw new Error('BOT_TOKEN_TEST_1 not found')
    }

    if (!token2) {
      console.error('   ❌ BOT_TOKEN_TEST_2 не найден!')
      throw new Error('BOT_TOKEN_TEST_2 not found')
    }

    const token1Value = token1.secretValue
    const token2Value = token2.secretValue

    console.log('   ✅ BOT_TOKEN_TEST_1 прочитан')
    console.log('   ✅ BOT_TOKEN_TEST_2 прочитан')

    // Шаг 2: Создать новые токены
    console.log('\n📝 [Rename] Шаг 2/3: Создание новых токенов...')

    await client.secrets().createSecret({
      environment,
      projectId,
      secretName: 'BOT_TOKEN_1',
      secretValue: token1Value,
      secretPath: '/',
      type: 'shared'
    })
    console.log('   ✅ BOT_TOKEN_1 создан')

    await client.secrets().createSecret({
      environment,
      projectId,
      secretName: 'BOT_TOKEN_2',
      secretValue: token2Value,
      secretPath: '/',
      type: 'shared'
    })
    console.log('   ✅ BOT_TOKEN_2 создан')

    // Шаг 3: Удалить старые токены
    console.log('\n🗑️  [Rename] Шаг 3/3: Удаление старых токенов...')

    await client.secrets().deleteSecret({
      environment,
      projectId,
      secretName: 'BOT_TOKEN_TEST_1',
      secretPath: '/'
    })
    console.log('   ✅ BOT_TOKEN_TEST_1 удален')

    await client.secrets().deleteSecret({
      environment,
      projectId,
      secretName: 'BOT_TOKEN_TEST_2',
      secretPath: '/'
    })
    console.log('   ✅ BOT_TOKEN_TEST_2 удален')

    console.log('\n✅ [Rename] Переименование завершено успешно!')
    console.log('\n📋 [Rename] Что было сделано:')
    console.log('   ❌ Удалено: BOT_TOKEN_TEST_1, BOT_TOKEN_TEST_2')
    console.log('   ✅ Создано: BOT_TOKEN_1, BOT_TOKEN_2')
    console.log('\n🎯 [Rename] Следующий шаг: обновить код в src/index.ts')

  } catch (error) {
    console.error('\n❌ [Rename] Ошибка:', error)
    process.exit(1)
  }
}

// Запрашиваем подтверждение
console.log('⚠️  ВНИМАНИЕ! Этот скрипт удалит BOT_TOKEN_TEST_1 и BOT_TOKEN_TEST_2')
console.log('и создаст вместо них BOT_TOKEN_1 и BOT_TOKEN_2\n')
console.log('Для подтверждения запустите:')
console.log('CONFIRM=yes npx tsx scripts/rename-tokens.ts\n')

if (process.env.CONFIRM === 'yes') {
  renameTokens()
} else {
  console.log('❌ Отменено (не указан CONFIRM=yes)')
  process.exit(0)
}
