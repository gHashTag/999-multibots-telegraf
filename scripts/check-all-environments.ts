#!/usr/bin/env tsx
/**
 * Проверяет все три окружения в Infisical
 */

import { config } from 'dotenv'
import { InfisicalSDK } from '@infisical/sdk'

config()

async function checkAllEnvironments() {
  console.log('🔍 Проверка всех окружений в Infisical...\n')

  const client = new InfisicalSDK({
    siteUrl: process.env.INFISICAL_SITE_URL || 'https://app.infisical.com',
  })

  await client.auth().universalAuth.login({
    clientId: process.env.INFISICAL_CLIENT_ID!,
    clientSecret: process.env.INFISICAL_CLIENT_SECRET!,
  })

  const projectId = process.env.INFISICAL_PROJECT_ID!
  const environments = ['dev', 'staging', 'prod'] as const

  for (const env of environments) {
    try {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(`📋 ОКРУЖЕНИЕ: ${env.toUpperCase()}`)
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

      const result = await client.secrets().listSecrets({
        projectId,
        environment: env,
        secretPath: '/',
      })

      console.log(`\n📦 Всего секретов: ${result.secrets.length}`)

      // Группируем по категориям
      const botTokens = result.secrets.filter(s => s.secretKey.startsWith('BOT_TOKEN'))
      const apiKeys = result.secrets.filter(s =>
        s.secretKey.includes('API_KEY') ||
        s.secretKey.includes('_KEY') ||
        s.secretKey.includes('TOKEN') && !s.secretKey.startsWith('BOT_TOKEN')
      )
      const supabase = result.secrets.filter(s => s.secretKey.startsWith('SUPABASE'))
      const inngest = result.secrets.filter(s => s.secretKey.includes('INNGEST'))
      const other = result.secrets.filter(s =>
        !botTokens.includes(s) &&
        !apiKeys.includes(s) &&
        !supabase.includes(s) &&
        !inngest.includes(s)
      )

      if (botTokens.length > 0) {
        console.log(`\n🤖 BOT Токены (${botTokens.length}):`)
        botTokens.forEach(s => console.log(`   - ${s.secretKey}`))
      }

      if (supabase.length > 0) {
        console.log(`\n💾 Supabase (${supabase.length}):`)
        supabase.forEach(s => console.log(`   - ${s.secretKey}`))
      }

      if (inngest.length > 0) {
        console.log(`\n⚡ Inngest (${inngest.length}):`)
        inngest.forEach(s => console.log(`   - ${s.secretKey}`))
      }

      if (apiKeys.length > 0) {
        console.log(`\n🔑 API Keys (${apiKeys.length}):`)
        apiKeys.forEach(s => console.log(`   - ${s.secretKey}`))
      }

      if (other.length > 0) {
        console.log(`\n📦 Другие (${other.length}):`)
        other.forEach(s => console.log(`   - ${s.secretKey}`))
      }

    } catch (error: any) {
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        console.log(`\n⚠️  Окружение ${env} не существует в Infisical`)
      } else {
        console.error(`\n❌ Ошибка при проверке ${env}:`, error.message)
      }
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✅ Проверка завершена')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

checkAllEnvironments().catch(console.error)
